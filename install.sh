#!/bin/sh
# Installs (or updates) HyprKWin for the current user. Nothing outside your home folder is touched.
#   ./install.sh          install, then ask whether to turn Hyprland mode on
#   ./install.sh --on     install and turn it on
#   ./install.sh --off    install and leave it off
set -e
cd "$(dirname "$0")"

for tool in kpackagetool6 kwriteconfig6 python3; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "HyprKWin needs KDE Plasma 6 and python3 ('$tool' is missing)."
        exit 1
    fi
done

BIN="$HOME/.local/bin"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}"

install_pkg() {
    kpackagetool6 --type="$1" --install "$2" >/dev/null 2>&1 || kpackagetool6 --type="$1" --upgrade "$2" >/dev/null
}

echo "Installing HyprKWin..."
install_pkg KWin/Script script
install_pkg KWin/Effect effect
# drop compiled copies of an older version (KWin can otherwise keep running stale code)
rm -rf "$CACHE"/kwin*/qmlcache 2>/dev/null || true

# the switch: a command, and an app in the menu
mkdir -p "$BIN" "$DATA/hyprkwin" "$DATA/applications"
cp hyprkwin "$BIN/hyprkwin"
cp check-keybinds.py "$DATA/hyprkwin/check-keybinds.py"
cp uninstall.sh README.md cheatsheet.md "$DATA/hyprkwin/"
[ -f cheatsheet.html ] || python3 md2html.py cheatsheet.md cheatsheet.html
cp cheatsheet.html "$DATA/hyprkwin/"
chmod +x "$BIN/hyprkwin" "$DATA/hyprkwin/check-keybinds.py" "$DATA/hyprkwin/uninstall.sh"
sed "s|@BIN@|$BIN|" hyprkwin.desktop > "$DATA/applications/hyprkwin.desktop"
command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true

# earlier versions shipped these; the switch replaces them
rm -f "$BIN/hyprland-feel.sh" "$BIN/hyprland-feel-undo.sh" 2>/dev/null || true

echo "Installed. Open \"HyprKWin\" from your app menu to switch Hyprland mode on or off,"
echo "or run: $BIN/hyprkwin on | off | status"

choice="$1"
CFGDIR="${XDG_CONFIG_HOME:-$HOME/.config}"
# switching over from the old hyprland-feel.sh preset: let the switch take over its backup
if [ -z "$choice" ] && [ -d "$CFGDIR/hyprkwin-backup" ] && [ ! -f "$CFGDIR/hyprkwin/state.json" ]; then
    choice="--on"
fi
if [ -z "$choice" ]; then
    if "$BIN/hyprkwin" status 2>/dev/null | grep -q "mode: on"; then
        choice="--keep"
    elif [ -t 0 ]; then
        printf "Turn Hyprland mode on now? [Y/n] "
        read -r answer
        case "$answer" in n*|N*) choice="--off" ;; *) choice="--on" ;; esac
    else
        choice="--off"
    fi
fi

case "$choice" in
    --on)
        "$BIN/hyprkwin" on
        ;;
    --keep)
        # already on: reload the updated script so it takes over at the next login
        if command -v qdbus6 >/dev/null 2>&1; then
            qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript hyprkwin >/dev/null 2>&1 || true
            qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1 || true
            qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null 2>&1 || true
        fi
        # re-apply settings and shortcuts cleanly (off, then on) so nothing from the old version lingers
        "$BIN/hyprkwin" refresh </dev/null >/dev/null 2>&1 || true
        echo "Hyprland mode stays on and was re-applied. Log out and back in now to load the updated version."
        ;;
esac
