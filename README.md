# HyprKWin — Hyprland's tiling for KDE Plasma 6

HyprKWin is a KWin script that brings Hyprland's window management to Plasma, with every option on a
settings page. It comes with an optional effect that adds Hyprland-style animations.

**Download:** get `HyprKWin-Setup.sh` from the [latest release](https://github.com/mrichman45/hyprkwin/releases/latest),
then double-click it. It installs, updates and uninstalls, and needs only KDE Plasma 6 and python3.

The layout code is ported from Hyprland's source (hyprwm/Hyprland, commit `5177d94`, 18 Nov 2026), function
by function, with the original names kept:

| Hyprland source | Here |
|---|---|
| `layout/algorithm/tiled/dwindle/DwindleAlgorithm.cpp` | `script/contents/code/dwindle.js` |
| `layout/algorithm/tiled/master/MasterAlgorithm.cpp` | `script/contents/code/master.js` |
| `layout/algorithm/tiled/scrolling/ScrollingAlgorithm.cpp` and `ScrollTapeController.cpp` | `script/contents/code/scrolling.js` |
| `layout/algorithm/tiled/monocle/MonocleAlgorithm.cpp` | `script/contents/code/monocle.js` |
| `desktop/state/WindowQuery.cpp` (`inDirection`), `WindowTarget` gaps | `script/contents/code/core.js` |

## Install, update, uninstall

Download **`HyprKWin-Setup.sh`** from the [releases page](https://github.com/mrichman45/hyprkwin/releases), then double-click it. If your file manager asks, choose "Execute". You can also run `sh HyprKWin-Setup.sh`.
- If HyprKWin isn't installed, it offers **Install**, then asks whether to turn Hyprland mode on.
- If it is installed, it offers **Update / reinstall**, **Uninstall**, or opening the control panel.

Uninstalling turns Hyprland mode off first, so every KDE setting and shortcut it changed is put back exactly as it was.
Then it removes all of HyprKWin's files. It installs only into your home folder and needs KDE Plasma 6 and python3.

Without questions:
```sh
sh HyprKWin-Setup.sh --install --on --gaming-desktop=2     # or --off; --gaming-desktop=none to tile every desktop
sh HyprKWin-Setup.sh --uninstall
```

## The HyprKWin app (control panel)

Open **HyprKWin** from your app menu. It offers:
- turn Hyprland mode on / off
- show the keybinding cheat sheet (a page in your browser; `hyprkwin cheatsheet` does the same)
- choose your gaming desktop
- re-apply settings and keybindings, if keys ever stop working (`hyprkwin refresh` does the same, and updates run it for you)
- tiling settings
- check keybinding clashes
- Uninstall

After switching the mode, log out and back in once so the keys switch over. The same from a terminal:
```sh
hyprkwin on       # or: off, toggle, status, menu, uninstall
```
Before turning on, it saves the exact current value of every KDE setting it changes, and turning off writes those back.
Anything else you change in KDE meanwhile is left alone.

**Hyprland mode on** gives you:
- **Hyprland's Super keys:**
  - arrows move focus, Shift+arrows move windows
  - C closes, V floats, J toggles split, P pseudotiles, F goes fullscreen
  - S and Shift+S for the scratchpad
  - 1–9 and 0 switch workspaces (0 = workspace 10), and Shift with a number sends the window there
  - Q opens a terminal, R the launcher, T switches tiling on or off for that desktop
- **The look:** no titlebars on tiled windows, gaps of 5 / 20, splits that stay put, and Hyprland's animations (KDE's own open/close animations are turned off).
- **Behaviour:** focus follows the mouse, and there are 10 workspaces.
- **Fewer clashes:** every KDE shortcut that clashes with these is cleared, so Hyprland's keys win.
  Meta+Alt+G is always left alone. To protect your own keys, list them one per line in `~/.config/hyprkwin/keep.conf`.

Everything else stays KDE: the panel, the launcher, System Settings, and titlebars and snapping on floating windows.
**Gaming desktop:** Setup asks which desktop is for games (desktop 2 unless you pick another, or none).
That desktop always starts as normal KDE with no tiling, even after a reboot; every other desktop tiles.
To change it later, use **Choose gaming desktop…** in the HyprKWin app, or `hyprkwin gaming-desktop N` (`none` to tile everything).
Changes apply straight away. **Super+T** switches any desktop until you log out.

Unticking HyprKWin in System Settings → KWin Scripts stops only the tiling. Use the switch to turn everything off.

## Keybinding glossary and conflict check

- **Super+Shift+G** opens a searchable glossary of every key HyprKWin uses. Type to filter. Press Esc or
  Super+Shift+G to close.
- **`hyprkwin check`** lists every key HyprKWin shares with a KDE shortcut, and every HyprKWin key KDE refused because
  something else had it first. Use `--all` to include KDE-vs-KDE clashes and `--list` to print every HyprKWin binding.
  The switch clears clashes on its own.

## What's included

**Layouts.** Each virtual desktop on each monitor (a Hyprland "workspace") can use its own layout.
- **dwindle**: binary-tree splitting, with togglesplit, swapsplit, rotatesplit, movetoroot, preselect, splitratio and smart resizing.
- **master**: one master area plus a stack. Orientation can be left, top, right, bottom or center. Supports swapwithmaster, focusmaster, add/removemaster, roll and mfact.
- **scrolling**: columns on an endless strip, like niri or PaperWM. Supports column widths, fit modes, consume/expel, swapcol, follow-focus and inhibit_scroll.
- **monocle**: one window at a time, cycled with cyclenext/cycleprev.

**Dispatchers.** movefocus, movewindow and swapwindow (they cross to other monitors too), resizeactive,
moveactive, togglefloating, pseudo, fullscreen 0, fullscreen 1 (maximize inside the layout), pin,
centerwindow, killactive, cyclenext/prev, swapnext/prev, focuscurrentorlast and focusurgentorlast.

**Special workspace (scratchpad).** `togglespecialworkspace`, `movetoworkspace special` and
`movetoworkspacesilent special`. It works per monitor and is drawn above every desktop, scaled by `special_scale_factor`.

**Mouse.** Drag a tiled window to drop it under the cursor. Drag a window edge to move the splits.

**Look.** Gaps in and out, an option to drop gaps when only one window is open, active/inactive/fullscreen opacity,
an option to hide titlebars on tiled windows, and floating windows kept above tiled ones.

**Rules.** Class lists for windows that always float and windows that are never touched.
Windows with a maximum size that is too small for their tile float automatically, as in Hyprland.

**Animations** (optional effect). Pop-in, slide or fade when windows open or close, with an adjustable pop-in size.
Tiles glide to their new spots, and you can pick a curve that overshoots like Hyprland's default.

## Settings

Go to System Settings → Window Management → KWin Scripts → HyprKWin → gear icon.
The page has tabs for General, Rules, Decoration, Special workspace, Dwindle, Master and Scrolling,
and uses Hyprland's option names and defaults. Changes normally apply when you save. If one doesn't,
turn the script off and on again.

The animations have their own settings page under Desktop Effects → HyprKWin Animations.

## Shortcuts

Every dispatcher is listed in System Settings → Keyboard → Shortcuts. Search for "HyprKWin".
The defaults use **Meta+Alt** so they don't clash with Plasma's own Meta shortcuts. Rebind them as you like.

| Action | Default |
|---|---|
| movefocus / movewindow / swapwindow | Meta+Alt + H J K L / +Shift / +Ctrl |
| resizeactive | Meta+Alt+Ctrl + arrows |
| togglefloating, pseudo, pin, centerwindow | Meta+Alt + V, P, Shift+P, C |
| fullscreen 0 / 1 | Meta+Alt+F / Meta+Alt+Shift+F |
| killactive | Meta+Alt+Q |
| next / previous layout | Meta+Alt+Space / +Shift |
| special workspace: toggle / move window | Meta+Alt+S / Meta+Alt+Shift+S |
| grow / shrink (splitratio, mfact or colresize, depending on the layout) | Meta+Alt+= / Meta+Alt+- |
| dwindle togglesplit, swapsplit, rotatesplit, movetoroot | Meta+Alt + E, X, R, M |
| dwindle preselect | Meta+Alt + arrows |
| master swapwithmaster, addmaster, removemaster, orientationnext | Meta+Alt + Return, I, D, O |
| scrolling move ±col, colresize ±conf, consume_or_expel | Meta+Alt + PgDown PgUp / W, Shift+W / [ ] |
| cyclenext / cycleprev, focuscurrentorlast, focusurgentorlast | Meta+Alt + N / Shift+N, B, U |
| toggle tiling on this desktop (Hyprland ↔ normal KDE) | Meta+Alt+T |

Workspace switching and moving windows to workspaces already exist in Plasma: Meta+1…9 (bind them under KWin shortcuts).

## Not ported, and what to use instead

- **Borders, rounded corners, blur, shadows, dim_inactive**: use Plasma's window decorations and its Blur and Dim Inactive effects. A script can't draw on windows.
- **follow_mouse**: use System Settings → Window Management → Window Behavior → Focus → "Focus follows mouse".
- **Workspace switch animation**: use Plasma's Slide effect.
- **Window rules beyond float/ignore**: use Plasma's Window Rules.
- **Separate workspaces per monitor**: KWin switches every screen at once, so this isn't possible from a script.
- **Groups/tabs (togglegroup), hyprctl, plugins, workspace rules (layoutopts)**: not ported.

## Known differences from Hyprland

- With several monitors, the scrolling layout parks columns that are fully off-screen far away. Columns that are partly visible can
  overlap the next monitor, because KWin can't clip a window to its monitor.
- KWin doesn't report which edge you're dragging, so HyprKWin works it out from the geometry change.
- As in Hyprland, `togglesplit` only sticks with `preserve_split` turned on.
- Monocle hides background windows by making them transparent, as Hyprland does (alpha 0).

## Debugging

```sh
journalctl --user -f | grep -i hyprkwin
```

## Building and testing

```sh
sh tools/build-setup.sh                                # -> dist/HyprKWin-Setup.sh
node --test tests/*.test.js                            # layouts and core, against a mock KWin
python3 -m unittest discover -s tests -p "test_*.py"   # shortcut tools, on/off switch, Setup round trip
python3 tools/gen_config.py script --check             # settings page matches the script's defaults
```

The tests run without KDE: `tests/harness.js` fakes KWin's scripting API, and `tests/stubs/` has stand-ins for
`kwriteconfig6`, `kpackagetool6` and `qdbus6`. GitHub runs them on every push. Publishing a release (Releases → Draft a new release → tag `v1.2`
→ Publish) builds `HyprKWin-Setup.sh` and attaches it to that release.

After changing an option in `tools/gen_config.py`, run `python3 tools/gen_config.py script` to regenerate the settings page.

| Path | What it is |
|---|---|
| `script/` | the KWin script: `contents/code/*.js` (layouts and core), `contents/ui/*.qml` (KWin glue, glossary, on-screen messages) |
| `effect/` | the optional animations effect |
| `hyprkwin` | the on/off switch, control panel and `hyprkwin` command |
| `check-keybinds.py` | keybinding clash report and fixer |
| `install.sh`, `uninstall.sh` | what Setup runs |
| `cheatsheet.md`, `md2html.py` | the keybinding cheat sheet and its HTML builder |
| `tools/` | `build-setup.sh` (Setup file), `gen_config.py` (settings page) |
| `tests/` | the tests and their fakes |

## Licence

BSD-3-Clause, the same as Hyprland. The layout algorithms are derived from Hyprland © Vaxry and contributors.
