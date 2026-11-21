# Generates contents/config/main.xml and contents/ui/config.ui from one spec.
import html, sys, re
out = sys.argv[1]

# (tab, key, type, default, label, extra)   type: bool | int | double | combo | string
SPEC = [
 ("General", "Layout", "combo", 0, "Default layout (general:layout)", ["dwindle", "master", "scrolling", "monocle"]),
 ("General", "TilingDefault", "combo", 2, "Desktops that start tiled (Super+T switches any desktop until you log out)", ["all desktops", "none (normal KDE until toggled)", "only the ones listed below"]),
 ("General", "TiledDesktops", "string", "1, 3, 4, 5, 6, 7, 8, 9, 10", "Desktop numbers that tile; the rest start in gaming mode (default: desktop 2 is for gaming)", None),
 ("General", "GapsIn", "int", 5, "Gaps between windows (general:gaps_in)", (0, 200)),
 ("General", "GapsOut", "int", 20, "Gaps to screen edges (general:gaps_out)", (0, 200)),
 ("General", "SmartGaps", "bool", False, "No gaps when only one window is tiled", None),
 ("General", "HideTitlebars", "bool", False, "Hide titlebars on tiled windows (Hyprland has none)", None),
 ("General", "FloatAbove", "bool", True, "Keep floating windows above tiled ones", None),
 ("General", "FocusPreferredMethod", "combo", 0, "Directional focus picks (binds:focus_preferred_method)", ["most recently focused", "longest shared edge"]),
 ("General", "MonitorFallback", "bool", True, "Move/focus to the next monitor at the edge (binds:window_direction_monitor_fallback)", None),
 ("General", "NoFocusFallback", "bool", False, "Don't wrap focus (general:no_focus_fallback)", None),
 ("General", "ResizeStep", "int", 40, "Keyboard resize/move step in pixels", (5, 500)),
 ("Rules", "FloatClasses", "string", "org.kde.kcalc, pavucontrol, org.pulseaudio.pavucontrol, nm-connection-editor, blueman-manager", "Always float these window classes (comma separated)", None),
 ("Rules", "IgnoreClasses", "string", "", "Never touch these window classes (comma separated)", None),
 ("Decoration", "ActiveOpacity", "double", 1.0, "Active window opacity (decoration:active_opacity)", (0.0, 1.0, 0.05)),
 ("Decoration", "InactiveOpacity", "double", 1.0, "Inactive window opacity (decoration:inactive_opacity)", (0.0, 1.0, 0.05)),
 ("Decoration", "FullscreenOpacity", "double", 1.0, "Fullscreen window opacity (decoration:fullscreen_opacity)", (0.0, 1.0, 0.05)),
 ("Special workspace", "SpecialScaleFactor", "double", 0.9, "Special workspace size (special_scale_factor)", (0.1, 1.0, 0.05)),
 ("Dwindle", "DwindleForceSplit", "combo", 0, "New window side (force_split)", ["follow mouse", "always left/top", "always right/bottom"]),
 ("Dwindle", "DwindlePreserveSplit", "bool", False, "Keep split direction (preserve_split) — needed for togglesplit to stick", None),
 ("Dwindle", "DwindleSmartSplit", "bool", False, "Split by cursor position on the window (smart_split)", None),
 ("Dwindle", "DwindleSmartResizing", "bool", True, "Resize the edge nearest the cursor (smart_resizing)", None),
 ("Dwindle", "DwindlePermanentDirectionOverride", "bool", False, "Preselect stays until changed (permanent_direction_override)", None),
 ("Dwindle", "DwindleSplitWidthMultiplier", "double", 1.0, "Split width multiplier (split_width_multiplier)", (0.1, 4.0, 0.1)),
 ("Dwindle", "DwindleUseActiveForSplits", "bool", True, "Split the active window, not the one under the mouse (use_active_for_splits)", None),
 ("Dwindle", "DwindleDefaultSplitRatio", "double", 1.0, "Default split ratio, 1.0 = half (default_split_ratio)", (0.1, 1.9, 0.05)),
 ("Dwindle", "DwindleSplitBias", "bool", False, "Give the bigger half to the new window (split_bias)", None),
 ("Dwindle", "DwindlePreciseMouseMove", "bool", False, "Drop dragged windows by exact cursor side (precise_mouse_move)", None),
 ("Master", "MasterMfact", "double", 0.55, "Master area size (mfact)", (0.05, 0.95, 0.05)),
 ("Master", "MasterNewStatus", "combo", 1, "New windows become (new_status)", ["master", "slave", "inherit"]),
 ("Master", "MasterNewOnTop", "bool", False, "New windows go on top of the stack (new_on_top)", None),
 ("Master", "MasterNewOnActive", "combo", 0, "Place new windows next to the active one (new_on_active)", ["none", "before", "after"]),
 ("Master", "MasterOrientation", "combo", 0, "Master side (orientation)", ["left", "top", "right", "bottom", "center"]),
 ("Master", "MasterSlaveCountForCenter", "int", 2, "Stack windows needed for center master (slave_count_for_center_master)", (0, 20)),
 ("Master", "MasterCenterFallback", "combo", 0, "Center master fallback side (center_master_fallback)", ["left", "top", "right", "bottom"]),
 ("Master", "MasterCenterIgnoresReserved", "bool", False, "Centered master ignores panels (center_ignores_reserved)", None),
 ("Master", "MasterSmartResizing", "bool", True, "Smart resizing (smart_resizing)", None),
 ("Master", "MasterDropAtCursor", "bool", True, "Drop dragged windows at the cursor (drop_at_cursor)", None),
 ("Master", "MasterAllowSmallSplit", "bool", False, "Allow more masters than stack windows (allow_small_split)", None),
 ("Master", "MasterAlwaysKeepPosition", "bool", False, "Single window keeps master size (always_keep_position)", None),
 ("Master", "MasterFocusMasterOnClose", "bool", False, "Focus master when a window closes (focus_master_on_close)", None),
 ("Scrolling", "ScrollingColumnWidth", "double", 0.5, "New column width (column_width)", (0.05, 1.0, 0.05)),
 ("Scrolling", "ScrollingExplicitColumnWidths", "string", "0.333, 0.5, 0.667, 1.0", "Widths for colresize ±conf (explicit_column_widths)", None),
 ("Scrolling", "ScrollingDirection", "combo", 0, "New columns go (direction)", ["right", "left", "down", "up"]),
 ("Scrolling", "ScrollingFocusFitMethod", "combo", 0, "Bring focused column into view by (focus_fit_method)", ["centering it", "fitting it", "clamped centering"]),
 ("Scrolling", "ScrollingFollowFocus", "bool", True, "Scroll to the focused window (follow_focus)", None),
 ("Scrolling", "ScrollingFollowMinVisible", "double", 0.4, "Only follow if this much is visible (follow_min_visible)", (0.0, 1.0, 0.05)),
 ("Scrolling", "ScrollingFullscreenOnOneColumn", "bool", True, "Single column fills the screen (fullscreen_on_one_column)", None),
 ("Scrolling", "ScrollingWrapFocus", "bool", True, "Focus wraps around (wrap_focus)", None),
 ("Scrolling", "ScrollingWrapSwapcol", "bool", True, "swapcol wraps around (wrap_swapcol)", None),
 ("Scrolling", "ScrollingHideOffscreen", "bool", True, "Park off-screen columns out of sight (needed with several monitors)", None),
]

def kcfg_type(t):
    return {"bool": "Bool", "int": "Int", "double": "Double", "combo": "Int", "string": "String"}[t]
def kdef(t, d):
    if t == "bool": return "true" if d else "false"
    return html.escape(str(d))

xml = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<kcfg xmlns="http://www.kde.org/standards/kcfg/1.0"',
       '      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
       '      xsi:schemaLocation="http://www.kde.org/standards/kcfg/1.0 http://www.kde.org/standards/kcfg/1.0/kcfg.xsd">',
       '  <kcfgfile name=""/>', '  <group name="">']
for tab, key, t, d, label, extra in SPEC:
    xml.append(f'    <entry name="{key}" type="{kcfg_type(t)}">')
    xml.append(f'      <label>{html.escape(label)}</label>')
    xml.append(f'      <default>{kdef(t, d)}</default>')
    xml.append('    </entry>')
xml += ['  </group>', '</kcfg>', '']
open(f"{out}/contents/config/main.xml", "w").write("\n".join(xml))

# ---- config.ui (Qt Designer) ----
tabs = []
for row in SPEC:
    if row[0] not in tabs: tabs.append(row[0])

def prop(name, kind, val):
    return f'<property name="{name}"><{kind}>{html.escape(str(val))}</{kind}></property>'

ui = ['<?xml version="1.0" encoding="UTF-8"?>', '<ui version="4.0">', ' <class>HyprKWinConfig</class>',
      ' <widget class="QWidget" name="HyprKWinConfig">',
      '  <layout class="QVBoxLayout" name="rootLayout">',
      '   <item><widget class="QLabel" name="introLabel">' +
      prop("text", "string", "Hyprland options, same names and defaults. After saving, changes apply right away; if not, turn the script off and on.") +
      prop("wordWrap", "bool", "true") + '</widget></item>',
      '   <item>', '    <widget class="QTabWidget" name="tabs">']
n = 0
for tab in tabs:
    tid = re.sub(r'\W', '', tab)
    ui.append(f'     <widget class="QWidget" name="tab{tid}">')
    ui.append(f'      <attribute name="title"><string>{html.escape(tab)}</string></attribute>')
    ui.append(f'      <layout class="QFormLayout" name="form{tid}">')
    r = 0
    for t_, key, t, d, label, extra in SPEC:
        if t_ != tab: continue
        n += 1
        w = f"kcfg_{key}"
        if t == "bool":
            ui.append(f'       <item row="{r}" column="0" colspan="2"><widget class="QCheckBox" name="{w}">{prop("text","string",label)}</widget></item>')
        else:
            ui.append(f'       <item row="{r}" column="0"><widget class="QLabel" name="label{key}">{prop("text","string",label)}{prop("wordWrap","bool","true")}</widget></item>')
            if t == "int":
                body = prop("minimum", "number", extra[0]) + prop("maximum", "number", extra[1])
                ui.append(f'       <item row="{r}" column="1"><widget class="QSpinBox" name="{w}">{body}</widget></item>')
            elif t == "double":
                body = prop("minimum", "double", extra[0]) + prop("maximum", "double", extra[1]) + prop("singleStep", "double", extra[2]) + prop("decimals", "number", 3)
                ui.append(f'       <item row="{r}" column="1"><widget class="QDoubleSpinBox" name="{w}">{body}</widget></item>')
            elif t == "combo":
                items = "".join(f'<item>{prop("text","string",x)}</item>' for x in extra)
                ui.append(f'       <item row="{r}" column="1"><widget class="QComboBox" name="{w}">{items}</widget></item>')
            elif t == "string":
                ui.append(f'       <item row="{r}" column="1"><widget class="QLineEdit" name="{w}"/></item>')
        r += 1
    ui.append('      </layout>')
    ui.append('     </widget>')
ui += ['    </widget>', '   </item>', '  </layout>', ' </widget>', ' <resources/>', ' <connections/>', '</ui>', '']
open(f"{out}/contents/ui/config.ui", "w").write("\n".join(ui))

# emit key list for cross-checking main.qml
print(len(SPEC), "options in", len(tabs), "tabs")

# --check: every option's key and default must match what main.qml reads
if "--check" in sys.argv:
    qml = open(f"{out}/contents/ui/main.qml").read()
    used = dict((k, d.strip()) for k, d in re.findall(r'rc\("(\w+)",\s*([^)]+?)\)', qml))
    bad = []
    for _, k, t, d, _, _ in SPEC:
        q = used.get(k)
        if q is None:
            bad.append(f"{k}: not read by main.qml"); continue
        q = q.strip('"')
        ok = (float(q) == float(d)) if t in ("int", "combo", "double") else (q == ({True: "true", False: "false"}[d] if t == "bool" else d))
        if not ok:
            bad.append(f"{k}: settings default {d!r}, main.qml default {q!r}")
    extra = set(used) - {k for _, k, _, _, _, _ in SPEC}
    bad += [f"{k}: read by main.qml but missing from the settings page" for k in sorted(extra)]
    if bad:
        print("\n".join(bad)); sys.exit(1)
    print("settings page and main.qml agree")
