// Port of Hyprland src/layout/algorithm/tiled/dwindle/DwindleAlgorithm.cpp (commit 5177d94).
// Function names and structure follow the original so the two can be diffed by eye.
//
// ctx is supplied by core.js and gives access to config, geometry and KWin.

function create(ctx) {
    const DIR_DEFAULT = -1, DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;

    function C() { return ctx.cfg.dwindle; }
    function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function STICKS(a, b) { return Math.abs(a - b) < 2; }

    function data(space) {
        if (!space.dwindle)
            space.dwindle = { nodes: [], overrideDirection: DIR_DEFAULT, overrideFocalPoint: null };
        return space.dwindle;
    }

    function makeNode() {
        return { parent: null, isNode: false, win: null, children: [null, null],
                 splitTop: false, box: rect(0, 0, 0, 0), splitRatio: 1.0, valid: true };
    }

    // SDwindleNodeData::recalcSizePosRecursive
    function recalcSizePosRecursive(space, node, horizontalOverride, verticalOverride) {
        if (node.children[0]) {
            const box = node.box;
            if (!C().preserve_split && !C().smart_split && !C().precise_mouse_move)
                node.splitTop = box.h * C().split_width_multiplier > box.w;

            if (verticalOverride)
                node.splitTop = true;
            else if (horizontalOverride)
                node.splitTop = false;

            if (!node.splitTop) {
                const FIRSTSIZE = box.w / 2.0 * node.splitRatio;
                node.children[0].box = rect(box.x, box.y, Math.max(0, FIRSTSIZE), box.h);
                node.children[1].box = rect(box.x + FIRSTSIZE, box.y, Math.max(0, box.w - FIRSTSIZE), box.h);
            } else {
                const FIRSTSIZE = box.h / 2.0 * node.splitRatio;
                node.children[0].box = rect(box.x, box.y, box.w, Math.max(0, FIRSTSIZE));
                node.children[1].box = rect(box.x, box.y + FIRSTSIZE, box.w, Math.max(0, box.h - FIRSTSIZE));
            }

            recalcSizePosRecursive(space, node.children[0], false, false);
            recalcSizePosRecursive(space, node.children[1], false, false);
        } else if (node.win) {
            ctx.place(space, node.win, node.box, null);
        }
    }

    function getNodeFromWindow(space, w) {
        if (!w)
            return null;
        for (const n of data(space).nodes)
            if (n.win === w)
                return n;
        return null;
    }

    function getFirstNode(space) {
        const n = data(space).nodes;
        return n.length ? n[0] : null;
    }

    function getMasterNode(space) {
        for (const n of data(space).nodes)
            if (!n.parent)
                return n;
        return null;
    }

    function getClosestNode(space, point, skip) {
        let res = null, distClosest = -1;
        for (const n of data(space).nodes) {
            if (skip && n.win === skip)
                continue;
            if (n.win) {
                const d = ctx.vecToRectDistanceSquared(point, n.box);
                if (!res || d < distClosest) {
                    res = n;
                    distClosest = d;
                }
            }
        }
        return res;
    }

    function nodeAtPoint(space, p) {
        for (const n of data(space).nodes)
            if (n.win && p.x >= n.box.x && p.x < n.box.x + n.box.w && p.y >= n.box.y && p.y < n.box.y + n.box.h)
                return n;
        return null;
    }

    function erase(arr, item) {
        const i = arr.indexOf(item);
        if (i !== -1)
            arr.splice(i, 1);
    }

    // CDwindleAlgorithm::addTarget
    function addTarget(space, target) {
        const D = data(space);
        const WORK_AREA = ctx.workArea(space);

        const PNODE = makeNode();
        D.nodes.push(PNODE);
        PNODE.win = target;

        let OPENINGON = null;
        const MOUSECOORDS = D.overrideFocalPoint || ctx.cursor();
        const ACTIVE = ctx.active();

        if (ctx.spaceVisible(space) && !C().use_active_for_splits) {
            OPENINGON = nodeAtPoint(space, MOUSECOORDS);
            if (OPENINGON === PNODE)
                OPENINGON = null;
            // Hyprland only falls back to the closest node when the cursor is over a panel
            if (!OPENINGON && ctx.cursorOnReserved(space, MOUSECOORDS))
                OPENINGON = getClosestNode(space, MOUSECOORDS, target);
        } else if (C().use_active_for_splits || D.overrideFocalPoint) {
            if (D.overrideFocalPoint)
                OPENINGON = getClosestNode(space, D.overrideFocalPoint, null);
            else if (ACTIVE && ACTIVE !== target && getNodeFromWindow(space, ACTIVE))
                OPENINGON = getNodeFromWindow(space, ACTIVE);

            if (!OPENINGON)
                OPENINGON = getClosestNode(space, MOUSECOORDS, target);
        } else {
            OPENINGON = getFirstNode(space);
        }

        // first, check if OPENINGON isn't too big.
        const PRED = OPENINGON ? OPENINGON.box : WORK_AREA;
        const MAX = ctx.maxSize(target);
        if (MAX && (MAX.w < PRED.w || MAX.h < PRED.h)) {
            erase(D.nodes, PNODE);
            return false; // caller makes it floating
        }

        // last fail-safe to avoid duplicate fullscreens
        if ((!OPENINGON || OPENINGON.win === target) && D.nodes.length > 1) {
            for (const n of D.nodes) {
                if (n.win && n.win !== target) {
                    OPENINGON = n;
                    break;
                }
            }
        }

        // if it's the first, it's easy. Make it maximise-sized.
        if (!OPENINGON || OPENINGON.win === target) {
            PNODE.box = WORK_AREA;
            ctx.place(space, PNODE.win, PNODE.box, null);
            return true;
        }

        const NEWPARENT = makeNode();
        D.nodes.push(NEWPARENT);

        NEWPARENT.box = OPENINGON.box;
        NEWPARENT.parent = OPENINGON.parent;
        NEWPARENT.isNode = true;
        NEWPARENT.splitRatio = clamp(C().default_split_ratio, 0.1, 1.9);

        const B = NEWPARENT.box;
        const SIDEBYSIDE = B.w > B.h * C().split_width_multiplier;
        NEWPARENT.splitTop = !SIDEBYSIDE;

        let horizontalOverride = false, verticalOverride = false;

        if (D.overrideDirection !== DIR_DEFAULT) {
            if (D.overrideDirection % 2 === 0)
                verticalOverride = true;
            else
                horizontalOverride = true;

            // 0 -> top and left | 1,2 -> right and bottom
            if (D.overrideDirection % 3 === 0) {
                NEWPARENT.children[1] = OPENINGON;
                NEWPARENT.children[0] = PNODE;
            } else {
                NEWPARENT.children[0] = OPENINGON;
                NEWPARENT.children[1] = PNODE;
            }

            if (!C().permanent_direction_override)
                D.overrideDirection = DIR_DEFAULT;
        } else if (C().smart_split || (C().precise_mouse_move && ctx.wasDragging())) {
            const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
            const PARENT_PROPORTIONS = B.h / B.w;
            const dx = MOUSECOORDS.x - cx, dy = MOUSECOORDS.y - cy;
            const DELTA_SLOPE = dy / dx;

            if (Math.abs(DELTA_SLOPE) < PARENT_PROPORTIONS) {
                NEWPARENT.splitTop = false;
                if (dx > 0) { NEWPARENT.children[0] = OPENINGON; NEWPARENT.children[1] = PNODE; }
                else        { NEWPARENT.children[0] = PNODE; NEWPARENT.children[1] = OPENINGON; }
            } else {
                NEWPARENT.splitTop = true;
                if (dy > 0) { NEWPARENT.children[0] = OPENINGON; NEWPARENT.children[1] = PNODE; }
                else        { NEWPARENT.children[0] = PNODE; NEWPARENT.children[1] = OPENINGON; }
            }
        } else if (C().force_split === 0 || D.overrideFocalPoint || ctx.wasDragging()) {
            if ((SIDEBYSIDE && MOUSECOORDS.x < B.x + B.w / 2) || (!SIDEBYSIDE && MOUSECOORDS.y < B.y + B.h / 2)) {
                NEWPARENT.children[1] = OPENINGON;
                NEWPARENT.children[0] = PNODE;
            } else {
                NEWPARENT.children[0] = OPENINGON;
                NEWPARENT.children[1] = PNODE;
            }
        } else if (C().force_split === 1) {
            NEWPARENT.children[1] = OPENINGON;
            NEWPARENT.children[0] = PNODE;
        } else {
            NEWPARENT.children[0] = OPENINGON;
            NEWPARENT.children[1] = PNODE;
        }

        // split in favor of a specific window
        if (C().split_bias && NEWPARENT.children[0] === PNODE)
            NEWPARENT.splitRatio = 2 - NEWPARENT.splitRatio;

        if (OPENINGON.parent) {
            if (OPENINGON.parent.children[0] === OPENINGON)
                OPENINGON.parent.children[0] = NEWPARENT;
            else
                OPENINGON.parent.children[1] = NEWPARENT;
        }

        OPENINGON.parent = NEWPARENT;
        PNODE.parent = NEWPARENT;

        recalcSizePosRecursive(space, NEWPARENT, horizontalOverride, verticalOverride);
        calculateWorkspace(space);
        return true;
    }

    // CDwindleAlgorithm::removeTarget
    function removeTarget(space, target) {
        const D = data(space);
        const PNODE = getNodeFromWindow(space, target);
        if (!PNODE)
            return;

        const PPARENT = PNODE.parent;
        if (!PPARENT) {
            erase(D.nodes, PNODE);
            return;
        }

        const PSIBLING = PPARENT.children[0] === PNODE ? PPARENT.children[1] : PPARENT.children[0];
        PSIBLING.parent = PPARENT.parent;

        if (PPARENT.parent) {
            if (PPARENT.parent.children[0] === PPARENT)
                PPARENT.parent.children[0] = PSIBLING;
            else
                PPARENT.parent.children[1] = PSIBLING;
        }

        PPARENT.valid = false;
        PNODE.valid = false;
        erase(D.nodes, PPARENT);
        erase(D.nodes, PNODE);

        recalculate(space);
    }

    function recalculate(space) {
        if (ctx.fullscreenIn(space))
            return;
        calculateWorkspace(space);
    }

    function calculateWorkspace(space) {
        if (ctx.fullscreenIn(space))
            return;
        const TOPNODE = getMasterNode(space);
        if (TOPNODE) {
            TOPNODE.box = ctx.workArea(space);
            recalcSizePosRecursive(space, TOPNODE, false, false);
        }
    }

    // CDwindleAlgorithm::resizeTarget — delta {x,y}, corner {l,t,r,b} (all false = CORNER_NONE)
    function resizeTarget(space, target, delta, corner) {
        const PNODE = getNodeFromWindow(space, target);
        if (!PNODE)
            return;
        corner = corner || { l: false, t: false, r: false, b: false };

        const WA = ctx.workArea(space);
        const BOX = PNODE.box;
        const DISPLAYLEFT = STICKS(BOX.x, WA.x);
        const DISPLAYRIGHT = STICKS(BOX.x + BOX.w, WA.x + WA.w);
        const DISPLAYTOP = STICKS(BOX.y, WA.y);
        const DISPLAYBOTTOM = STICKS(BOX.y + BOX.h, WA.y + WA.h);

        const allowed = { x: delta.x, y: delta.y };
        if (DISPLAYLEFT && DISPLAYRIGHT)
            allowed.x = 0;
        if (DISPLAYBOTTOM && DISPLAYTOP)
            allowed.y = 0;

        if (C().smart_resizing) {
            let PVOUTER = null, PVINNER = null, PHOUTER = null, PHINNER = null;

            const LEFT = corner.l || DISPLAYRIGHT;
            const TOP = corner.t || DISPLAYBOTTOM;
            const RIGHT = corner.r || DISPLAYLEFT;
            const BOTTOM = corner.b || DISPLAYTOP;
            const NONE = !corner.l && !corner.t && !corner.r && !corner.b;

            for (let PCURRENT = PNODE; PCURRENT && PCURRENT.parent; PCURRENT = PCURRENT.parent) {
                const PPARENT = PCURRENT.parent;

                if (!PVOUTER && PPARENT.splitTop && (NONE || (TOP && PPARENT.children[1] === PCURRENT) || (BOTTOM && PPARENT.children[0] === PCURRENT)))
                    PVOUTER = PCURRENT;
                else if (!PVOUTER && !PVINNER && PPARENT.splitTop)
                    PVINNER = PCURRENT;
                else if (!PHOUTER && !PPARENT.splitTop && (NONE || (LEFT && PPARENT.children[1] === PCURRENT) || (RIGHT && PPARENT.children[0] === PCURRENT)))
                    PHOUTER = PCURRENT;
                else if (!PHOUTER && !PHINNER && !PPARENT.splitTop)
                    PHINNER = PCURRENT;

                if (PVOUTER && PHOUTER)
                    break;
            }

            if (PHOUTER) {
                PHOUTER.parent.splitRatio = clamp(PHOUTER.parent.splitRatio + allowed.x * 2 / PHOUTER.parent.box.w, 0.1, 1.9);

                if (PHINNER) {
                    const ORIGINAL = PHINNER.box.w;
                    recalcSizePosRecursive(space, PHOUTER.parent, false, false);
                    if (PHINNER.parent.children[0] === PHINNER)
                        PHINNER.parent.splitRatio = clamp((ORIGINAL - allowed.x) / PHINNER.parent.box.w * 2, 0.1, 1.9);
                    else
                        PHINNER.parent.splitRatio = clamp(2 - (ORIGINAL + allowed.x) / PHINNER.parent.box.w * 2, 0.1, 1.9);
                    recalcSizePosRecursive(space, PHINNER.parent, false, false);
                } else
                    recalcSizePosRecursive(space, PHOUTER.parent, false, false);
            }

            if (PVOUTER) {
                PVOUTER.parent.splitRatio = clamp(PVOUTER.parent.splitRatio + allowed.y * 2 / PVOUTER.parent.box.h, 0.1, 1.9);

                if (PVINNER) {
                    const ORIGINAL = PVINNER.box.h;
                    recalcSizePosRecursive(space, PVOUTER.parent, false, false);
                    if (PVINNER.parent.children[0] === PVINNER)
                        PVINNER.parent.splitRatio = clamp((ORIGINAL - allowed.y) / PVINNER.parent.box.h * 2, 0.1, 1.9);
                    else
                        PVINNER.parent.splitRatio = clamp(2 - (ORIGINAL + allowed.y) / PVINNER.parent.box.h * 2, 0.1, 1.9);
                    recalcSizePosRecursive(space, PVINNER.parent, false, false);
                } else
                    recalcSizePosRecursive(space, PVOUTER.parent, false, false);
            }

            if (!PHOUTER && !PVOUTER)
                calculateWorkspace(space);
            return;
        }

        const PPARENT = PNODE.parent;
        if (!PPARENT) {
            calculateWorkspace(space);
            return;
        }

        const PARENTSIDEBYSIDE = !PPARENT.splitTop;
        let PPARENT2 = PPARENT.parent;

        const oneAxis = function () {
            if (PARENTSIDEBYSIDE)
                PPARENT.splitRatio = clamp(PPARENT.splitRatio + allowed.x * 2 / PPARENT.box.w, 0.1, 1.9);
            else
                PPARENT.splitRatio = clamp(PPARENT.splitRatio + allowed.y * 2 / PPARENT.box.h, 0.1, 1.9);
            recalcSizePosRecursive(space, PPARENT, false, false);
        };

        if (!PPARENT2) {
            oneAxis();
            return;
        }

        while (PPARENT2 && PPARENT2.splitTop === !PARENTSIDEBYSIDE)
            PPARENT2 = PPARENT2.parent;

        if (!PPARENT2) {
            oneAxis();
            return;
        }

        const SIDECONTAINER = PARENTSIDEBYSIDE ? PPARENT : PPARENT2;
        const TOPCONTAINER = PARENTSIDEBYSIDE ? PPARENT2 : PPARENT;

        SIDECONTAINER.splitRatio = clamp(SIDECONTAINER.splitRatio + allowed.x * 2 / SIDECONTAINER.box.w, 0.1, 1.9);
        TOPCONTAINER.splitRatio = clamp(TOPCONTAINER.splitRatio + allowed.y * 2 / TOPCONTAINER.box.h, 0.1, 1.9);
        recalcSizePosRecursive(space, SIDECONTAINER, false, false);
        recalcSizePosRecursive(space, TOPCONTAINER, false, false);
    }

    // CDwindleAlgorithm::moveTargetInDirection (same-space part). Returns false when the
    // focal point is outside this space, so core can try the next monitor.
    function moveTargetInDirection(space, t, dir) {
        const D = data(space);
        const PNODE = getNodeFromWindow(space, t);
        if (!PNODE)
            return false;

        const FOCAL = ctx.focalPointForDir(PNODE.box, dir);
        const WA = ctx.workArea(space);
        if (FOCAL.x < WA.x || FOCAL.y < WA.y || FOCAL.x > WA.x + WA.w || FOCAL.y > WA.y + WA.h)
            return false;

        const P = PNODE.parent;
        if (P) {
            if ((dir === DIR_UP && P.splitTop && P.children[1] === PNODE && !P.children[0].isNode)
                || (dir === DIR_DOWN && P.splitTop && P.children[0] === PNODE && !P.children[1].isNode)
                || (dir === DIR_LEFT && !P.splitTop && P.children[1] === PNODE && !P.children[0].isNode)
                || (dir === DIR_RIGHT && !P.splitTop && P.children[0] === PNODE && !P.children[1].isNode))
                D.overrideDirection = dir;
        }

        removeTarget(space, t);
        movedTarget(space, t, FOCAL);
        return true;
    }

    function movedTarget(space, target, focalPoint) {
        const D = data(space);
        D.overrideFocalPoint = focalPoint || null;
        const ok = addTarget(space, target);
        D.overrideFocalPoint = null;
        return ok;
    }

    function swapTargets(space, a, b) {
        const na = getNodeFromWindow(space, a), nb = getNodeFromWindow(space, b);
        if (na) na.win = b;
        if (nb) nb.win = a;
    }

    // ---- layoutmsg ----
    function toggleSplit(space, x) {
        if (!x || !x.parent)
            return;
        x.parent.splitTop = !x.parent.splitTop;
        recalcSizePosRecursive(space, x.parent, false, false);
    }

    function swapSplit(space, x) {
        if (!x || !x.parent)
            return;
        const c = x.parent.children;
        const t = c[0]; c[0] = c[1]; c[1] = t;
        recalcSizePosRecursive(space, x.parent, false, false);
    }

    function rotateSplit(space, x, angle) {
        if (!x || !x.parent)
            return;
        const normalized = ((Math.trunc(angle / 90) % 4) + 4) % 4;
        const p = x.parent;
        let shouldSwap = false;
        if (normalized === 1) {
            if (p.splitTop) shouldSwap = true;
            p.splitTop = !p.splitTop;
        } else if (normalized === 2) {
            shouldSwap = true;
        } else if (normalized === 3) {
            if (!p.splitTop) shouldSwap = true;
            p.splitTop = !p.splitTop;
        }
        if (shouldSwap) {
            const t = p.children[0]; p.children[0] = p.children[1]; p.children[1] = t;
        }
        recalcSizePosRecursive(space, p, false, false);
    }

    function moveToRoot(space, x, stable) {
        if (!x || !x.parent || !x.parent.parent)
            return;

        const xParent = x.parent;
        const xIdx = xParent.children[0] === x ? 0 : 1;

        let pAncestor = x, pRoot = x.parent;
        while (pRoot.parent) {
            pAncestor = pRoot;
            pRoot = pRoot.parent;
        }
        const swapIdx = pRoot.children[0] === pAncestor ? 1 : 0;
        const pSwap = pRoot.children[swapIdx];

        xParent.children[xIdx] = pSwap;
        pRoot.children[swapIdx] = x;
        const tp = x.parent; x.parent = pSwap.parent; pSwap.parent = tp;

        if (stable) {
            const t = pRoot.children[0]; pRoot.children[0] = pRoot.children[1]; pRoot.children[1] = t;
        }
        recalcSizePosRecursive(space, pRoot, false, false);
    }

    function layoutMsg(space, win, cmd, arg) {
        const node = getNodeFromWindow(space, win);
        switch (cmd) {
        case "togglesplit": toggleSplit(space, node); break;
        case "swapsplit": swapSplit(space, node); break;
        case "rotatesplit": rotateSplit(space, node, arg === undefined ? 90 : arg); break;
        case "movetoroot": moveToRoot(space, node, arg !== "unstable"); break;
        case "preselect": data(space).overrideDirection = arg; break;
        case "splitratio":
            if (node && node.parent) {
                node.parent.splitRatio = clamp(node.parent.splitRatio + arg, 0.1, 1.9);
                recalcSizePosRecursive(space, node.parent, false, false);
            }
            break;
        default: return false;
        }
        return true;
    }

    // ---- interface used by core.js ----
    return {
        name: "dwindle",
        add: function (space, w, opts) {
            return opts && opts.focal ? movedTarget(space, w, opts.focal) : addTarget(space, w);
        },
        remove: removeTarget,
        recalc: recalculate,
        has: function (space, w) { return !!getNodeFromWindow(space, w); },
        windows: function (space) {
            const out = [];
            const walk = function (n) {
                if (!n) return;
                if (n.win) out.push(n.win);
                walk(n.children[0]);
                walk(n.children[1]);
            };
            walk(getMasterNode(space));
            return out;
        },
        boxOf: function (space, w) { const n = getNodeFromWindow(space, w); return n ? n.box : null; },
        resize: resizeTarget,
        moveInDirection: moveTargetInDirection,
        swap: function (space, a, b) { swapTargets(space, a, b); recalculate(space); },
        msg: layoutMsg,
        onFocus: function () {},
        // CDwindleAlgorithm::getNextCandidate
        onClosed: function (space, oldBox) {
            const n = getClosestNode(space, { x: oldBox.x + oldBox.w / 2, y: oldBox.y + oldBox.h / 2 }, null);
            if (n) return n.win;
            const f = getFirstNode(space);
            return f ? f.win : null;
        },
        clear: function (space) { space.dwindle = null; }
    };
}
