#!/bin/sh
# Removes HyprKWin completely.
# Hyprland mode is turned off first, so every KDE setting and shortcut it changed is put back exactly as it was.
BIN="$HOME/.local/bin"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CFG="${XDG_CONFIG_HOME:-$HOME/.config}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "Uninstalling HyprKWin..."

# 1. put KDE back the way it was
if [ -x "$BIN/hyprkwin" ]; then
    "$BIN/hyprkwin" off >/dev/null 2>&1 || true
fi

# 2. clear what's left in KDE's config: HyprKWin's own shortcut entries and settings
CHECKER=""
for p in "$DATA/hyprkwin/check-keybinds.py" "$HERE/check-keybinds.py"; do
    [ -f "$p" ] && CHECKER="$p" && break
done
if [ -n "$CHECKER" ] && command -v python3 >/dev/null 2>&1 && command -v kwriteconfig6 >/dev/null 2>&1; then
    python3 - "$CHECKER" "$CFG" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("k", sys.argv[1]); k = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True; spec.loader.exec_module(k)
cfg = sys.argv[2]
sc = os.path.join(cfg, "kglobalshortcutsrc")
if os.path.exists(sc):
    for key in list(k.read_kconfig(sc).get(("kwin",), {})):
        if key.startswith("HyprKWin: "):
            k.kwrite(sc, ("kwin",), key, None)
rc = os.path.join(cfg, "kwinrc")
if os.path.exists(rc):
    for key in list(k.read_kconfig(rc).get(("Script-hyprkwin",), {})):
        k.kwrite(rc, ("Script-hyprkwin",), key, None)
    for key in ("hyprkwinEnabled", "hyprkwin_animationsEnabled", "dwindletilingEnabled"):
        k.kwrite(rc, ("Plugins",), key, None)
PY
fi

# 3. remove the packages (and the early single-layout version, if it's there)
kpackagetool6 --type=KWin/Script --remove hyprkwin >/dev/null 2>&1
kpackagetool6 --type=KWin/Effect --remove hyprkwin_animations >/dev/null 2>&1
kpackagetool6 --type=KWin/Script --remove dwindletiling >/dev/null 2>&1
rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}"/kwin*/qmlcache 2>/dev/null

# 4. remove the app, the command and HyprKWin's own files (keep.conf, your protected keys, is kept)
rm -f "$BIN/hyprkwin" "$DATA/applications/hyprkwin.desktop" "$DATA/applications/hyprkwin-setup.desktop"
rm -rf "$DATA/hyprkwin"
rm -f "$CFG/hyprkwin/state.json" "$CFG/hyprkwin/clash-report.txt"
rmdir "$CFG/hyprkwin" 2>/dev/null
rm -rf "$CFG/hyprkwin-backup"
command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1

if command -v qdbus6 >/dev/null 2>&1; then
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript hyprkwin >/dev/null 2>&1
    qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect hyprkwin_animations >/dev/null 2>&1
    qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1
fi

echo "HyprKWin is uninstalled and your KDE settings are back as they were."
echo "Log out and back in once to finish."
