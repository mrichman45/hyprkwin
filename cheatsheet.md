# HyprKWin Keybindings

## How to read this

Each action has two keys: the **Super** key you get with Hyprland mode on (the HyprKWin switch in your app menu, or `hyprkwin on`), and the **Meta+Alt** key that works without it. Super, Meta and the Windows key are the same key.

- "same" in the preset column means the preset doesn't change that key.
- The last column is the matching Hyprland dispatcher, so you can compare it with Hyprland's own docs.
- Every binding can be changed in System Settings → Keyboard → Shortcuts (search "HyprKWin").

## Focus, move and swap

These work in every layout. When there's no window in that direction, they jump to the next monitor.

| Action | With preset | Without preset | Hyprland |
| --- | --- | --- | --- |
| Focus left / right / up / down | Super+← → ↑ ↓ | Meta+Alt+H / L / K / J | movefocus |
| Move window left / right / up / down | Super+Shift+← → ↑ ↓ | Meta+Alt+Shift+H / L / K / J | movewindow |
| Swap with the window in that direction | same | Meta+Alt+Ctrl+H / L / K / J | swapwindow |
| Focus next / previous window | same | Meta+Alt+N / Meta+Alt+Shift+N | cyclenext / cycleprev |
| Go back to the last window | same | Meta+Alt+B | focuscurrentorlast |
| Go to a window asking for attention | same | Meta+Alt+U | focusurgentorlast |

## Window actions

| Action | With preset | Without preset | Hyprland |
| --- | --- | --- | --- |
| Close window | Super+C | Meta+Alt+Q | killactive |
| Float / tile window | Super+V | Meta+Alt+V | togglefloating |
| Fullscreen | Super+F | Meta+Alt+F | fullscreen 0 |
| Fill the screen but stay in the layout | same | Meta+Alt+Shift+F | fullscreen 1 |
| Pseudotile (keep size, centred in its tile) | Super+P | Meta+Alt+P | pseudo |
| Pin floating window to every desktop | same | Meta+Alt+Shift+P | pin |
| Centre floating window | same | Meta+Alt+C | centerwindow |
| Resize window | same | Meta+Alt+Ctrl+← → ↑ ↓ | resizeactive |
| Grow / shrink the split | same | Meta+Alt+= / Meta+Alt+- | splitratio, mfact or colresize, depending on the layout |

## Workspaces, scratchpad and tiling toggle

Workspaces are KDE's virtual desktops. The preset sets up 10, like Hyprland's default config, with 0 as workspace 10.

| Action | With preset | Without preset | Hyprland |
| --- | --- | --- | --- |
| Go to workspace 1–10 | Super+1–9, 0 | KDE's own (Ctrl+F1… by default) | workspace N |
| Send window to workspace 1–10 | Super+Shift+1–9, 0 | KDE's own (unbound by default) | movetoworkspace N |
| Show / hide the scratchpad | Super+S | Meta+Alt+S | togglespecialworkspace |
| Send window to the scratchpad (again to bring it back) | Super+Shift+S | Meta+Alt+Shift+S | movetoworkspace special |
| Send window to the scratchpad without showing it | same | unbound | movetoworkspacesilent special |
| Gaming mode: switch this desktop between tiling and normal KDE (shows "Gaming Mode On" / "Gaming Mode Off") | Super+T | Meta+Alt+T | none (HyprKWin only) |

One difference: in Hyprland, sending a window to a workspace also takes you there. In KDE you stay where you are.

## Layouts

Each workspace on each monitor has its own layout. Dwindle is the default, as in Hyprland. Layout keys only do something while that layout is active.

| Action | With preset | Without preset | Hyprland |
| --- | --- | --- | --- |
| Next / previous layout | same | Meta+Alt+Space / Meta+Alt+Shift+Space | none (general:layout) |
| **Dwindle:** flip the split direction | Super+J | Meta+Alt+E | layoutmsg togglesplit |
| **Dwindle:** swap the two sides of a split | same | Meta+Alt+X | layoutmsg swapsplit |
| **Dwindle:** rotate the split 90° | same | Meta+Alt+R | layoutmsg rotatesplit |
| **Dwindle:** move window to the top of the tree | same | Meta+Alt+M | layoutmsg movetoroot |
| **Dwindle:** choose where the next window opens | same | Meta+Alt+← → ↑ ↓ | layoutmsg preselect |
| **Master:** swap with the master window | same | Meta+Alt+Return | layoutmsg swapwithmaster |
| **Master:** add / remove a master | same | Meta+Alt+I / Meta+Alt+D | layoutmsg addmaster / removemaster |
| **Master:** move the master area to the next side | same | Meta+Alt+O | layoutmsg orientationnext |
| **Scrolling:** scroll to next / previous column | same | Meta+Alt+PgDown / Meta+Alt+PgUp | layoutmsg move +col / -col |
| **Scrolling:** step column width up / down | same | Meta+Alt+W / Meta+Alt+Shift+W | layoutmsg colresize +conf / -conf |
| **Scrolling:** merge into or split from the column before / after | same | Meta+Alt+[ / Meta+Alt+] | layoutmsg consume_or_expel prev / next |
| **Monocle:** next / previous window | same | Meta+Alt+N / Meta+Alt+Shift+N | layoutmsg cyclenext / cycleprev |

51 more actions are listed in the Shortcuts settings with no key yet (for example master rollnext, scrolling fit visible, swapcol, promote). Bind any you want.

## Games

Real fullscreen games are never moved or resized. While one is open, the windows on that desktop also stay where they are. Games in **borderless window** mode count as normal windows and get tiled. Fix those with one key:

| Problem | Fix | Key |
| --- | --- | --- |
| Game is shrunk or squeezed beside other windows | Float it | Super+V |
| Game should cover the whole screen | Make it fullscreen | Super+F |
| You want a desktop just for gaming | Turn on gaming mode (tiling off) for that desktop | Super+T |
| Game minimizes when the mouse moves to another monitor | Switch focus back to click-to-focus in System Settings → Window Management → Window Behavior → Focus | none |

**Your gaming desktop** always starts in gaming mode (no tiling), even after a reboot. You pick it during setup (desktop 2 unless you chose another). To change it, open the HyprKWin app → **Choose gaming desktop…**, or run `hyprkwin gaming-desktop 5` in a terminal; the change applies straight away. Super+T turns gaming mode on or off on any desktop until you log out.

Switching a game to real fullscreen in its own settings also avoids the problem.

## Apps, mouse and changing keys

| Action | With preset | Without preset | Hyprland default |
| --- | --- | --- | --- |
| Terminal (Konsole) | Super+Q | Ctrl+Alt+T | SUPER+Q (kitty) |
| Launcher (KRunner) | Super+R | Alt+Space | SUPER+R (menu) |
| File manager (Dolphin) | Super+E | Super+E | SUPER+E |
| Move a window by dragging | Super+left-drag | Super+left-drag | SUPER+left mouse |
| Resize a window by dragging | Super+right-drag | Super+right-drag | SUPER+right mouse |

- Dragging a tiled window drops it into the spot under the cursor, as in Hyprland.
- Dragging the edge of a tiled window moves the split lines.

**Glossary on screen:** press **Super+Shift+G** for a searchable pop-up of these keys (same key with or without the preset). It shows the keys you actually have, including ones you changed. Esc closes it.

**Check for clashes:** run `hyprkwin check` in a terminal. It lists any key HyprKWin shares with a KDE shortcut, and any HyprKWin key KDE refused because something else had it first. Turning Hyprland mode on settles every clash in Hyprland's favour (Meta+Alt+G is always left alone).

**To change any key:** go to System Settings → Keyboard → Shortcuts, search "HyprKWin", click the action and press the new keys. If KDE says the key is taken, clear it from the other action first. Running `hyprkwin off` (or unticking the HyprKWin switch) puts all your original KDE keys back.
