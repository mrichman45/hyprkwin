/*
 * HyprKWin — Hyprland's tiling for KDE Plasma 6 (KWin 6).
 *
 * Layouts ported from hyprwm/Hyprland (commit 5177d94, Nov 2026):
 *   dwindle, master, scrolling, monocle  (contents/code/*.js)
 * Settings: System Settings > Window Management > KWin Scripts > HyprKWin > Configure
 * Shortcuts: System Settings > Keyboard > Shortcuts > KWin (search "Hypr")
 */
import QtQuick
import QtQml
import QtQml.Models
import org.kde.kwin
import "../code/dwindle.js" as Dwindle
import "../code/master.js" as Master
import "../code/scrolling.js" as Scrolling
import "../code/monocle.js" as Monocle
import "../code/core.js" as Core

Item {
    id: root

    property var core: null

    readonly property var layoutNames: ["dwindle", "master", "scrolling", "monocle"]
    readonly property var orientationNames: ["left", "top", "right", "bottom", "center"]
    readonly property var directionNames: ["right", "left", "down", "up"]

    function classList(s) {
        return String(s).split(",").map(x => x.trim().toLowerCase()).filter(x => x.length > 0);
    }

    function rc(key, def) {
        const v = KWin.readConfig(key, def);
        if (typeof def === "number")
            return Number(v);
        if (typeof def === "boolean")
            return v === true || v === "true";
        return String(v);
    }

    // Same option names and defaults as Hyprland
    function readCfg() {
        return {
            general: {
                layout: layoutNames[rc("Layout", 0)] || "dwindle",
                gaps_in: rc("GapsIn", 5),
                gaps_out: rc("GapsOut", 20),
                smart_gaps: rc("SmartGaps", false),
                hide_titlebars: rc("HideTitlebars", false),
                float_above: rc("FloatAbove", true),
                focus_preferred_method: rc("FocusPreferredMethod", 0),
                monitor_fallback: rc("MonitorFallback", true),
                no_focus_fallback: rc("NoFocusFallback", false),
                float_classes: classList(rc("FloatClasses", "org.kde.kcalc, pavucontrol, org.pulseaudio.pavucontrol, nm-connection-editor, blueman-manager")),
                ignore_classes: classList(rc("IgnoreClasses", "")).concat(
                    ["plasmashell", "org.kde.plasmashell", "krunner", "org.kde.krunner", "ksmserver-logout-greeter",
                     "org.kde.polkit-kde-authentication-agent-1", "polkit-kde-authentication-agent-1",
                     "xwaylandvideobridge", "org.kde.spectacle", "yakuake", "org.kde.yakuake", "kwin_wayland", "ksplashqml"]),
                active_opacity: rc("ActiveOpacity", 1.0),
                inactive_opacity: rc("InactiveOpacity", 1.0),
                fullscreen_opacity: rc("FullscreenOpacity", 1.0),
                special_scale_factor: rc("SpecialScaleFactor", 0.9),
                resize_step: rc("ResizeStep", 40),
                // default: every desktop tiles except desktop 2, the gaming desktop
                tiling_default: ["all", "none", "list"][rc("TilingDefault", 2)] || "list",
                tiled_desktops: String(rc("TiledDesktops", "1, 3, 4, 5, 6, 7, 8, 9, 10")).split(",").map(x => parseInt(x)).filter(x => !isNaN(x))
            },
            dwindle: {
                force_split: rc("DwindleForceSplit", 0),
                preserve_split: rc("DwindlePreserveSplit", false),
                smart_split: rc("DwindleSmartSplit", false),
                smart_resizing: rc("DwindleSmartResizing", true),
                permanent_direction_override: rc("DwindlePermanentDirectionOverride", false),
                split_width_multiplier: rc("DwindleSplitWidthMultiplier", 1.0),
                use_active_for_splits: rc("DwindleUseActiveForSplits", true),
                default_split_ratio: rc("DwindleDefaultSplitRatio", 1.0),
                split_bias: rc("DwindleSplitBias", false),
                precise_mouse_move: rc("DwindlePreciseMouseMove", false)
            },
            master: {
                allow_small_split: rc("MasterAllowSmallSplit", false),
                mfact: rc("MasterMfact", 0.55),
                new_status: ["master", "slave", "inherit"][rc("MasterNewStatus", 1)] || "slave",
                new_on_top: rc("MasterNewOnTop", false),
                new_on_active: ["none", "before", "after"][rc("MasterNewOnActive", 0)] || "none",
                orientation: orientationNames[rc("MasterOrientation", 0)] || "left",
                slave_count_for_center_master: rc("MasterSlaveCountForCenter", 2),
                center_master_fallback: ["left", "top", "right", "bottom"][rc("MasterCenterFallback", 0)] || "left",
                center_ignores_reserved: rc("MasterCenterIgnoresReserved", false),
                smart_resizing: rc("MasterSmartResizing", true),
                drop_at_cursor: rc("MasterDropAtCursor", true),
                always_keep_position: rc("MasterAlwaysKeepPosition", false),
                focus_master_on_close: rc("MasterFocusMasterOnClose", false)
            },
            scrolling: {
                column_width: rc("ScrollingColumnWidth", 0.5),
                fullscreen_on_one_column: rc("ScrollingFullscreenOnOneColumn", true),
                focus_fit_method: rc("ScrollingFocusFitMethod", 0),
                follow_focus: rc("ScrollingFollowFocus", true),
                follow_min_visible: rc("ScrollingFollowMinVisible", 0.4),
                explicit_column_widths: rc("ScrollingExplicitColumnWidths", "0.333, 0.5, 0.667, 1.0"),
                direction: directionNames[rc("ScrollingDirection", 0)] || "right",
                wrap_focus: rc("ScrollingWrapFocus", true),
                wrap_swapcol: rc("ScrollingWrapSwapcol", true),
                hide_offscreen: rc("ScrollingHideOffscreen", true)
            }
        };
    }

    function refreshCfg() {
        const fresh = readCfg();
        for (const k in fresh)
            core._ctx.cfg[k] = fresh[k];
        core.reload();
    }

    readonly property var kwinApi: ({
        ws: Workspace,
        MaximizeArea: KWin.MaximizeArea,
        FullScreenArea: KWin.FullScreenArea,
        area: function (opt, output, desktop) { return Workspace.clientArea(opt, output, desktop); },
        setGeometry: function (w, x, y, ww, hh) { w.frameGeometry = Qt.rect(x, y, ww, hh); },
        screenAt: function (p) { return Workspace.screenAt(Qt.point(p.x, p.y)); },
        desktopNumber: function (d) { return Workspace.desktops.indexOf(d) + 1; },
        raise: function (w) { try { Workspace.raiseWindow(w); } catch (e) { Workspace.activeWindow = w; } },
        toggleMaximize: function (w) { Workspace.activeWindow = w; Workspace.slotWindowMaximize(); },
        osd: function (text, detail) { root.showOsd(text, detail); },
        log: function (m) { console.warn(m); }
    })

    // ---------------------------------------------------------------
    // Shortcuts. Defaults use Meta+Alt so they don't clash with Plasma's Meta bindings.
    // Every action is listed in System Settings > Shortcuts > KWin; empty ones are unbound.
    // ---------------------------------------------------------------
    readonly property var shortcuts: [
        ["focus-left", "movefocus l", "Meta+Alt+H"], ["focus-down", "movefocus d", "Meta+Alt+J"],
        ["focus-up", "movefocus u", "Meta+Alt+K"], ["focus-right", "movefocus r", "Meta+Alt+L"],
        ["move-left", "movewindow l", "Meta+Alt+Shift+H"], ["move-down", "movewindow d", "Meta+Alt+Shift+J"],
        ["move-up", "movewindow u", "Meta+Alt+Shift+K"], ["move-right", "movewindow r", "Meta+Alt+Shift+L"],
        ["swap-left", "swapwindow l", "Meta+Alt+Ctrl+H"], ["swap-down", "swapwindow d", "Meta+Alt+Ctrl+J"],
        ["swap-up", "swapwindow u", "Meta+Alt+Ctrl+K"], ["swap-right", "swapwindow r", "Meta+Alt+Ctrl+L"],
        ["resize-grow-w", "resizeactive +x", "Meta+Alt+Ctrl+Right"], ["resize-shrink-w", "resizeactive -x", "Meta+Alt+Ctrl+Left"],
        ["resize-grow-h", "resizeactive +y", "Meta+Alt+Ctrl+Down"], ["resize-shrink-h", "resizeactive -y", "Meta+Alt+Ctrl+Up"],
        ["moveactive-left", "moveactive (floating) left", ""], ["moveactive-right", "moveactive (floating) right", ""],
        ["moveactive-up", "moveactive (floating) up", ""], ["moveactive-down", "moveactive (floating) down", ""],
        ["togglefloating", "togglefloating", "Meta+Alt+V"],
        ["pseudo", "pseudo (pseudotile)", "Meta+Alt+P"],
        ["fullscreen", "fullscreen 0", "Meta+Alt+F"],
        ["fullscreen-maximize", "fullscreen 1 (maximize in layout)", "Meta+Alt+Shift+F"],
        ["pin", "pin", "Meta+Alt+Shift+P"],
        ["centerwindow", "centerwindow", "Meta+Alt+C"],
        ["killactive", "killactive", "Meta+Alt+Q"],
        ["cyclenext", "cyclenext", "Meta+Alt+N"], ["cycleprev", "cycleprev", "Meta+Alt+Shift+N"],
        ["swapnext", "swapnext", ""], ["swapprev", "swapprev", ""],
        ["focuscurrentorlast", "focuscurrentorlast", "Meta+Alt+B"],
        ["focusurgentorlast", "focusurgentorlast", "Meta+Alt+U"],
        ["layout-next", "next layout", "Meta+Alt+Space"], ["layout-prev", "previous layout", "Meta+Alt+Shift+Space"],
        ["layout-dwindle", "layout: dwindle", ""], ["layout-master", "layout: master", ""],
        ["layout-scrolling", "layout: scrolling", ""], ["layout-monocle", "layout: monocle", ""],
        ["togglespecialworkspace", "togglespecialworkspace", "Meta+Alt+S"],
        ["movetoworkspace-special", "movetoworkspace special", "Meta+Alt+Shift+S"],
        ["movetoworkspacesilent-special", "movetoworkspacesilent special", ""],
        ["glossary", "keybinding glossary", "Meta+Shift+G"],
        ["toggle-tiling", "gaming mode: tiling off / on for this desktop", "Meta+Alt+T"],
        ["retile", "re-tile everything", ""],
        ["ratio+", "grow split (splitratio / mfact / colresize)", "Meta+Alt+="],
        ["ratio-", "shrink split (splitratio / mfact / colresize)", "Meta+Alt+-"],

        ["dwindle:togglesplit", "dwindle: togglesplit", "Meta+Alt+E"],
        ["dwindle:swapsplit", "dwindle: swapsplit", "Meta+Alt+X"],
        ["dwindle:rotatesplit", "dwindle: rotatesplit 90", "Meta+Alt+R"],
        ["dwindle:movetoroot", "dwindle: movetoroot", "Meta+Alt+M"],
        ["dwindle:splitratio+", "dwindle: splitratio +0.1", ""], ["dwindle:splitratio-", "dwindle: splitratio -0.1", ""],
        ["dwindle:preselect-l", "dwindle: preselect l", "Meta+Alt+Left"], ["dwindle:preselect-r", "dwindle: preselect r", "Meta+Alt+Right"],
        ["dwindle:preselect-u", "dwindle: preselect u", "Meta+Alt+Up"], ["dwindle:preselect-d", "dwindle: preselect d", "Meta+Alt+Down"],

        ["master:swapwithmaster", "master: swapwithmaster", "Meta+Alt+Return"],
        ["master:focusmaster", "master: focusmaster", ""],
        ["master:addmaster", "master: addmaster", "Meta+Alt+I"],
        ["master:removemaster", "master: removemaster", "Meta+Alt+D"],
        ["master:orientationnext", "master: orientationnext", "Meta+Alt+O"],
        ["master:orientationprev", "master: orientationprev", ""],
        ["master:orientationleft", "master: orientationleft", ""], ["master:orientationright", "master: orientationright", ""],
        ["master:orientationtop", "master: orientationtop", ""], ["master:orientationbottom", "master: orientationbottom", ""],
        ["master:orientationcenter", "master: orientationcenter", ""],
        ["master:mfact+", "master: mfact +0.05", ""], ["master:mfact-", "master: mfact -0.05", ""],
        ["master:rollnext", "master: rollnext", ""], ["master:rollprev", "master: rollprev", ""],
        ["master:cyclenext", "master: cyclenext", ""], ["master:cycleprev", "master: cycleprev", ""],
        ["master:swapnext", "master: swapnext", ""], ["master:swapprev", "master: swapprev", ""],

        ["scrolling:move+col", "scrolling: move +col", "Meta+Alt+PgDown"],
        ["scrolling:move-col", "scrolling: move -col", "Meta+Alt+PgUp"],
        ["scrolling:colresize+conf", "scrolling: colresize +conf", "Meta+Alt+W"],
        ["scrolling:colresize-conf", "scrolling: colresize -conf", "Meta+Alt+Shift+W"],
        ["scrolling:colresize+", "scrolling: colresize +0.1", ""], ["scrolling:colresize-", "scrolling: colresize -0.1", ""],
        ["scrolling:fit-active", "scrolling: fit active", ""], ["scrolling:fit-visible", "scrolling: fit visible", ""],
        ["scrolling:fit-all", "scrolling: fit all", ""], ["scrolling:fit-expand", "scrolling: fit expand", ""],
        ["scrolling:fit-toend", "scrolling: fit toend", ""], ["scrolling:fit-tobeg", "scrolling: fit tobeg", ""],
        ["scrolling:focus-l", "scrolling: focus l", ""], ["scrolling:focus-r", "scrolling: focus r", ""],
        ["scrolling:focus-u", "scrolling: focus u", ""], ["scrolling:focus-d", "scrolling: focus d", ""],
        ["scrolling:promote", "scrolling: promote", ""],
        ["scrolling:consume", "scrolling: consume", ""], ["scrolling:expel", "scrolling: expel", ""],
        ["scrolling:consume_or_expel-prev", "scrolling: consume_or_expel prev", "Meta+Alt+["],
        ["scrolling:consume_or_expel-next", "scrolling: consume_or_expel next", "Meta+Alt+]"],
        ["scrolling:swapcol-l", "scrolling: swapcol l", ""], ["scrolling:swapcol-r", "scrolling: swapcol r", ""],
        ["scrolling:center", "scrolling: center", ""],
        ["scrolling:inhibit_scroll", "scrolling: inhibit_scroll", ""],
        ["scrolling:fit_into_view", "scrolling: fit_into_view", ""],

        ["monocle:cyclenext", "monocle: cyclenext", ""], ["monocle:cycleprev", "monocle: cycleprev", ""]
    ]


    // ---------------------------------------------------------------
    // Keybinding glossary (Super+Shift+G)
    // ---------------------------------------------------------------
    // [group, label, action ids]; ids starting with "kde-" are KDE's own keys (see staticKeys)
    readonly property var glossaryRows: [
        ["Focus & move", "Move focus", ["focus-left", "focus-right", "focus-up", "focus-down"]],
        ["Focus & move", "Move window", ["move-left", "move-right", "move-up", "move-down"]],
        ["Focus & move", "Swap window", ["swap-left", "swap-right", "swap-up", "swap-down"]],
        ["Focus & move", "Next / previous window", ["cyclenext", "cycleprev"]],
        ["Focus & move", "Swap with next / previous", ["swapnext", "swapprev"]],
        ["Focus & move", "Last window", ["focuscurrentorlast"]],
        ["Focus & move", "Window asking for attention", ["focusurgentorlast"]],

        ["Windows", "Close", ["killactive"]],
        ["Windows", "Float / tile", ["togglefloating"]],
        ["Windows", "Fullscreen", ["fullscreen"]],
        ["Windows", "Fill screen, stay in layout", ["fullscreen-maximize"]],
        ["Windows", "Pseudotile", ["pseudo"]],
        ["Windows", "Pin to every desktop", ["pin"]],
        ["Windows", "Centre floating window", ["centerwindow"]],
        ["Windows", "Resize: wider / narrower / taller / shorter", ["resize-grow-w", "resize-shrink-w", "resize-grow-h", "resize-shrink-h"]],
        ["Windows", "Move floating window", ["moveactive-left", "moveactive-right", "moveactive-up", "moveactive-down"]],
        ["Windows", "Grow / shrink the split", ["ratio+", "ratio-"]],

        ["Workspaces", "Go to workspace", ["kde-workspace"]],
        ["Workspaces", "Send window to workspace", ["kde-sendto"]],
        ["Workspaces", "Show / hide scratchpad", ["togglespecialworkspace"]],
        ["Workspaces", "Send to / back from scratchpad", ["movetoworkspace-special"]],
        ["Workspaces", "Send to scratchpad quietly", ["movetoworkspacesilent-special"]],
        ["Workspaces", "Gaming mode (tiling off) for this desktop", ["toggle-tiling"]],

        ["Layouts", "Next / previous layout", ["layout-next", "layout-prev"]],
        ["Layouts", "Dwindle / master / scrolling / monocle", ["layout-dwindle", "layout-master", "layout-scrolling", "layout-monocle"]],
        ["Layouts", "Re-tile everything", ["retile"]],

        ["Dwindle", "Flip split direction", ["dwindle:togglesplit"]],
        ["Dwindle", "Swap the two sides", ["dwindle:swapsplit"]],
        ["Dwindle", "Rotate split 90°", ["dwindle:rotatesplit"]],
        ["Dwindle", "Move to top of the tree", ["dwindle:movetoroot"]],
        ["Dwindle", "Next window opens left / right / up / down", ["dwindle:preselect-l", "dwindle:preselect-r", "dwindle:preselect-u", "dwindle:preselect-d"]],
        ["Dwindle", "Split ratio + / -", ["dwindle:splitratio+", "dwindle:splitratio-"]],

        ["Master", "Swap with master", ["master:swapwithmaster"]],
        ["Master", "Focus master", ["master:focusmaster"]],
        ["Master", "Add / remove a master", ["master:addmaster", "master:removemaster"]],
        ["Master", "Next / previous orientation", ["master:orientationnext", "master:orientationprev"]],
        ["Master", "Master on left / right / top / bottom / centre", ["master:orientationleft", "master:orientationright", "master:orientationtop", "master:orientationbottom", "master:orientationcenter"]],
        ["Master", "Master size + / -", ["master:mfact+", "master:mfact-"]],
        ["Master", "Roll next / previous", ["master:rollnext", "master:rollprev"]],
        ["Master", "Cycle next / previous", ["master:cyclenext", "master:cycleprev"]],
        ["Master", "Swap next / previous", ["master:swapnext", "master:swapprev"]],

        ["Scrolling", "Next / previous column", ["scrolling:move+col", "scrolling:move-col"]],
        ["Scrolling", "Column width: next / previous preset", ["scrolling:colresize+conf", "scrolling:colresize-conf"]],
        ["Scrolling", "Column width + / -", ["scrolling:colresize+", "scrolling:colresize-"]],
        ["Scrolling", "Merge into column before / after", ["scrolling:consume_or_expel-prev", "scrolling:consume_or_expel-next"]],
        ["Scrolling", "Focus left / right / up / down", ["scrolling:focus-l", "scrolling:focus-r", "scrolling:focus-u", "scrolling:focus-d"]],
        ["Scrolling", "Fit active / visible / all", ["scrolling:fit-active", "scrolling:fit-visible", "scrolling:fit-all"]],
        ["Scrolling", "Fit expand / to end / to start", ["scrolling:fit-expand", "scrolling:fit-toend", "scrolling:fit-tobeg"]],
        ["Scrolling", "Promote / consume / expel", ["scrolling:promote", "scrolling:consume", "scrolling:expel"]],
        ["Scrolling", "Swap column left / right", ["scrolling:swapcol-l", "scrolling:swapcol-r"]],
        ["Scrolling", "Centre column", ["scrolling:center"]],
        ["Scrolling", "Fit column into view", ["scrolling:fit_into_view"]],
        ["Scrolling", "Freeze scrolling", ["scrolling:inhibit_scroll"]],

        ["Monocle", "Next / previous window", ["monocle:cyclenext", "monocle:cycleprev"]],

        ["Apps & mouse", "Terminal", ["kde-terminal"]],
        ["Apps & mouse", "Launcher", ["kde-launcher"]],
        ["Apps & mouse", "File manager", ["kde-files"]],
        ["Apps & mouse", "Move window (drag)", ["kde-mousemove"]],
        ["Apps & mouse", "Resize window (drag)", ["kde-mouseresize"]],
        ["Apps & mouse", "This glossary", ["glossary"]]
    ]

    // KDE's own defaults; hyprland-feel.sh replaces them through KeyOverrides
    readonly property var staticKeys: ({
        "kde-workspace": "Ctrl+F1…F4",
        "kde-sendto": "",
        "kde-terminal": "Ctrl+Alt+T",
        "kde-launcher": "Alt+Space",
        "kde-files": "Meta+E",
        "kde-mousemove": "Meta+Left drag",
        "kde-mouseresize": "Meta+Right drag"
    })

    property var liveKeys: ({})     // keys KDE reports right now (if it answers over D-Bus)

    function keyOverrides() {
        const out = {};
        for (const part of String(KWin.readConfig("KeyOverrides", "")).split(";")) {
            const i = part.indexOf("=");
            if (i > 0)
                out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
        }
        return out;
    }

    function keyFor(id, overrides) {
        if (liveKeys[id] !== undefined) return liveKeys[id];
        if (overrides[id] !== undefined) return overrides[id];
        if (staticKeys[id] !== undefined) return staticKeys[id];
        for (const s of shortcuts) if (s[0] === id) return s[2];
        return "";
    }

    function pretty(k) {
        const sym = { "Left": "←", "Right": "→", "Up": "↑", "Down": "↓", "Return": "Enter" };
        return k.split("+").map(p => p === "Meta" ? "Super" : (sym[p] || p)).join("+");
    }

    // "Meta+Alt+H", "Meta+Alt+L" ... -> "Super+Alt+ H L K J"
    function combine(keys) {
        const parts = keys.map(k => {
            const s = k.endsWith("++") ? [k.slice(0, -2), "+"] : [k.slice(0, k.lastIndexOf("+")), k.slice(k.lastIndexOf("+") + 1)];
            return { mods: k.indexOf("+") === -1 ? "" : s[0], base: k.indexOf("+") === -1 ? k : s[1] };
        });
        const same = parts.every(p => p.mods === parts[0].mods);
        if (keys.length > 1 && same && parts[0].mods)
            return [pretty(parts[0].mods) + "+", parts.map(p => pretty(p.base)).join(" ")];
        return keys.map(pretty);
    }

    function glossaryEntries() {
        const ov = keyOverrides();
        const list = [];
        let unbound = 0;
        for (const row of glossaryRows) {
            const keys = row[2].map(id => keyFor(id, ov)).filter(k => k && k !== "none");
            const missing = row[2].length - keys.length;
            if (!keys.length) {
                unbound += row[2].length;
                continue;
            }
            unbound += missing;
            list.push({ group: row[0], text: row[1], keys: combine(keys) });
        }
        return { list: list, unbound: unbound };
    }

    // Ask KDE for the keys currently set (picks up changes made in System Settings).
    // If KDE doesn't answer in a form we can read, the glossary uses defaults + preset.
    function decodeQtKey(v) {
        const mods = [[0x10000000, "Meta"], [0x04000000, "Ctrl"], [0x08000000, "Alt"], [0x02000000, "Shift"]];
        const names = { 0x01000012: "Left", 0x01000013: "Up", 0x01000014: "Right", 0x01000015: "Down",
                        0x01000004: "Return", 0x01000005: "Enter", 0x01000001: "Tab", 0x01000000: "Esc",
                        0x01000003: "Backspace", 0x01000007: "Del", 0x01000009: "Print", 0x20: "Space" };
        if (typeof v !== "number" || v <= 0) return "";
        const out = [];
        for (const m of mods) if (v & m[0]) out.push(m[1]);
        const code = v & 0x01FFFFFF;
        let base = names[code];
        if (!base && code >= 0x01000030 && code <= 0x01000052) base = "F" + (code - 0x01000030 + 1);
        if (!base && code < 0x01000000) base = String.fromCharCode(code).toUpperCase();
        if (!base) return "";
        out.push(base);
        return out.join("+");
    }

    function firstKey(result) {
        // shortcutKeys -> list of key sequences (each a list of ints); shortcut -> list of ints
        let v = result;
        while (Array.isArray(v) && v.length) v = v[0];
        if (v && typeof v === "object" && v.length !== undefined && v.length) v = v[0];
        return decodeQtKey(Number(v));
    }

    function refreshLiveKeys() {
        const ask = function (s, done) {
            KWin.callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "shortcutKeys",
                          ["kwin", "HyprKWin: " + s[0], "KWin", "HyprKWin: " + s[1]], function (result) { done(s, result); });
        };
        try {
            // probe with one action; only ask for the rest if KDE answers in a readable form
            ask(shortcuts[0], function (s, result) {
                const k = firstKey(result);
                if (!k && !(Array.isArray(result) && result.length === 0)) return;
                const live = {};
                live[s[0]] = k;
                for (let i = 1; i < shortcuts.length; ++i)
                    ask(shortcuts[i], function (s2, r2) {
                        const next = Object.assign({}, root.liveKeys);
                        next[s2[0]] = firstKey(r2);
                        root.liveKeys = next;
                    });
                root.liveKeys = Object.assign({}, root.liveKeys, live);
            });
        } catch (e) {
            console.log("hyprkwin: live key lookup unavailable: " + e);
        }
    }

    function showGlossary() {
        if (!glossary) {
            console.warn("hyprkwin: glossary pop-up is not available");
            return;
        }
        console.warn("hyprkwin: glossary " + (glossary.visible ? "close" : "open"));
        const g = glossaryEntries();
        const out = Workspace.activeScreen;
        const geo = out ? out.geometry : Qt.rect(0, 0, 1920, 1080);
        glossary.toggle(g.list, g.unbound, geo);
        if (glossary.visible) refreshLiveKeys();
    }

    onLiveKeysChanged: {
        if (glossary && glossary.visible) {
            const g = glossaryEntries();
            glossary.entries = g.list;
            glossary.unbound = g.unbound;
        }
    }

    // The pop-ups load separately: if one fails, tiling and shortcuts keep working.
    Loader {
        id: glossaryLoader
        source: "Glossary.qml"
        onStatusChanged: if (status === Loader.Error) console.warn("hyprkwin: glossary pop-up failed to load")
    }
    Loader {
        id: osdLoader
        source: "Osd.qml"
        onStatusChanged: if (status === Loader.Error) console.warn("hyprkwin: on-screen message failed to load")
    }
    readonly property var glossary: glossaryLoader.item
    readonly property var osdPopup: osdLoader.item

    function showOsd(text, detail) {
        if (!osdPopup) {
            console.warn("hyprkwin: " + text);
            return;
        }
        const out = Workspace.activeScreen;
        osdPopup.show(text, detail, out ? out.geometry : Qt.rect(0, 0, 1920, 1080));
    }

    Instantiator {
        model: root.shortcuts
        delegate: ShortcutHandler {
            required property var modelData
            name: "HyprKWin: " + modelData[0]
            text: "HyprKWin: " + modelData[1]
            sequence: modelData[2]
            onActivated: {
                if (modelData[0] === "glossary")
                    root.showGlossary();
                else if (root.core)
                    root.core.dispatch(modelData[0]);
            }
        }
    }

    Connections {
        target: Workspace
        function onWindowAdded(w) { if (root.core) root.core.hook(w); }
        function onWindowRemoved(w) { if (root.core) root.core.forget(w); }
        function onWindowActivated(w) { if (root.core && w) root.core.onActivated(w); }
        function onScreensChanged() { if (root.core) root.core.retileAll(); }
        function onVirtualScreenGeometryChanged() { if (root.core) root.core.retileAll(); }
        function onCurrentDesktopChanged() { if (root.core) root.core.retileAll(); }
    }

    Connections {
        target: Options
        function onConfigChanged() { if (root.core) root.refreshCfg(); }
    }

    Component.onCompleted: {
        core = Core.createCore(kwinApi, {
            dwindle: Dwindle.create,
            master: Master.create,
            scrolling: Scrolling.create,
            monocle: Monocle.create
        }, readCfg());
        // declarative scripts expose the window list as a property, not windowList()
        const existing = Workspace.windows || [];
        for (let i = 0; i < existing.length; ++i)
            core.hook(existing[i]);
        console.warn("hyprkwin: loaded, layout = " + readCfg().general.layout);
    }
}
