// Port of Hyprland src/layout/algorithm/tiled/monocle/MonocleAlgorithm.cpp (commit 5177d94).
// Every window fills the work area; only the current one is shown.

function create(ctx) {
    function data(space) {
        if (!space.monocle)
            space.monocle = { targets: [], current: 0 };
        return space.monocle;
    }

    function recalculate(space) {
        const D = data(space);
        if (!D.targets.length || ctx.fullscreenIn(space))
            return;
        if (D.current >= D.targets.length) D.current = D.targets.length - 1;
        if (D.current < 0) D.current = 0;

        for (let i = 0; i < D.targets.length; ++i)
            ctx.setHidden(D.targets[i], i !== D.current);

        const WA = ctx.workArea(space);
        for (const w of D.targets)
            ctx.place(space, w, WA, null);
    }

    function newTarget(space, w) {
        const D = data(space);
        D.targets.push(w);
        D.current = D.targets.length - 1;
        recalculate(space);
        return true;
    }

    function removeTarget(space, w) {
        const D = data(space);
        const INDEX = D.targets.indexOf(w);
        if (INDEX === -1)
            return;
        ctx.setHidden(w, false);
        D.targets.splice(INDEX, 1);

        if (!D.targets.length) {
            D.current = 0;
            return;
        }

        // try to use the last window in history
        const H = ctx.history();
        for (let i = H.length - 1; i >= 0; --i) {
            const idx = D.targets.indexOf(H[i]);
            if (idx !== -1) {
                D.current = idx;
                recalculate(space);
                return;
            }
        }

        if (D.current >= D.targets.length)
            D.current = D.targets.length - 1;
        else if (INDEX <= D.current && D.current > 0)
            D.current--;
        recalculate(space);
    }

    function updateVisible(space) {
        recalculate(space);
        const D = data(space);
        const w = D.targets[D.current];
        if (w)
            ctx.focus(w);
    }

    function cycle(space, step) {
        const D = data(space);
        if (!D.targets.length)
            return;
        D.current = ((D.current + step) % D.targets.length + D.targets.length) % D.targets.length;
        updateVisible(space);
    }

    return {
        name: "monocle",
        add: function (space, w) { return newTarget(space, w); },
        remove: removeTarget,
        recalc: recalculate,
        has: function (space, w) { return data(space).targets.indexOf(w) !== -1; },
        windows: function (space) { return data(space).targets.slice(); },
        boxOf: function (space, w) { return data(space).targets.indexOf(w) !== -1 ? ctx.workArea(space) : null; },
        resize: function (space) { recalculate(space); }, // monocle doesn't support manual resizing
        moveInDirection: function () { return false; },   // only moves to another monitor
        swap: function (space, a, b) {
            const T = data(space).targets;
            const ia = T.indexOf(a), ib = T.indexOf(b);
            if (ia !== -1) T[ia] = b;
            if (ib !== -1) T[ib] = a;
            recalculate(space);
        },
        msg: function (space, win, cmd) {
            if (cmd === "cyclenext") { cycle(space, 1); return true; }
            if (cmd === "cycleprev") { cycle(space, -1); return true; }
            return false;
        },
        // CMonocleAlgorithm::focusTargetUpdate
        onFocus: function (space, w) {
            const D = data(space);
            const idx = D.targets.indexOf(w);
            if (idx !== -1 && idx !== D.current) {
                D.current = idx;
                recalculate(space);
            }
        },
        // CMonocleAlgorithm::getNextCandidate — the window that is now shown
        onClosed: function (space) {
            const D = data(space);
            return D.targets[D.current] || null;
        },
        clear: function (space) {
            if (space.monocle)
                for (const w of space.monocle.targets)
                    ctx.setHidden(w, false);
            space.monocle = null;
        }
    };
}
