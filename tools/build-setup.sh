#!/bin/sh
# Builds dist/HyprKWin-Setup.sh: one self-extracting file with the package inside and an
# Install / Update / Uninstall front end (KDE dialogs, or a terminal menu).
#   tools/build-setup.sh            -> dist/HyprKWin-Setup.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/HyprKWin-Setup.sh"
VERSION=$(python3 -c "import json;print(json.load(open('$ROOT/script/metadata.json'))['KPlugin']['Version'])")

# the package: what install.sh needs, in a folder called hyprkwin
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
PKG="$STAGE/hyprkwin"
mkdir -p "$PKG"
cp -r "$ROOT/script" "$ROOT/effect" "$PKG/"
cp "$ROOT/hyprkwin" "$ROOT/check-keybinds.py" "$ROOT/install.sh" "$ROOT/uninstall.sh" "$ROOT/hyprkwin.desktop" \
   "$ROOT/cheatsheet.md" "$ROOT/md2html.py" "$ROOT/README.md" "$PKG/"
python3 "$ROOT/md2html.py" "$PKG/cheatsheet.md" "$PKG/cheatsheet.html"
chmod +x "$PKG/hyprkwin" "$PKG/install.sh" "$PKG/uninstall.sh" "$PKG/check-keybinds.py"

mkdir -p "$ROOT/dist"
{
sed "s/@VERSION@/$VERSION/g" <<'HEAD'
#!/bin/sh
# HyprKWin Setup @VERSION@ — Hyprland's tiling, keybindings and animations for KDE Plasma 6.
#
# Double-click this file (or run: sh HyprKWin-Setup.sh) to install, update or uninstall.
#
#   sh HyprKWin-Setup.sh --install [--on|--off] [--gaming-desktop=N|none]   install without questions
#   sh HyprKWin-Setup.sh --uninstall              uninstall without questions
#   sh HyprKWin-Setup.sh --text                   use the terminal instead of dialogs
#   sh HyprKWin-Setup.sh --extract                just unpack the files into ./hyprkwin
#
# Everything goes into your home folder. Uninstalling puts your KDE settings back exactly as they were.
VERSION="@VERSION@"
SELF="$(readlink -f "$0" 2>/dev/null || echo "$0")"
BIN="$HOME/.local/bin"
TITLE="HyprKWin Setup $VERSION"

unpack() {
    sed '1,/^__PAYLOAD__$/d' "$SELF" | base64 -d | tar xz -C "$1"
}

if [ "$1" = "--extract" ]; then
    unpack .
    echo "Unpacked into ./hyprkwin"
    exit 0
fi

# ---- how to talk to the user ----------------------------------------------------------
MODE=text
if [ "$1" != "--text" ] && command -v kdialog >/dev/null 2>&1 && [ -n "$WAYLAND_DISPLAY$DISPLAY" ]; then
    MODE=gui
fi
if [ "$MODE" = text ] && [ ! -t 0 ] && [ -z "$1" ] && [ -z "$HYPRKWIN_SETUP_TERM" ]; then
    # double-clicked without kdialog: reopen in a terminal
    export HYPRKWIN_SETUP_TERM=1
    for t in "konsole -e" "kgx --" "gnome-terminal --" "alacritty -e" "kitty" "foot" "xterm -e"; do
        set -- $t
        if command -v "$1" >/dev/null 2>&1; then
            exec "$@" sh "$SELF" --text
        fi
    done
fi

say()     { if [ "$MODE" = gui ] && [ -z "$QUIET" ]; then kdialog --title "$TITLE" --msgbox "$1"; else printf '\n%s\n' "$1"; fi; }
fail()    { if [ "$MODE" = gui ]; then kdialog --title "$TITLE" --error "$1"; else printf '\nError: %s\n' "$1"; fi; }
ask()     { # ask "question" "yes label" "no label"
    if [ "$MODE" = gui ]; then
        kdialog --title "$TITLE" --yes-label "$2" --no-label "$3" --yesno "$1"
    else
        printf '\n%s [y/N] ' "$1"; read -r a; case "$a" in y*|Y*) return 0 ;; *) return 1 ;; esac
    fi
}
offer_logout() {
    if [ -n "$QUIET" ]; then printf '%s\nLog out and back in now to finish.\n' "$1"; return; fi
    if ask "$1

Log out and back in now to finish. Do it before changing anything else, so KDE doesn't put its old shortcuts back." "Log out now (recommended)" "Later"; then
        qdbus6 org.kde.Shutdown /Shutdown org.kde.Shutdown.logout 2>/dev/null \
            || qdbus org.kde.Shutdown /Shutdown org.kde.Shutdown.logout 2>/dev/null
    fi
}
finish() {
    if [ -n "$HYPRKWIN_SETUP_TERM" ]; then printf '\nPress Enter to close. '; read -r _; fi
    exit "${1:-0}"
}

# ---- checks ----------------------------------------------------------------------------
for tool in kpackagetool6 kwriteconfig6 python3 base64 tar; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        fail "HyprKWin needs KDE Plasma 6 and python3. Missing: $tool"
        finish 1
    fi
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if ! unpack "$TMP" || [ ! -f "$TMP/hyprkwin/install.sh" ]; then
    fail "This Setup file is damaged. Download it again."
    finish 1
fi
PKG="$TMP/hyprkwin"

installed=no
[ -x "$BIN/hyprkwin" ] && installed=yes
current=""
[ $installed = yes ] && current=$("$BIN/hyprkwin" version 2>/dev/null)
mode_on() { "$BIN/hyprkwin" status 2>/dev/null | grep -q "mode: on"; }

# ---- actions ---------------------------------------------------------------------------
do_install() {     # $1 = --on / --off / "" (ask)
    was=$installed
    if ! sh "$PKG/install.sh" </dev/null >"$TMP/install.log" 2>&1; then
        fail "Installing failed:

$(tail -n 8 "$TMP/install.log")"
        finish 1
    fi
    # gaming desktop: asked on a fresh install, kept on updates (change it later in the HyprKWin app)
    if [ -n "$GAMING" ]; then
        "$BIN/hyprkwin" gaming-desktop "$GAMING" >/dev/null 2>&1 || true
    elif [ $was = no ] && [ -z "$QUIET" ]; then
        if [ "$MODE" = gui ]; then "$BIN/hyprkwin" gaming-desktop --gui; else "$BIN/hyprkwin" gaming-desktop; fi
    fi
    if mode_on; then
        if [ $was = yes ]; then
            offer_logout "HyprKWin is updated to $VERSION. Hyprland mode stays on, and its settings and shortcuts were re-applied."
        else
            offer_logout "HyprKWin $VERSION is installed and Hyprland mode is on."
        fi
        return
    fi
    choice="$1"
    if [ -z "$choice" ]; then
        if ask "HyprKWin $VERSION is installed.

Turn Hyprland mode on now? You can switch it on or off any time from the HyprKWin app in your menu." "Turn on" "Not now"; then
            choice=--on
        else
            choice=--off
        fi
    fi
    if [ "$choice" = --on ]; then
        "$BIN/hyprkwin" on >"$TMP/on.log" 2>&1
        offer_logout "Hyprland mode is on: tiling, Hyprland keybindings and animations.
Press Super+Shift+G any time to see the keys, or open the full cheat sheet from the HyprKWin app."
    else
        say "HyprKWin $VERSION is installed. Open \"HyprKWin\" from your app menu to turn Hyprland mode on."
    fi
}

do_uninstall() {
    sh "$PKG/uninstall.sh" >"$TMP/uninstall.log" 2>&1
    offer_logout "HyprKWin is uninstalled and your KDE settings and shortcuts are back as they were."
}

# ---- options ---------------------------------------------------------------------------
GAMING=""
for arg in "$@"; do
    case "$arg" in --gaming-desktop=*) GAMING="${arg#--gaming-desktop=}" ;; esac
done

# ---- non-interactive -------------------------------------------------------------------
case "$1" in
    --install)   QUIET=1; case "$2" in --on|--off) do_install "$2" ;; *) do_install --off ;; esac; finish 0 ;;
    --uninstall) QUIET=1; do_uninstall;              finish 0 ;;
esac

# ---- interactive -----------------------------------------------------------------------
if [ $installed = no ]; then
    if ask "Install HyprKWin $VERSION?

Hyprland's tiling, keybindings and animations for KDE Plasma 6.
Everything goes into your home folder, and uninstalling puts KDE back exactly as it was." "Install" "Cancel"; then
        do_install ""
    fi
    finish 0
fi

if [ "$MODE" = gui ]; then
    action=$(kdialog --title "$TITLE" --menu "HyprKWin ${current:-?} is installed." \
        update "Update / reinstall (version $VERSION)" \
        uninstall "Uninstall HyprKWin" \
        open "Open the HyprKWin control panel") || finish 0
else
    printf '\nHyprKWin %s is installed. This Setup is version %s.\n\n' "${current:-?}" "$VERSION"
    printf '  1) Update / reinstall\n  2) Uninstall\n  3) Open the HyprKWin control panel\n  q) Quit\n\nChoose: '
    read -r n
    case "$n" in 1) action=update ;; 2) action=uninstall ;; 3) action=open ;; *) finish 0 ;; esac
fi

case "$action" in
    update) do_install "" ;;
    uninstall)
        if ask "Uninstall HyprKWin?

Hyprland mode is turned off first, so your KDE settings and shortcuts are put back exactly as they were." "Uninstall" "Cancel"; then
            do_uninstall
        fi ;;
    open)
        if [ "$MODE" = gui ]; then "$BIN/hyprkwin" gui; else "$BIN/hyprkwin" menu; fi ;;
esac
finish 0
__PAYLOAD__
HEAD
tar cz -C "$STAGE" --exclude='__pycache__' hyprkwin | base64
} > "$OUT"
chmod +x "$OUT"
echo "built dist/HyprKWin-Setup.sh (version $VERSION, $(du -h "$OUT" | cut -f1))"
