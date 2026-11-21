/*
 * HyprKWin Animations — Hyprland-style window animations for KWin 6.
 *
 *   animation = windows, 1, <speed>, <curve>, popin <percent>   -> open:  Pop in / Slide / Fade
 *   animation = windowsOut, 1, ...                               -> close: Pop in / Slide / Fade
 *   animation = windowsMove, 1, ...                              -> tiles glide to new spots
 *
 * Turn off KWin's own Scale / Glide / Fade effects while this one is on.
 */
"use strict";

var hyprAnim = {
    curves: [QEasingCurve.OutBack, QEasingCurve.OutExpo, QEasingCurve.OutCubic, QEasingCurve.InOutCubic, QEasingCurve.Linear],
    styles: ["popin", "slide", "fade", "none"],

    loadConfig: function () {
        hyprAnim.openStyle = hyprAnim.styles[effect.readConfig("OpenStyle", 0)] || "popin";
        hyprAnim.closeStyle = hyprAnim.styles[effect.readConfig("CloseStyle", 0)] || "popin";
        hyprAnim.popin = Math.max(0.1, Math.min(1, effect.readConfig("PopinPercent", 80) / 100));
        hyprAnim.openDuration = animationTime(effect.readConfig("OpenDuration", 250));
        hyprAnim.closeDuration = animationTime(effect.readConfig("CloseDuration", 200));
        hyprAnim.move = effect.readConfig("AnimateMove", true);
        hyprAnim.moveDuration = animationTime(effect.readConfig("MoveDuration", 250));
        hyprAnim.curve = hyprAnim.curves[effect.readConfig("Curve", 0)];
        if (hyprAnim.curve === undefined)
            hyprAnim.curve = QEasingCurve.OutBack;
    },

    isManaged: function (window) {
        if (!window.visible || window.desktopWindow || window.dock || window.splash || window.toolbar
            || window.notification || window.criticalNotification || window.onScreenDisplay || window.popupWindow
            || window.dropdownMenu || window.popupMenu || window.tooltip || window.menu)
            return false;
        return window.normalWindow || window.dialog;
    },

    // from which direction a window should slide (nearest screen edge, like Hyprland "slide")
    slideOffset: function (window) {
        var g = window.geometry;
        var s = effects.clientArea(KWin.FullScreenArea, window);
        var left = g.x + g.width - s.x, right = s.x + s.width - g.x;
        var top = g.y + g.height - s.y, bottom = s.y + s.height - g.y;
        var m = Math.min(left, right, top, bottom);
        if (m === left) return { value1: -left, value2: 0 };
        if (m === right) return { value1: right, value2: 0 };
        if (m === top) return { value1: 0, value2: -top };
        return { value1: 0, value2: bottom };
    },

    animationsFor: function (window, style, opening) {
        var a = [];
        if (style === "popin") {
            var small = { value1: hyprAnim.popin, value2: hyprAnim.popin };
            var full = { value1: 1.0, value2: 1.0 };
            a.push({ type: Effect.Scale, from: opening ? small : full, to: opening ? full : small });
            a.push({ type: Effect.Opacity, from: opening ? 0.0 : 1.0, to: opening ? 1.0 : 0.0 });
        } else if (style === "slide") {
            var off = hyprAnim.slideOffset(window);
            var zero = { value1: 0, value2: 0 };
            a.push({ type: Effect.Translation, from: opening ? off : zero, to: opening ? zero : off });
        } else if (style === "fade") {
            a.push({ type: Effect.Opacity, from: opening ? 0.0 : 1.0, to: opening ? 1.0 : 0.0 });
        }
        return a;
    },

    onWindowAdded: function (window) {
        if (hyprAnim.openStyle === "none" || !hyprAnim.isManaged(window) || effects.hasActiveFullScreenEffect)
            return;
        if (window.data(Effect.WindowAddedGrabRole))
            return;
        window.setData(Effect.WindowAddedGrabRole, effect);
        hyprAnim.cancelMove(window);
        window.hyprOpen = animate({
            window: window,
            curve: hyprAnim.curve,
            duration: hyprAnim.openDuration,
            animations: hyprAnim.animationsFor(window, hyprAnim.openStyle, true)
        });
        window.hyprOpening = true;
        window.hyprOpenTimer = Date.now();
    },

    onWindowClosed: function (window) {
        if (hyprAnim.closeStyle === "none" || !hyprAnim.isManaged(window) || effects.hasActiveFullScreenEffect)
            return;
        if (window.data(Effect.WindowClosedGrabRole))
            return;
        window.setData(Effect.WindowClosedGrabRole, effect);
        hyprAnim.cancelMove(window);
        if (window.hyprOpen) {
            cancel(window.hyprOpen);
            delete window.hyprOpen;
        }
        // closing never overshoots
        var curve = hyprAnim.curve === QEasingCurve.OutBack ? QEasingCurve.InCubic : hyprAnim.curve;
        window.hyprClose = animate({
            window: window,
            curve: curve,
            duration: hyprAnim.closeDuration,
            animations: hyprAnim.animationsFor(window, hyprAnim.closeStyle, false)
        });
    },

    cancelMove: function (window) {
        if (window.hyprMove) {
            cancel(window.hyprMove);
            delete window.hyprMove;
        }
    },

    // windowsMove: the window glides from its old frame to the new one
    onFrameGeometryChanged: function (window, oldGeometry) {
        if (!hyprAnim.move || !hyprAnim.isManaged(window) || effects.hasActiveFullScreenEffect)
            return;
        if (window.move || window.resize || window.fullScreen || window.minimized || window.deleted)
            return;
        // let the open animation finish first
        if (window.hyprOpening && Date.now() - window.hyprOpenTimer < hyprAnim.openDuration)
            return;
        window.hyprOpening = false;

        var g = window.geometry;
        if (!oldGeometry || oldGeometry.width <= 0 || oldGeometry.height <= 0)
            return;
        // parked off-screen by the scrolling layout, or coming back from there: no glide
        if (Math.abs(g.y - oldGeometry.y) > 50000)
            return;
        if (oldGeometry.x === g.x && oldGeometry.y === g.y && oldGeometry.width === g.width && oldGeometry.height === g.height)
            return;

        hyprAnim.cancelMove(window);
        var dx = oldGeometry.x + oldGeometry.width / 2 - (g.x + g.width / 2);
        var dy = oldGeometry.y + oldGeometry.height / 2 - (g.y + g.height / 2);
        window.hyprMove = animate({
            window: window,
            duration: hyprAnim.moveDuration,
            curve: hyprAnim.curve === QEasingCurve.OutBack ? QEasingCurve.OutCubic : hyprAnim.curve,
            animations: [{
                type: Effect.Size,
                from: { value1: oldGeometry.width, value2: oldGeometry.height },
                to: { value1: g.width, value2: g.height }
            }, {
                type: Effect.Translation,
                from: { value1: dx, value2: dy },
                to: { value1: 0, value2: 0 }
            }]
        });
    },

    manage: function (window) {
        window.windowFrameGeometryChanged.connect(hyprAnim.onFrameGeometryChanged);
    },

    init: function () {
        hyprAnim.loadConfig();
        effect.configChanged.connect(hyprAnim.loadConfig);
        effects.windowAdded.connect(function (window) {
            hyprAnim.manage(window);
            hyprAnim.onWindowAdded(window);
        });
        effects.windowClosed.connect(hyprAnim.onWindowClosed);
        var all = effects.stackingOrder;
        for (var i = 0; i < all.length; ++i)
            hyprAnim.manage(all[i]);
    }
};

hyprAnim.init();
