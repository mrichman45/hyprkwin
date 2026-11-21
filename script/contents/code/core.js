// Core glue between KWin and the Hyprland layout ports.
//
// createCore(kwin, creators, cfg)
//   kwin      — thin wrapper over KWin's QML API (see main.qml), mockable in tests
//   creators  — { dwindle: create, master: create, scrolling: create, monocle: create }
//   cfg       — config object (see main.qml readConfig); mutated in place on reload
//
// Hyprland concept -> KWin here
//   workspace            -> (output, virtual desktop)
//   special workspace    -> one per output, shown over every desktop
//   fullscreen 0 / 1     -> KWin fullscreen / "maximize inside the layout"
//   layoutmsg            -> core.dispatch("<layout>:<msg>")

function createCore(kwin, creators, cfg) {
    const DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;
    const LAYOUTS = ["dwindle", "master", "scrolling", "monocle"];

    const spaces = {};          // key -> space
    const states = {};          // window id -> state
    const history = [];         // focus history, oldest first
    const specialShown = {};    // output name -> bool
    const tilingOverride = {};  // desktop id -> bool, set by the toggle key
    let dragging = false;       // true while handling a mouse drop
    let applying = false;       // true while we move windows ourselves

    function log(m) { kwin.log("hyprkwin: " + m); }
    function wid(w) { return String(w.internalId); }
    function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
    function toRect(q) { return rect(q.x, q.y, q.width, q.height); }
    function STICKS(a, b) { return Math.abs(a - b) < 2; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function erase(arr, item) { const i = arr.indexOf(item); if (i !== -1) arr.splice(i, 1); }
    function alive(w) { return w && !w.deleted; }

    function st(w) {
        const id = wid(w);
        if (!states[id])
            states[id] = { win: w, space: null, floating: false, pseudo: false, fsMode: 0, special: false,
                           hidden: false, internalMin: 0, floatGeom: null, orig: null, pendingFocal: null,
                           seen: false, hooked: false };
        return states[id];
    }

    // ------------------------------------------------------------------
    // ctx: what the layout engines may call
    // ------------------------------------------------------------------
    const ctx = {
        cfg: cfg,
        workArea: workArea,
        reserved: function (space) {
            const full = toRect(kwin.area(kwin.FullScreenArea, space.output, deskOf(space)));
            const max = toRect(kwin.area(kwin.MaximizeArea, space.output, deskOf(space)));
            return { left: max.x - full.x, right: (full.x + full.w) - (max.x + max.w) };
        },
        monitorSize: function (space) {
            const f = toRect(kwin.area(kwin.FullScreenArea, space.output, deskOf(space)));
            return { w: f.w, h: f.h };
        },
        monitorBox: function (space) { return toRect(kwin.area(kwin.FullScreenArea, space.output, deskOf(space))); },
        place: place,
        cursor: function () { const p = kwin.ws.cursorPos; return { x: p.x, y: p.y }; },
        active: function () { return kwin.ws.activeWindow; },
        spaceVisible: spaceVisible,
        fullscreenIn: fullscreenIn,
        maxSize: function (w) {
            const m = w.maxSize;
            if (!m || !(m.width > 0) || !(m.height > 0) || m.width >= 32767 || m.height >= 32767)
                return null;
            return { w: m.width, h: m.height };
        },
        wasDragging: function () { return dragging; },
        cursorOnReserved: function (space, p) {
            const full = toRect(kwin.area(kwin.FullScreenArea, space.output, deskOf(space)));
            const max = toRect(kwin.area(kwin.MaximizeArea, space.output, deskOf(space)));
            const inFull = p.x >= full.x && p.x < full.x + full.w && p.y >= full.y && p.y < full.y + full.h;
            const inMax = p.x >= max.x && p.x < max.x + max.w && p.y >= max.y && p.y < max.y + max.h;
            return inFull && !inMax;
        },
        vecToRectDistanceSquared: function (p, b) {
            const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
            const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
            return dx * dx + dy * dy;
        },
        focalPointForDir: focalPointForDir,
        focus: function (w) { focusWindow(w, true); },
        setHidden: function (w, hidden) { st(w).hidden = hidden; applyLook(w); },
        history: function () { return history; },
        windowInDirection: function (w, dir) { return inDirection(w, dir); },
        explicitColumnWidths: function () {
            const out = String(cfg.scrolling.explicit_column_widths).split(",")
                .map(s => parseFloat(s)).filter(v => !isNaN(v)).map(v => clamp(v, 0.05, 1));
            return out.length ? out : [0.333, 0.5, 0.667, 1.0];
        }
    };

    const engines = {};
    for (const name of LAYOUTS)
        engines[name] = creators[name](ctx);

    // ------------------------------------------------------------------
    // Spaces
    // ------------------------------------------------------------------
    function deskOf(space) { return space.special ? kwin.ws.currentDesktop : space.desktop; }

    function spaceKeyFor(w) {
        const s = st(w);
        if (!w.output)
            return null;
        if (s.special)
            return "special|" + w.output.name;
        if (w.onAllDesktops || !w.desktops || w.desktops.length !== 1)
            return null;
        return w.output.name + "|" + w.desktops[0].id;
    }

    function getSpace(key, w) {
        if (!spaces[key]) {
            spaces[key] = { key: key, output: w.output, desktop: st(w).special ? null : w.desktops[0],
                            special: st(w).special, layout: null };
        }
        const sp = spaces[key];
        sp.output = w.output;
        if (!sp.special)
            sp.desktop = w.desktops[0];
        return sp;
    }

    function layoutOf(space) {
        const name = space.layout || cfg.general.layout;
        return engines[name] || engines.dwindle;
    }

    function spaceVisible(space) {
        if (space.special)
            return !!specialShown[space.output.name];
        return space.desktop === kwin.ws.currentDesktop;
    }

    function tiledIn(space) { return layoutOf(space).windows(space); }

    function fullscreenIn(space) {
        for (const w of tiledIn(space))
            if (alive(w) && (w.fullScreen || st(w).fsMode === 1))
                return true;
        return false;
    }

    function workArea(space) {
        const a = toRect(kwin.area(kwin.MaximizeArea, space.output, deskOf(space)));
        let g = cfg.general.gaps_out;
        if (cfg.general.smart_gaps && tiledIn(space).length <= 1)
            g = 0;
        let r = rect(a.x + g, a.y + g, a.w - 2 * g, a.h - 2 * g);
        if (space.special) {
            const f = clamp(cfg.general.special_scale_factor, 0.1, 1);
            const nw = r.w * f, nh = r.h * f;
            r = rect(r.x + (r.w - nw) / 2, r.y + (r.h - nh) / 2, nw, nh);
        }
        return r;
    }

    // ------------------------------------------------------------------
    // Geometry (CWindowTarget::setPositionGlobal)
    // ------------------------------------------------------------------
    function place(space, w, box, opts) {
        if (!alive(w) || w.fullScreen)
            return;
        const s = st(w);
        let b = box;

        if (s.fsMode === 1) {
            b = workArea(space);
            setGeom(w, b.x, b.y, b.w, b.h);
            return;
        }

        const g = (cfg.general.smart_gaps && tiledIn(space).length <= 1) ? 0 : cfg.general.gaps_in;
        let l, r, t, bt;
        if (opts && opts.gaps) {
            l = opts.gaps.l ? g : 0; r = opts.gaps.r ? g : 0;
            t = opts.gaps.t ? g : 0; bt = opts.gaps.b ? g : 0;
        } else {
            const WA = workArea(space);
            l = STICKS(b.x, WA.x) ? 0 : g;
            r = STICKS(b.x + b.w, WA.x + WA.w) ? 0 : g;
            t = STICKS(b.y, WA.y) ? 0 : g;
            bt = STICKS(b.y + b.h, WA.y + WA.h) ? 0 : g;
        }

        let x = b.x + l, y = b.y + t, ww = b.w - l - r, hh = b.h - t - bt;

        // dwindle:pseudotile — keep the floating size, centred in the tile
        if (s.pseudo && s.floatGeom) {
            const pw = Math.min(s.floatGeom.w, ww), ph = Math.min(s.floatGeom.h, hh);
            x += (ww - pw) / 2;
            y += (hh - ph) / 2;
            ww = pw;
            hh = ph;
        }

        // scrolling: columns outside the viewport are parked off every screen
        if (opts && opts.offscreen && cfg.scrolling.hide_offscreen)
            y += 100000;

        setGeom(w, x, y, ww, hh);
    }

    function setGeom(w, x, y, ww, hh) {
        applying = true;
        try {
            kwin.setGeometry(w, Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh)));
        } catch (e) {
            log("setGeometry failed: " + e);
        }
        applying = false;
    }

    // ------------------------------------------------------------------
    // Which windows are managed
    // ------------------------------------------------------------------
    function classOf(w) { return String(w.resourceClass || "").toLowerCase(); }

    function isManageable(w) {
        if (!alive(w) || !w.normalWindow || w.transient || w.specialWindow || w.popupWindow)
            return false;
        if (!w.moveable || !w.resizeable)
            return false;
        // KWin's own windows, including HyprKWin's glossary pop-up
        if (w.internal || String(w.caption).indexOf("HyprKWin") === 0)
            return false;
        const c = classOf(w);
        if (cfg.general.ignore_classes.indexOf(c) !== -1)
            return false;
        // wallpaper engines draw the desktop in a normal-looking window: never tile those
        const name = String(w.resourceName || "").toLowerCase() + " " + c;
        for (const p of ["waywallen", "wallpaperengine", "wallpaper-engine", "linux-wallpaperengine", "mpvpaper", "xwinwrap", "hidamari", "komorebi"])
            if (name.indexOf(p) !== -1)
                return false;
        return true;
    }

    function isTileable(w) {
        if (!isManageable(w))
            return false;
        const s = st(w);
        if (s.floating)
            return false;
        if (w.minimized && !s.internalMin)
            return false;
        if (s.special && !specialShown[w.output ? w.output.name : ""])
            return false;
        if (!s.special && w.desktops && w.desktops.length === 1 && !desktopTiled(w.desktops[0]))
            return false;
        return spaceKeyFor(w) !== null;
    }

    // Hybrid mode: each desktop is either tiled (Hyprland) or normal KDE
    function desktopTiled(desk) {
        if (!desk)
            return false;
        if (tilingOverride[desk.id] !== undefined)
            return tilingOverride[desk.id];
        const mode = cfg.general.tiling_default;
        if (mode === "none")
            return false;
        if (mode === "list")
            return cfg.general.tiled_desktops.indexOf(kwin.desktopNumber(desk)) !== -1;
        return true;
    }

    function toggleTiling() {
        const desk = kwin.ws.currentDesktop;
        const on = !desktopTiled(desk);
        tilingOverride[desk.id] = on;
        for (const id in states) {
            const s = states[id];
            const w = s.win;
            if (!alive(w) || !w.desktops || w.desktops.indexOf(desk) === -1 || s.special)
                continue;
            if (!on && s.space) {
                removeFromSpace(w);
                // back to the size and place it had before it was tiled
                if (s.floatGeom && !s.floating)
                    setGeom(w, s.floatGeom.x, s.floatGeom.y, s.floatGeom.w, s.floatGeom.h);
            }
            refresh(w);
        }
        // tiling off on a desktop = gaming mode (games keep their own size, normal KDE windows)
        kwin.osd(on ? "Gaming Mode Off" : "Gaming Mode On",
                 on ? "Tiling is back on for this desktop" : "Tiling paused on this desktop");
    }

    // ------------------------------------------------------------------
    // Look: opacity (decoration:active/inactive/fullscreen_opacity), borders, keep-above
    // ------------------------------------------------------------------
    function applyLook(w) {
        if (!alive(w) || !isManageable(w))
            return;
        const s = st(w);
        if (!s.orig)
            s.orig = { noBorder: !!w.noBorder, keepAbove: !!w.keepAbove, opacity: w.opacity };

        const G = cfg.general;
        const opacityRules = G.active_opacity !== 1 || G.inactive_opacity !== 1 || G.fullscreen_opacity !== 1;
        if (s.hidden || opacityRules || s.opacityTouched) {
            let op;
            if (s.hidden) op = 0;
            else if (!opacityRules) op = s.orig.opacity;
            else if (w.fullScreen) op = G.fullscreen_opacity;
            else if (w === kwin.ws.activeWindow) op = G.active_opacity;
            else op = G.inactive_opacity;
            if (w.opacity !== op)
                w.opacity = op;
            s.opacityTouched = s.hidden || opacityRules;
        }

        const tiled = !!s.space;
        const wantNoBorder = cfg.general.hide_titlebars && tiled ? true : s.orig.noBorder;
        if (!!w.noBorder !== wantNoBorder)
            w.noBorder = wantNoBorder;

        let wantAbove = s.orig.keepAbove;
        if (s.special && specialShown[w.output ? w.output.name : ""]) wantAbove = true;
        else if (cfg.general.float_above && s.floating) wantAbove = true;
        if (!!w.keepAbove !== wantAbove)
            w.keepAbove = wantAbove;
    }

    function applyLookAll() {
        for (const id in states)
            if (alive(states[id].win))
                applyLook(states[id].win);
    }

    // ------------------------------------------------------------------
    // Keeping layouts in sync with KWin
    // ------------------------------------------------------------------
    function removeFromSpace(w) {
        const s = st(w);
        if (!s.space)
            return;
        const sp = spaces[s.space];
        s.space = null;
        if (sp) {
            layoutOf(sp).remove(sp, w);
            relayoutForSmartGaps(sp);
        }
    }

    function addToSpace(w) {
        const s = st(w);
        const key = spaceKeyFor(w);
        const sp = getSpace(key, w);
        if (!s.floatGeom)
            s.floatGeom = toRect(w.frameGeometry);
        s.space = key;
        const focal = s.pendingFocal;
        s.pendingFocal = null;
        const ok = layoutOf(sp).add(sp, w, focal ? { focal: focal } : null);
        if (ok === false) {
            // too big for its tile (max size) -> float, like Hyprland
            s.space = null;
            s.floating = true;
            applyLook(w);
            return;
        }
        relayoutForSmartGaps(sp);
    }

    function relayoutForSmartGaps(sp) {
        if (cfg.general.smart_gaps)
            layoutOf(sp).recalc(sp);
    }

    function refresh(w) {
        if (!alive(w))
            return;
        const s = st(w);
        const want = isTileable(w) ? spaceKeyFor(w) : null;
        if (s.space && s.space !== want)
            removeFromSpace(w);
        if (want && !s.space)
            addToSpace(w);
        applyLook(w);
    }

    function firstSight(w) {
        const s = st(w);
        if (s.seen)
            return;
        s.seen = true;
        if (cfg.general.float_classes.indexOf(classOf(w)) !== -1)
            s.floating = true;
    }

    function hook(w) {
        if (!isManageable(w) && !(w.normalWindow))
            return;
        const s = st(w);
        firstSight(w);
        if (s.hooked) {
            refresh(w);
            return;
        }
        s.hooked = true;

        w.minimizedChanged.connect(function () { if (!st(w).internalMin) refresh(w); });
        w.desktopsChanged.connect(function () { refresh(w); });
        w.outputChanged.connect(function () { refresh(w); });
        w.fullScreenChanged.connect(function () {
            const k = st(w).space;
            if (k && spaces[k]) layoutOf(spaces[k]).recalc(spaces[k]);
            applyLook(w);
        });
        if (w.demandsAttentionChanged)
            w.demandsAttentionChanged.connect(function () { });

        let before = null;
        w.interactiveMoveResizeStarted.connect(function () {
            before = st(w).space ? toRect(w.frameGeometry) : null;
        });
        w.interactiveMoveResizeFinished.connect(function () {
            const b = before;
            before = null;
            onDragEnd(w, b);
        });

        refresh(w);
    }

    function forget(w) {
        const s = st(w);
        const wasActive = history.length && history[history.length - 1] === w;
        const key = s.space;
        const oldBox = key && spaces[key] ? layoutOf(spaces[key]).boxOf(spaces[key], w) : null;
        removeFromSpace(w);
        erase(history, w);
        delete states[wid(w)];

        // getNextCandidate: focus the closest window, like Hyprland
        if (wasActive && key && spaces[key] && oldBox) {
            const E = layoutOf(spaces[key]);
            const next = E.onClosed ? E.onClosed(spaces[key], oldBox) : null;
            if (next)
                focusWindow(next, false);
        }
    }

    // Mouse: move = drop under the cursor, resize = move split lines
    function onDragEnd(w, before) {
        const s = st(w);
        if (!s.space || !before)
            return;
        const sp = spaces[s.space];
        const E = layoutOf(sp);
        const g = toRect(w.frameGeometry);
        const resized = Math.abs(g.w - before.w) > 1 || Math.abs(g.h - before.h) > 1;

        if (resized) {
            const leftMoved = Math.abs(g.x - before.x) > 1;
            const topMoved = Math.abs(g.y - before.y) > 1;
            const corner = {
                l: leftMoved, r: !leftMoved && Math.abs(g.w - before.w) > 1,
                t: topMoved, b: !topMoved && Math.abs(g.h - before.h) > 1
            };
            const dx = leftMoved ? g.x - before.x : (g.x + g.w) - (before.x + before.w);
            const dy = topMoved ? g.y - before.y : (g.y + g.h) - (before.y + before.h);
            E.resize(sp, w, { x: dx, y: dy }, corner);
            return;
        }

        dragging = true;
        try {
            const p = ctx.cursor();
            removeFromSpace(w);
            s.pendingFocal = p;
            if (isTileable(w))
                addToSpace(w);
        } finally {
            dragging = false;
        }
    }

    // ------------------------------------------------------------------
    // Focus and directions (CWindowQuery::inDirection)
    // ------------------------------------------------------------------
    function focalPointForDir(box, dir) {
        switch (dir) {
        case DIR_UP: return { x: box.x + box.w / 2, y: box.y - 1 };
        case DIR_DOWN: return { x: box.x + box.w / 2, y: box.y + box.h + 1 };
        case DIR_LEFT: return { x: box.x - 1, y: box.y + box.h / 2 };
        case DIR_RIGHT: return { x: box.x + box.w + 1, y: box.y + box.h / 2 };
        }
        return null;
    }

    // Window::getWindowIdealBoundingBoxIgnoreReserved — tiles touching the work area edge
    // are stretched to the monitor edge, so windows on neighbouring monitors are adjacent.
    function idealBox(w) {
        const s = st(w);
        if (s.space && spaces[s.space]) {
            const sp = spaces[s.space];
            const b = layoutOf(sp).boxOf(sp, w);
            if (b) {
                const WA = workArea(sp);
                const M = toRect(kwin.area(kwin.FullScreenArea, sp.output, deskOf(sp)));
                let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
                if (STICKS(x1, WA.x)) x1 = M.x;
                if (STICKS(y1, WA.y)) y1 = M.y;
                if (STICKS(x2, WA.x + WA.w)) x2 = M.x + M.w;
                if (STICKS(y2, WA.y + WA.h)) y2 = M.y + M.h;
                return rect(x1, y1, x2 - x1, y2 - y1);
            }
        }
        return toRect(w.frameGeometry);
    }

    function isAdjacent(aMin, aMax, bMin, bMax) {
        const delta = aMin - bMax;
        if (Math.abs(delta) < 2) return true;
        if (delta >= 0) return false;
        const overlap = -delta;
        if ((bMin <= aMin && bMax >= aMax) || (aMin <= bMin && aMax >= bMax)) return false;
        return overlap <= Math.min(aMax - aMin, bMax - bMin) * 0.5;
    }

    function visibleCandidates() {
        const out = [];
        for (const id in states) {
            const s = states[id];
            const w = s.win;
            if (!alive(w) || w.minimized || !isManageable(w) || s.hidden)
                continue;
            if (s.space) {
                if (spaceVisible(spaces[s.space])) out.push(w);
            } else if (w.onAllDesktops || (w.desktops && w.desktops.indexOf(kwin.ws.currentDesktop) !== -1)) {
                out.push(w);
            }
        }
        return out;
    }

    function inDirection(window, dir) {
        if (!window) return null;
        const A = window.fullScreen ? toRect(kwin.area(kwin.FullScreenArea, window.output, kwin.ws.currentDesktop)) : idealBox(window);
        const floatingPref = !st(window).space;
        let leaderValue = -1, leader = null;

        for (const w of visibleCandidates()) {
            if (w === window) continue;
            if (!cfg.general.monitor_fallback && w.output !== window.output) continue;
            if ((!st(w).space) !== floatingPref) continue;

            const B = idealBox(w);
            let len = -1;
            const oy = Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
            const ox = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x));
            if (dir === DIR_LEFT && isAdjacent(A.x, A.x + A.w, B.x, B.x + B.w)) len = oy;
            if (dir === DIR_RIGHT && isAdjacent(B.x, B.x + B.w, A.x, A.x + A.w)) len = oy;
            if (dir === DIR_UP && isAdjacent(A.y, A.y + A.h, B.y, B.y + B.h)) len = ox;
            if (dir === DIR_DOWN && isAdjacent(B.y, B.y + B.h, A.y, A.y + A.h)) len = ox;

            const LEADER_SAME = leader && leader.output === window.output;
            if (LEADER_SAME && w.output !== window.output) continue;
            const OVERRIDE = leader && !LEADER_SAME && w.output === window.output;
            if (len <= 1) continue;

            const value = cfg.general.focus_preferred_method === 0 ? history.lastIndexOf(w) : len;
            if (value > leaderValue || OVERRIDE) {
                leaderValue = value;
                leader = w;
            }
        }

        // floating windows: fall back to vector angles (useVectorAngles)
        if (!leader && floatingPref) {
            const ca = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
            let best = Infinity;
            for (const w of visibleCandidates()) {
                if (w === window) continue;
                const B = idealBox(w);
                const dx = B.x + B.w / 2 - ca.x, dy = B.y + B.h / 2 - ca.y;
                const ok = (dir === DIR_LEFT && dx < 0 && Math.abs(dy) <= -dx) || (dir === DIR_RIGHT && dx > 0 && Math.abs(dy) <= dx)
                    || (dir === DIR_UP && dy < 0 && Math.abs(dx) <= -dy) || (dir === DIR_DOWN && dy > 0 && Math.abs(dx) <= dy);
                const d = dx * dx + dy * dy;
                if (ok && d < best) { best = d; leader = w; }
            }
        }
        return leader;
    }

    function focusWindow(w, hard) {
        if (!alive(w)) return;
        const s = st(w);
        if (s.space && spaces[s.space]) {
            const sp = spaces[s.space];
            layoutOf(sp).onFocus(sp, w, hard);
        }
        kwin.ws.activeWindow = w;
    }

    function outputInDirection(output, dir) {
        const f = toRect(kwin.area(kwin.FullScreenArea, output, kwin.ws.currentDesktop));
        const p = focalPointForDir(f, dir);
        const o = kwin.screenAt(p);
        return o && o !== output ? o : null;
    }

    // ------------------------------------------------------------------
    // Dispatchers
    // ------------------------------------------------------------------
    function activeState() {
        const w = kwin.ws.activeWindow;
        if (!alive(w)) return null;
        const s = st(w);
        const sp = s.space ? spaces[s.space] : null;
        return { w: w, s: s, sp: sp, E: sp ? layoutOf(sp) : null };
    }

    function currentSpace() {
        const a = activeState();
        if (a && a.sp) return a.sp;
        // the space under the cursor on the current desktop
        const o = kwin.screenAt(ctx.cursor());
        for (const k in spaces) {
            const sp = spaces[k];
            if (!sp.special && sp.output === o && sp.desktop === kwin.ws.currentDesktop) return sp;
        }
        return null;
    }

    function moveFocus(dir) {
        const a = activeState();
        if (!a) return;
        const t = inDirection(a.w, dir);
        if (t) {
            focusWindow(t, true);
            return;
        }
        if (!cfg.general.monitor_fallback) return;
        const o = outputInDirection(a.w.output, dir);
        if (!o) return;
        for (let i = history.length - 1; i >= 0; --i) {
            const w = history[i];
            if (alive(w) && w.output === o && visibleCandidates().indexOf(w) !== -1) {
                focusWindow(w, true);
                return;
            }
        }
    }

    function moveWindow(dir) {
        const a = activeState();
        if (!a) return;
        if (!a.sp) {
            // floating: Hyprland moves it to the edge of the monitor
            const g = toRect(a.w.frameGeometry);
            const M = toRect(kwin.area(kwin.MaximizeArea, a.w.output, kwin.ws.currentDesktop));
            let x = g.x, y = g.y;
            if (dir === DIR_LEFT) x = M.x;
            if (dir === DIR_RIGHT) x = M.x + M.w - g.w;
            if (dir === DIR_UP) y = M.y;
            if (dir === DIR_DOWN) y = M.y + M.h - g.h;
            setGeom(a.w, x, y, g.w, g.h);
            return;
        }
        if (a.E.moveInDirection(a.sp, a.w, dir))
            return;
        if (!cfg.general.monitor_fallback) return;
        const o = outputInDirection(a.w.output, dir);
        if (!o) return;
        const box = idealBox(a.w);
        const focal = focalPointForDir(box, dir);
        removeFromSpace(a.w);
        a.s.pendingFocal = focal;
        kwin.ws.sendClientToScreen(a.w, o);
        refresh(a.w);
    }

    function swapWindow(dir) {
        const a = activeState();
        if (!a || !a.sp) return;
        const t = inDirection(a.w, dir);
        if (!t) return;
        const ts = st(t);
        if (ts.space === a.s.space) {
            a.E.swap(a.sp, a.w, t);
            return;
        }
        if (!ts.space) return;
        // across monitors: swap their places
        const other = spaces[ts.space];
        const fa = idealBox(a.w), fb = idealBox(t);
        removeFromSpace(a.w);
        removeFromSpace(t);
        a.s.pendingFocal = { x: fb.x + fb.w / 2, y: fb.y + fb.h / 2 };
        ts.pendingFocal = { x: fa.x + fa.w / 2, y: fa.y + fa.h / 2 };
        kwin.ws.sendClientToScreen(a.w, other.output);
        kwin.ws.sendClientToScreen(t, a.sp.output);
        refresh(a.w);
        refresh(t);
    }

    function toggleFloating() {
        const a = activeState();
        if (!a) return;
        if (a.s.floating) {
            a.s.floating = false;
            refresh(a.w);
            return;
        }
        a.s.floating = true;
        removeFromSpace(a.w);
        const g = a.s.floatGeom;
        const M = toRect(kwin.area(kwin.MaximizeArea, a.w.output, kwin.ws.currentDesktop));
        const ww = g ? Math.min(g.w, M.w) : M.w / 2, hh = g ? Math.min(g.h, M.h) : M.h / 2;
        setGeom(a.w, M.x + (M.w - ww) / 2, M.y + (M.h - hh) / 2, ww, hh);
        applyLook(a.w);
    }

    function togglePseudo() {
        const a = activeState();
        if (!a || !a.sp) return;
        a.s.pseudo = !a.s.pseudo;
        a.E.recalc(a.sp);
    }

    // Hyprland "fullscreen 1": fill the work area but stay in the layout
    function toggleMaximize() {
        const a = activeState();
        if (!a) return;
        if (!a.sp) {
            kwin.toggleMaximize(a.w);
            return;
        }
        a.s.fsMode = a.s.fsMode === 1 ? 0 : 1;
        if (a.s.fsMode === 1) {
            const b = workArea(a.sp);
            setGeom(a.w, b.x, b.y, b.w, b.h);
            kwin.raise(a.w);
        } else {
            a.E.recalc(a.sp);
        }
    }

    function toggleFullscreen() {
        const a = activeState();
        if (a) a.w.fullScreen = !a.w.fullScreen;
    }

    function togglePin() {
        const a = activeState();
        if (!a) return;
        if (a.s.space) {
            a.s.floating = true;
            removeFromSpace(a.w);
        }
        a.w.onAllDesktops = !a.w.onAllDesktops;
        applyLook(a.w);
    }

    function centerWindow() {
        const a = activeState();
        if (!a || a.sp) return;
        const g = toRect(a.w.frameGeometry);
        const M = toRect(kwin.area(kwin.MaximizeArea, a.w.output, kwin.ws.currentDesktop));
        setGeom(a.w, M.x + (M.w - g.w) / 2, M.y + (M.h - g.h) / 2, g.w, g.h);
    }

    function resizeActive(dx, dy) {
        const a = activeState();
        if (!a) return;
        if (a.sp) {
            a.E.resize(a.sp, a.w, { x: dx, y: dy }, null);
            return;
        }
        const g = toRect(a.w.frameGeometry);
        setGeom(a.w, g.x, g.y, Math.max(50, g.w + dx), Math.max(50, g.h + dy));
    }

    function moveActive(dx, dy) {
        const a = activeState();
        if (!a || a.sp) return;
        const g = toRect(a.w.frameGeometry);
        setGeom(a.w, g.x + dx, g.y + dy, g.w, g.h);
    }

    function spaceWindowsInOrder(sp) {
        const out = tiledIn(sp).slice();
        for (const w of visibleCandidates())
            if (!st(w).space && w.output === sp.output && out.indexOf(w) === -1)
                out.push(w);
        return out;
    }

    function cycle(step, swap) {
        const a = activeState();
        if (!a) return;
        const sp = a.sp || currentSpace();
        const list = sp ? spaceWindowsInOrder(sp) : visibleCandidates();
        if (list.length < 2) return;
        const i = list.indexOf(a.w);
        const t = list[((i + step) % list.length + list.length) % list.length];
        if (swap) {
            if (a.sp && st(t).space === a.s.space) a.E.swap(a.sp, a.w, t);
            return;
        }
        focusWindow(t, true);
    }

    function focusCurrentOrLast() {
        for (let i = history.length - 2; i >= 0; --i)
            if (alive(history[i]) && !history[i].minimized) {
                focusWindow(history[i], true);
                return;
            }
    }

    function focusUrgentOrLast() {
        for (const id in states) {
            const w = states[id].win;
            if (alive(w) && w.demandsAttention) {
                focusWindow(w, true);
                return;
            }
        }
        focusCurrentOrLast();
    }

    function setLayout(sp, name) {
        if (!sp || !engines[name]) return;
        const old = layoutOf(sp);
        const wins = old.windows(sp);
        old.clear(sp);
        sp.layout = name;
        const E = layoutOf(sp);
        for (const w of wins)
            if (alive(w)) E.add(sp, w, null);
        E.recalc(sp);
    }

    function cycleLayout(step) {
        const sp = currentSpace();
        if (!sp) return;
        const cur = LAYOUTS.indexOf(layoutOf(sp).name);
        setLayout(sp, LAYOUTS[((cur + step) % LAYOUTS.length + LAYOUTS.length) % LAYOUTS.length]);
        kwin.osd("Layout: " + layoutOf(sp).name, "");
    }

    // ---- special workspace (scratchpad) ----
    function internalMinimize(w, value) {
        const s = st(w);
        s.internalMin++;
        try { w.minimized = value; } finally { s.internalMin--; }
    }

    function toggleSpecial() {
        const o = kwin.screenAt(ctx.cursor()) || (kwin.ws.activeWindow ? kwin.ws.activeWindow.output : null);
        if (!o) return;
        const show = !specialShown[o.name];
        specialShown[o.name] = show;
        let last = null;
        for (const id in states) {
            const s = states[id];
            const w = s.win;
            if (!alive(w) || !s.special || w.output !== o) continue;
            if (show) {
                internalMinimize(w, false);
                refresh(w);
                last = w;
            } else {
                removeFromSpace(w);
                internalMinimize(w, true);
                applyLook(w);
            }
        }
        if (last) {
            for (let i = history.length - 1; i >= 0; --i)
                if (st(history[i]).special && history[i].output === o) { last = history[i]; break; }
            focusWindow(last, true);
        }
    }

    function moveToSpecial(silent) {
        const a = activeState();
        if (!a) return;
        const o = a.w.output;
        if (a.s.special) {
            // back to the current desktop
            removeFromSpace(a.w);
            a.s.special = false;
            a.w.onAllDesktops = false;
            a.w.desktops = [kwin.ws.currentDesktop];
            refresh(a.w);
            return;
        }
        removeFromSpace(a.w);
        a.s.special = true;
        a.w.onAllDesktops = true;
        if (specialShown[o.name] && !silent) {
            refresh(a.w);
        } else {
            internalMinimize(a.w, true);
            applyLook(a.w);
        }
    }

    function layoutMsg(layoutName, cmd, arg) {
        const a = activeState();
        if (!a || !a.sp) return;
        if (a.E.name !== layoutName) return;
        a.E.msg(a.sp, a.w, cmd, arg);
    }

    // one key for "make this bigger" whatever the layout
    function ratio(sign) {
        const a = activeState();
        if (!a || !a.sp) return;
        if (a.E.name === "dwindle") a.E.msg(a.sp, a.w, "splitratio", 0.1 * sign);
        else if (a.E.name === "master") a.E.msg(a.sp, a.w, "mfact", 0.05 * sign);
        else if (a.E.name === "scrolling") a.E.msg(a.sp, a.w, "colresize", 0.1 * sign);
    }

    const STEP = function () { return cfg.general.resize_step; };

    const actions = {
        "focus-left": () => moveFocus(DIR_LEFT), "focus-right": () => moveFocus(DIR_RIGHT),
        "focus-up": () => moveFocus(DIR_UP), "focus-down": () => moveFocus(DIR_DOWN),
        "move-left": () => moveWindow(DIR_LEFT), "move-right": () => moveWindow(DIR_RIGHT),
        "move-up": () => moveWindow(DIR_UP), "move-down": () => moveWindow(DIR_DOWN),
        "swap-left": () => swapWindow(DIR_LEFT), "swap-right": () => swapWindow(DIR_RIGHT),
        "swap-up": () => swapWindow(DIR_UP), "swap-down": () => swapWindow(DIR_DOWN),
        "togglefloating": toggleFloating,
        "pseudo": togglePseudo,
        "fullscreen": toggleFullscreen,
        "fullscreen-maximize": toggleMaximize,
        "pin": togglePin,
        "centerwindow": centerWindow,
        "killactive": () => { const a = activeState(); if (a) a.w.closeWindow(); },
        "resize-grow-w": () => resizeActive(STEP(), 0), "resize-shrink-w": () => resizeActive(-STEP(), 0),
        "resize-grow-h": () => resizeActive(0, STEP()), "resize-shrink-h": () => resizeActive(0, -STEP()),
        "moveactive-left": () => moveActive(-STEP(), 0), "moveactive-right": () => moveActive(STEP(), 0),
        "moveactive-up": () => moveActive(0, -STEP()), "moveactive-down": () => moveActive(0, STEP()),
        "cyclenext": () => cycle(1, false), "cycleprev": () => cycle(-1, false),
        "swapnext": () => cycle(1, true), "swapprev": () => cycle(-1, true),
        "focuscurrentorlast": focusCurrentOrLast,
        "focusurgentorlast": focusUrgentOrLast,
        "layout-next": () => cycleLayout(1), "layout-prev": () => cycleLayout(-1),
        "layout-dwindle": () => setLayout(currentSpace(), "dwindle"),
        "layout-master": () => setLayout(currentSpace(), "master"),
        "layout-scrolling": () => setLayout(currentSpace(), "scrolling"),
        "layout-monocle": () => setLayout(currentSpace(), "monocle"),
        "togglespecialworkspace": toggleSpecial,
        "movetoworkspace-special": () => moveToSpecial(false),
        "movetoworkspacesilent-special": () => moveToSpecial(true),
        "retile": () => retileAll(),
        "toggle-tiling": toggleTiling,
        "ratio+": () => ratio(1),
        "ratio-": () => ratio(-1),

        "dwindle:togglesplit": () => layoutMsg("dwindle", "togglesplit"),
        "dwindle:swapsplit": () => layoutMsg("dwindle", "swapsplit"),
        "dwindle:rotatesplit": () => layoutMsg("dwindle", "rotatesplit", 90),
        "dwindle:movetoroot": () => layoutMsg("dwindle", "movetoroot"),
        "dwindle:splitratio+": () => layoutMsg("dwindle", "splitratio", 0.1),
        "dwindle:splitratio-": () => layoutMsg("dwindle", "splitratio", -0.1),
        "dwindle:preselect-l": () => layoutMsg("dwindle", "preselect", DIR_LEFT),
        "dwindle:preselect-r": () => layoutMsg("dwindle", "preselect", DIR_RIGHT),
        "dwindle:preselect-u": () => layoutMsg("dwindle", "preselect", DIR_UP),
        "dwindle:preselect-d": () => layoutMsg("dwindle", "preselect", DIR_DOWN),

        "master:swapwithmaster": () => layoutMsg("master", "swapwithmaster"),
        "master:focusmaster": () => layoutMsg("master", "focusmaster"),
        "master:addmaster": () => layoutMsg("master", "addmaster"),
        "master:removemaster": () => layoutMsg("master", "removemaster"),
        "master:orientationnext": () => layoutMsg("master", "orientationnext"),
        "master:orientationprev": () => layoutMsg("master", "orientationprev"),
        "master:orientationleft": () => layoutMsg("master", "orientationleft"),
        "master:orientationright": () => layoutMsg("master", "orientationright"),
        "master:orientationtop": () => layoutMsg("master", "orientationtop"),
        "master:orientationbottom": () => layoutMsg("master", "orientationbottom"),
        "master:orientationcenter": () => layoutMsg("master", "orientationcenter"),
        "master:mfact+": () => layoutMsg("master", "mfact", 0.05),
        "master:mfact-": () => layoutMsg("master", "mfact", -0.05),
        "master:rollnext": () => layoutMsg("master", "rollnext"),
        "master:rollprev": () => layoutMsg("master", "rollprev"),
        "master:cyclenext": () => layoutMsg("master", "cyclenext"),
        "master:cycleprev": () => layoutMsg("master", "cycleprev"),
        "master:swapnext": () => layoutMsg("master", "swapnext"),
        "master:swapprev": () => layoutMsg("master", "swapprev"),

        "scrolling:move+col": () => layoutMsg("scrolling", "move", "+col"),
        "scrolling:move-col": () => layoutMsg("scrolling", "move", "-col"),
        "scrolling:colresize+conf": () => layoutMsg("scrolling", "colresize", "+conf"),
        "scrolling:colresize-conf": () => layoutMsg("scrolling", "colresize", "-conf"),
        "scrolling:colresize+": () => layoutMsg("scrolling", "colresize", 0.1),
        "scrolling:colresize-": () => layoutMsg("scrolling", "colresize", -0.1),
        "scrolling:fit-active": () => layoutMsg("scrolling", "fit", "active"),
        "scrolling:fit-visible": () => layoutMsg("scrolling", "fit", "visible"),
        "scrolling:fit-all": () => layoutMsg("scrolling", "fit", "all"),
        "scrolling:fit-expand": () => layoutMsg("scrolling", "fit", "expand"),
        "scrolling:fit-toend": () => layoutMsg("scrolling", "fit", "toend"),
        "scrolling:fit-tobeg": () => layoutMsg("scrolling", "fit", "tobeg"),
        "scrolling:focus-l": () => layoutMsg("scrolling", "focus", "l"),
        "scrolling:focus-r": () => layoutMsg("scrolling", "focus", "r"),
        "scrolling:focus-u": () => layoutMsg("scrolling", "focus", "u"),
        "scrolling:focus-d": () => layoutMsg("scrolling", "focus", "d"),
        "scrolling:promote": () => layoutMsg("scrolling", "promote"),
        "scrolling:consume": () => layoutMsg("scrolling", "consume"),
        "scrolling:expel": () => layoutMsg("scrolling", "expel"),
        "scrolling:consume_or_expel-prev": () => layoutMsg("scrolling", "consume_or_expel", "prev"),
        "scrolling:consume_or_expel-next": () => layoutMsg("scrolling", "consume_or_expel", "next"),
        "scrolling:swapcol-l": () => layoutMsg("scrolling", "swapcol", "l"),
        "scrolling:swapcol-r": () => layoutMsg("scrolling", "swapcol", "r"),
        "scrolling:center": () => layoutMsg("scrolling", "center"),
        "scrolling:inhibit_scroll": () => layoutMsg("scrolling", "inhibit_scroll"),
        "scrolling:fit_into_view": () => layoutMsg("scrolling", "fit_into_view"),

        "monocle:cyclenext": () => layoutMsg("monocle", "cyclenext"),
        "monocle:cycleprev": () => layoutMsg("monocle", "cycleprev")
    };

    function retileAll() {
        for (const k in spaces)
            layoutOf(spaces[k]).recalc(spaces[k]);
        applyLookAll();
    }

    // Rebuild everything with fresh settings (after the settings page is saved)
    function reload() {
        const wins = [];
        for (const id in states) {
            const s = states[id];
            if (s.space) wins.push(s.win);
        }
        for (const w of wins) removeFromSpace(w);
        for (const k in spaces) {
            for (const n of LAYOUTS) engines[n].clear(spaces[k]);
            delete spaces[k];
        }
        for (const id in states) {
            const s = states[id];
            s.seen = false;
            firstSight(s.win);
        }
        for (const id in states) refresh(states[id].win);
    }

    return {
        hook: hook,
        forget: forget,
        refresh: refresh,
        dispatch: function (name) {
            const f = actions[name];
            if (!f) { log("unknown action " + name); return; }
            try { f(); } catch (e) { log(name + " failed: " + e + (e && e.stack ? "\n" + e.stack : "")); }
        },
        actions: function () { return Object.keys(actions); },
        onActivated: function (w) {
            if (!alive(w)) return;
            erase(history, w);
            history.push(w);
            const s = st(w);
            if (s.space && spaces[s.space]) {
                const sp = spaces[s.space];
                layoutOf(sp).onFocus(sp, w, false);
            }
            applyLookAll();
        },
        retileAll: retileAll,
        reload: reload,
        // for tests
        _spaces: spaces, _states: states, _engines: engines, _ctx: ctx, _setLayout: setLayout
    };
}
