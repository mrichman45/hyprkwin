// Port of Hyprland src/layout/algorithm/tiled/master/MasterAlgorithm.cpp (commit 5177d94).

function create(ctx) {
    const O_LEFT = 0, O_TOP = 1, O_RIGHT = 2, O_BOTTOM = 3, O_CENTER = 4;
    const DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;

    function C() { return ctx.cfg.master; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function STICKS(a, b) { return Math.abs(a - b) < 2; }

    function data(space) {
        if (!space.master)
            space.master = { nodes: [], explicitOrientation: null, focusMasterPrev: null };
        return space.master;
    }

    function makeNode(w) {
        return { isMaster: false, percMaster: 0.5, win: w, position: { x: 0, y: 0 }, size: { x: 0, y: 0 }, percSize: 1.0 };
    }

    function nodes(space) { return data(space).nodes; }
    function getNodesNo(space) { return nodes(space).length; }
    function getMastersNo(space) { return nodes(space).filter(n => n.isMaster).length; }
    function getNodeFromWindow(space, w) {
        if (!w) return null;
        for (const n of nodes(space)) if (n.win === w) return n;
        return null;
    }
    function getMasterNode(space) {
        for (const n of nodes(space)) if (n.isMaster) return n;
        return null;
    }
    function boxOfNode(n) { return { x: n.position.x, y: n.position.y, w: n.size.x, h: n.size.y }; }
    function middle(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    function contains(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
    function erase(arr, item) { const i = arr.indexOf(item); if (i !== -1) arr.splice(i, 1); }

    function parseOrientation(s) {
        switch (s) {
        case "top": return O_TOP;
        case "right": return O_RIGHT;
        case "bottom": return O_BOTTOM;
        case "center": return O_CENTER;
        }
        return O_LEFT;
    }
    function defaultOrientation() { return parseOrientation(C().orientation); }
    function getDynamicOrientation(space) {
        const e = data(space).explicitOrientation;
        return e === null ? defaultOrientation() : e;
    }

    // Center-master slaves alternate left/right columns starting on the fallback side.
    function centerSlaveColumns(slaveCount, extraToRight) {
        const LARGER = 1 + Math.floor((slaveCount - 1) / 2);
        const SMALLER = slaveCount - LARGER;
        return extraToRight ? [SMALLER, LARGER] : [LARGER, SMALLER];
    }

    function getClosestNode(space, point) {
        let res = null, distClosest = -1;
        for (const n of nodes(space)) {
            const d = ctx.vecToRectDistanceSquared(point, boxOfNode(n));
            if (!res || d < distClosest) { res = n; distClosest = d; }
        }
        return res;
    }

    // CMasterAlgorithm::addTarget
    function addTarget(space, target, firstMap) {
        const v = nodes(space);
        const DRAGMOVE = ctx.wasDragging();
        const CENTERED = getDynamicOrientation(space) === O_CENTER && getNodesNo(space) - getMastersNo(space) >= C().slave_count_for_center_master;
        const CENTERCURSORDROP = C().drop_at_cursor && DRAGMOVE && CENTERED;
        let dragOntoMaster = false;

        if (DRAGMOVE && (getNodesNo(space) > 1 || !C().drop_at_cursor) && !CENTERCURSORDROP) {
            const n = getClosestNode(space, ctx.cursor());
            if (n && n.isMaster)
                dragOntoMaster = true;
        }

        const BNEWBEFOREACTIVE = C().new_on_active === "before";
        const BNEWISMASTER = dragOntoMaster || (!DRAGMOVE && C().new_status === "master");

        const PNODE = makeNode(target);
        (function () {
            if (C().new_on_active !== "none" && !BNEWISMASTER) {
                const pLastNode = getNodeFromWindow(space, ctx.active());
                if (pLastNode && !(pLastNode.isMaster && (getMastersNo(space) === 1 || C().new_status === "slave"))) {
                    let it = v.indexOf(pLastNode);
                    if (!BNEWBEFOREACTIVE)
                        ++it;
                    v.splice(it, 0, PNODE);
                    return;
                }
            }
            if (C().new_on_top) v.unshift(PNODE); else v.push(PNODE);
        })();

        const WINDOWSONWORKSPACE = getNodesNo(space);
        let lastSplitPercent = C().mfact;

        const activeNode = getNodeFromWindow(space, ctx.active());
        const OPENINGON = activeNode && activeNode !== PNODE ? activeNode : getMasterNode(space);
        const MOUSECOORDS = ctx.cursor();
        const orientation = getDynamicOrientation(space);
        let forceDropAsMaster = false;

        if (C().drop_at_cursor && DRAGMOVE) {
            if (CENTERED) {
                const PMASTER = getMasterNode(space);
                if (PMASTER) {
                    const MBOX = boxOfNode(PMASTER);
                    if (MOUSECOORDS.x >= MBOX.x && MOUSECOORDS.x <= MBOX.x + MBOX.w)
                        forceDropAsMaster = true;
                    else {
                        const DROPRIGHT = MOUSECOORDS.x > middle(MBOX).x;
                        const FIRSTSIDERIGHT = C().center_master_fallback === "right";
                        erase(v, PNODE);

                        let slot = 0, slavesNo = 0;
                        for (const nd of v) {
                            if (nd.isMaster) continue;
                            const ndRight = (slavesNo % 2 === 0) === FIRSTSIDERIGHT;
                            if (ndRight === DROPRIGHT && MOUSECOORDS.y > middle(boxOfNode(nd)).y)
                                ++slot;
                            ++slavesNo;
                        }

                        const TARGETFIRSTSIDE = DROPRIGHT === FIRSTSIDERIGHT;
                        const TOTALSLAVES = slavesNo + 1;
                        const TARGETCAP = TARGETFIRSTSIDE ? Math.floor((TOTALSLAVES + 1) / 2) : Math.floor(TOTALSLAVES / 2);
                        if (TARGETCAP > 0)
                            slot = Math.min(slot, TARGETCAP - 1);
                        const INSERTSLAVEPOS = TARGETCAP === 0 ? 0 : (TARGETFIRSTSIDE ? 2 * slot : 2 * slot + 1);

                        let insertIndex = v.length, counted = 0;
                        for (let i = 0; i < v.length; ++i) {
                            if (counted === INSERTSLAVEPOS) { insertIndex = i; break; }
                            if (!v[i].isMaster) ++counted;
                        }
                        v.splice(insertIndex, 0, PNODE);
                    }
                }
            } else if (WINDOWSONWORKSPACE > 2) {
                const srcIndex = v.indexOf(PNODE);
                for (let i = 0; i < v.length; ++i) {
                    const box = boxOfNode(v[i]);
                    if (!contains(box, MOUSECOORDS))
                        continue;
                    let insertIndex = i;
                    if ((orientation === O_LEFT || orientation === O_RIGHT) && MOUSECOORDS.y > middle(box).y)
                        ++insertIndex;
                    if ((orientation === O_TOP || orientation === O_BOTTOM) && MOUSECOORDS.x > middle(box).x)
                        ++insertIndex;
                    if (insertIndex > srcIndex)
                        --insertIndex;
                    if (insertIndex === srcIndex)
                        break;
                    const node = v.splice(srcIndex, 1)[0];
                    v.splice(insertIndex, 0, node);
                    break;
                }
            } else if (WINDOWSONWORKSPACE === 2) {
                for (const nd of v) {
                    if (!nd.isMaster) continue;
                    const M = middle(boxOfNode(nd));
                    if ((orientation === O_LEFT || orientation === O_CENTER) && MOUSECOORDS.x < M.x) forceDropAsMaster = true;
                    if (orientation === O_RIGHT && MOUSECOORDS.x > M.x) forceDropAsMaster = true;
                    if (orientation === O_TOP && MOUSECOORDS.y < M.y) forceDropAsMaster = true;
                    if (orientation === O_BOTTOM && MOUSECOORDS.y > M.y) forceDropAsMaster = true;
                    break;
                }
            }
        }

        const MON = ctx.monitorSize(space);
        const MAX = ctx.maxSize(target);

        if (BNEWISMASTER || WINDOWSONWORKSPACE === 1 || (WINDOWSONWORKSPACE > 2 && !firstMap && OPENINGON && OPENINGON.isMaster)
            || forceDropAsMaster || (C().new_status === "inherit" && OPENINGON && OPENINGON.isMaster && !DRAGMOVE)) {
            const list = BNEWBEFOREACTIVE ? v.slice().reverse() : v;
            for (const nd of list) {
                if (nd.isMaster && nd !== PNODE) {
                    nd.isMaster = false;
                    lastSplitPercent = nd.percMaster;
                    break;
                }
            }
            PNODE.isMaster = true;
            PNODE.percMaster = lastSplitPercent;

            if (MAX && (MAX.w < MON.w * lastSplitPercent || MAX.h < MON.h)) {
                erase(v, PNODE);
                return false;
            }
        } else {
            PNODE.isMaster = false;
            PNODE.percMaster = lastSplitPercent;

            if (MAX && (MAX.w < MON.w * (1 - lastSplitPercent) || MAX.h < MON.h * (1 / (WINDOWSONWORKSPACE - 1)))) {
                erase(v, PNODE);
                return false;
            }
        }

        calculateWorkspace(space);
        return true;
    }

    // CMasterAlgorithm::removeTarget
    function removeTarget(space, target) {
        const v = nodes(space);
        const MASTERSLEFT = getMastersNo(space);
        const PNODE = getNodeFromWindow(space, target);
        if (!PNODE)
            return;

        if (PNODE.isMaster && (MASTERSLEFT <= 1 || C().allow_small_split)) {
            for (const nd of v) {
                if (!nd.isMaster) {
                    nd.isMaster = true;
                    nd.percMaster = PNODE.percMaster;
                    break;
                }
            }
        }

        erase(v, PNODE);

        if (getMastersNo(space) === getNodesNo(space) && MASTERSLEFT > 1) {
            if (v.length) v[v.length - 1].isMaster = false;
        }
        if (getNodesNo(space) === 1) {
            for (const nd of v) {
                if (!nd.isMaster) { nd.isMaster = true; break; }
            }
        }

        if (data(space).focusMasterPrev === target)
            data(space).focusMasterPrev = null;

        calculateWorkspace(space);
    }

    function recalculate(space) {
        if (ctx.fullscreenIn(space))
            return;
        calculateWorkspace(space);
    }

    function setPos(space, nd) {
        ctx.place(space, nd.win, boxOfNode(nd), null);
    }

    // CMasterAlgorithm::calculateWorkspace
    function calculateWorkspace(space) {
        const PMASTERNODE = getMasterNode(space);
        if (!PMASTERNODE || ctx.fullscreenIn(space))
            return;
        const v = nodes(space);

        let orientation = getDynamicOrientation(space);
        let centerMasterWindow = false;
        const MASTERS = getMastersNo(space);
        const WINDOWS = getNodesNo(space);
        const STACKWINDOWS = WINDOWS - MASTERS;
        const WORKAREA = ctx.workArea(space);
        const RES = ctx.reserved(space);
        const reservedLeft = RES.left, reservedRight = RES.right;
        const UNRESERVED_WIDTH = WORKAREA.w + reservedLeft + reservedRight;
        const IGN = C().center_ignores_reserved;
        const SMART = C().smart_resizing;

        if (orientation === O_CENTER) {
            if (STACKWINDOWS >= C().slave_count_for_center_master)
                centerMasterWindow = true;
            else
                orientation = parseOrientation(C().center_master_fallback);
        }

        const totalSize = (orientation === O_TOP || orientation === O_BOTTOM) ? WORKAREA.w : WORKAREA.h;
        const masterAverageSize = totalSize / MASTERS;
        const slaveAverageSize = totalSize / STACKWINDOWS;
        let masterAccumulatedSize = 0, slaveAccumulatedSize = 0;

        if (SMART) {
            for (const nd of v) {
                if (nd.isMaster) masterAccumulatedSize += totalSize / MASTERS * nd.percSize;
                else slaveAccumulatedSize += totalSize / STACKWINDOWS * nd.percSize;
            }
        }

        if (WINDOWS === 1 && !centerMasterWindow) {
            if (C().always_keep_position) {
                const WIDTH = WORKAREA.w * PMASTERNODE.percMaster;
                let nextX = 0;
                if (orientation === O_RIGHT) nextX = WORKAREA.w - WIDTH;
                else if (orientation === O_CENTER) nextX = (WORKAREA.w - WIDTH) / 2;
                PMASTERNODE.size = { x: WIDTH, y: WORKAREA.h };
                PMASTERNODE.position = { x: WORKAREA.x + nextX, y: WORKAREA.y };
            } else {
                PMASTERNODE.size = { x: WORKAREA.w, y: WORKAREA.h };
                PMASTERNODE.position = { x: WORKAREA.x, y: WORKAREA.y };
            }
            setPos(space, PMASTERNODE);
            return;
        } else if (orientation === O_TOP || orientation === O_BOTTOM) {
            const HEIGHT = STACKWINDOWS !== 0 ? WORKAREA.h * PMASTERNODE.percMaster : WORKAREA.h;
            let widthLeft = WORKAREA.w, mastersLeft = MASTERS, nextX = 0, nextY = 0;
            if (orientation === O_BOTTOM) nextY = WORKAREA.h - HEIGHT;

            for (const nd of v) {
                if (!nd.isMaster) continue;
                let WIDTH = mastersLeft > 1 ? widthLeft / mastersLeft * nd.percSize : widthLeft;
                if (WIDTH > widthLeft * 0.9 && mastersLeft > 1) WIDTH = widthLeft * 0.9;
                if (SMART) {
                    nd.percSize *= WORKAREA.w / masterAccumulatedSize;
                    WIDTH = masterAverageSize * nd.percSize;
                }
                nd.size = { x: WIDTH, y: HEIGHT };
                nd.position = { x: WORKAREA.x + nextX, y: WORKAREA.y + nextY };
                setPos(space, nd);
                mastersLeft--;
                widthLeft -= WIDTH;
                nextX += WIDTH;
            }
        } else {
            const TOTAL_WIDTH = IGN && centerMasterWindow ? UNRESERVED_WIDTH : WORKAREA.w;
            let WIDTH = TOTAL_WIDTH, heightLeft = WORKAREA.h, mastersLeft = MASTERS, nextX = 0, nextY = 0;
            if (STACKWINDOWS > 0 || centerMasterWindow) WIDTH *= PMASTERNODE.percMaster;
            if (orientation === O_RIGHT) nextX = WORKAREA.w - WIDTH;
            else if (centerMasterWindow) nextX += (TOTAL_WIDTH - WIDTH) / 2;

            for (const nd of v) {
                if (!nd.isMaster) continue;
                let HEIGHT = mastersLeft > 1 ? heightLeft / mastersLeft * nd.percSize : heightLeft;
                if (HEIGHT > heightLeft * 0.9 && mastersLeft > 1) HEIGHT = heightLeft * 0.9;
                if (SMART) {
                    nd.percSize *= WORKAREA.h / masterAccumulatedSize;
                    HEIGHT = masterAverageSize * nd.percSize;
                }
                nd.size = { x: WIDTH, y: HEIGHT };
                const baseX = IGN && centerMasterWindow ? WORKAREA.x - reservedLeft : WORKAREA.x;
                nd.position = { x: baseX + nextX, y: WORKAREA.y + nextY };
                setPos(space, nd);
                mastersLeft--;
                heightLeft -= HEIGHT;
                nextY += HEIGHT;
            }
        }

        if (STACKWINDOWS === 0)
            return;

        let slavesLeft = STACKWINDOWS;
        if (orientation === O_TOP || orientation === O_BOTTOM) {
            const HEIGHT = WORKAREA.h - PMASTERNODE.size.y;
            let widthLeft = WORKAREA.w, nextX = 0, nextY = 0;
            if (orientation === O_TOP) nextY = PMASTERNODE.size.y;

            for (const nd of v) {
                if (nd.isMaster) continue;
                let WIDTH = slavesLeft > 1 ? widthLeft / slavesLeft * nd.percSize : widthLeft;
                if (WIDTH > widthLeft * 0.9 && slavesLeft > 1) WIDTH = widthLeft * 0.9;
                if (SMART) {
                    nd.percSize *= WORKAREA.w / slaveAccumulatedSize;
                    WIDTH = slaveAverageSize * nd.percSize;
                }
                nd.size = { x: WIDTH, y: HEIGHT };
                nd.position = { x: WORKAREA.x + nextX, y: WORKAREA.y + nextY };
                setPos(space, nd);
                slavesLeft--;
                widthLeft -= WIDTH;
                nextX += WIDTH;
            }
        } else if (orientation === O_LEFT || orientation === O_RIGHT) {
            const WIDTH = WORKAREA.w - PMASTERNODE.size.x;
            let heightLeft = WORKAREA.h, nextY = 0, nextX = 0;
            if (orientation === O_LEFT) nextX = PMASTERNODE.size.x;

            for (const nd of v) {
                if (nd.isMaster) continue;
                let HEIGHT = slavesLeft > 1 ? heightLeft / slavesLeft * nd.percSize : heightLeft;
                if (HEIGHT > heightLeft * 0.9 && slavesLeft > 1) HEIGHT = heightLeft * 0.9;
                if (SMART) {
                    nd.percSize *= WORKAREA.h / slaveAccumulatedSize;
                    HEIGHT = slaveAverageSize * nd.percSize;
                }
                nd.size = { x: WIDTH, y: HEIGHT };
                nd.position = { x: WORKAREA.x + nextX, y: WORKAREA.y + nextY };
                setPos(space, nd);
                slavesLeft--;
                heightLeft -= HEIGHT;
                nextY += HEIGHT;
            }
        } else {
            const WIDTH = ((IGN ? UNRESERVED_WIDTH : WORKAREA.w) - PMASTERNODE.size.x) / 2.0;
            let heightLeft = 0, heightLeftL = WORKAREA.h, heightLeftR = WORKAREA.h;
            let nextX = 0, nextY = 0, nextYL = 0, nextYR = 0;
            let onRight = C().center_master_fallback === "right";
            const cols = centerSlaveColumns(slavesLeft, onRight);
            let slavesLeftL = cols[0], slavesLeftR = cols[1];

            const slaveAverageHeightL = WORKAREA.h / slavesLeftL;
            const slaveAverageHeightR = WORKAREA.h / slavesLeftR;
            let slaveAccumulatedHeightL = 0, slaveAccumulatedHeightR = 0;

            if (SMART) {
                for (const nd of v) {
                    if (nd.isMaster) continue;
                    if (onRight) slaveAccumulatedHeightR += slaveAverageHeightR * nd.percSize;
                    else slaveAccumulatedHeightL += slaveAverageHeightL * nd.percSize;
                    onRight = !onRight;
                }
                onRight = C().center_master_fallback === "right";
            }

            for (const nd of v) {
                if (nd.isMaster) continue;
                if (onRight) {
                    nextX = WIDTH + PMASTERNODE.size.x - (IGN ? reservedLeft : 0);
                    nextY = nextYR; heightLeft = heightLeftR; slavesLeft = slavesLeftR;
                } else {
                    nextX = 0;
                    nextY = nextYL; heightLeft = heightLeftL; slavesLeft = slavesLeftL;
                }

                let HEIGHT = slavesLeft > 1 ? heightLeft / slavesLeft * nd.percSize : heightLeft;
                if (HEIGHT > heightLeft * 0.9 && slavesLeft > 1) HEIGHT = heightLeft * 0.9;

                if (SMART) {
                    if (onRight) {
                        nd.percSize *= WORKAREA.h / slaveAccumulatedHeightR;
                        HEIGHT = slaveAverageHeightR * nd.percSize;
                    } else {
                        nd.percSize *= WORKAREA.h / slaveAccumulatedHeightL;
                        HEIGHT = slaveAverageHeightL * nd.percSize;
                    }
                }

                nd.size = { x: IGN ? (WIDTH - (onRight ? reservedRight : reservedLeft)) : WIDTH, y: HEIGHT };
                nd.position = { x: WORKAREA.x + nextX, y: WORKAREA.y + nextY };
                setPos(space, nd);

                if (onRight) { heightLeftR -= HEIGHT; nextYR += HEIGHT; slavesLeftR--; }
                else { heightLeftL -= HEIGHT; nextYL += HEIGHT; slavesLeftL--; }
                onRight = !onRight;
            }
        }
    }

    // CMasterAlgorithm::resizeTarget
    function resizeTarget(space, target, D, corner) {
        const PNODE = getNodeFromWindow(space, target);
        if (!PNODE)
            return;
        corner = corner || { l: false, t: false, r: false, b: false };
        const v = nodes(space);
        const MON = ctx.monitorSize(space);
        const WORKAREA = ctx.workArea(space);
        const DISPLAYBOTTOM = STICKS(PNODE.position.y + PNODE.size.y, WORKAREA.y + WORKAREA.h);
        const DISPLAYRIGHT = STICKS(PNODE.position.x + PNODE.size.x, WORKAREA.x + WORKAREA.w);
        const DISPLAYTOP = STICKS(PNODE.position.y, WORKAREA.y);
        const DISPLAYLEFT = STICKS(PNODE.position.x, WORKAREA.x);
        const LEFT = corner.l, TOP = corner.t;
        const NONE = !corner.l && !corner.t && !corner.r && !corner.b;

        const MASTERS = getMastersNo(space);
        const WINDOWS = getNodesNo(space);
        const STACKWINDOWS = WINDOWS - MASTERS;
        const orientation = getDynamicOrientation(space);
        const centered = orientation === O_CENTER && STACKWINDOWS >= C().slave_count_for_center_master;
        let delta = 0;

        if (WINDOWS === 1 && !centered) {
            calculateWorkspace(space);
            return;
        }

        switch (orientation) {
        case O_LEFT: delta = D.x / MON.w; break;
        case O_RIGHT: delta = -D.x / MON.w; break;
        case O_BOTTOM: delta = -D.y / MON.h; break;
        case O_TOP: delta = D.y / MON.h; break;
        case O_CENTER:
            delta = D.x / MON.w;
            if (STACKWINDOWS >= C().slave_count_for_center_master) {
                if (!NONE || !PNODE.isMaster) delta *= 2;
                if ((!PNODE.isMaster && DISPLAYLEFT) || (PNODE.isMaster && LEFT && C().smart_resizing)) delta = -delta;
            }
            break;
        }

        for (const n of v)
            if (n.isMaster)
                n.percMaster = clamp(n.percMaster + delta, 0.05, 0.95);

        const isStackVertical = orientation === O_LEFT || orientation === O_RIGHT || orientation === O_CENTER;
        const RESIZEDELTA = isStackVertical ? D.y : D.x;

        let nodesInSameColumn = PNODE.isMaster ? MASTERS : STACKWINDOWS;
        if (orientation === O_CENTER && !PNODE.isMaster) {
            const EXTRATORIGHT = C().center_master_fallback === "right";
            const idx = v.indexOf(PNODE);
            const SLAVEINDEX = v.slice(0, idx).filter(n => !n.isMaster).length;
            const ONLEFT = (SLAVEINDEX % 2 === 0) !== EXTRATORIGHT;
            const cols = centerSlaveColumns(STACKWINDOWS, EXTRATORIGHT);
            nodesInSameColumn = ONLEFT ? cols[0] : cols[1];
        }

        const SIZE = isStackVertical ? WORKAREA.h / nodesInSameColumn : WORKAREA.w / nodesInSameColumn;

        if (RESIZEDELTA !== 0 && nodesInSameColumn > 1) {
            if (!C().smart_resizing) {
                PNODE.percSize = clamp(PNODE.percSize + RESIZEDELTA / SIZE, 0.05, 1.95);
            } else {
                const idx = v.indexOf(PNODE);
                const totalSize = isStackVertical ? WORKAREA.h : WORKAREA.w;
                const minSize = totalSize / nodesInSameColumn * 0.2;
                const resizePrevNodes = isStackVertical ? (TOP || DISPLAYBOTTOM) && !DISPLAYTOP : (LEFT || DISPLAYRIGHT) && !DISPLAYLEFT;

                // nodes walked: previous ones (reverse) or following ones
                const others = resizePrevNodes ? v.slice(0, idx).reverse() : v.slice(idx + 1);

                let nodesLeft = 0, sizeLeft = 0, nodeCount = 0;
                for (const it of others) {
                    if (it.isMaster !== PNODE.isMaster) continue;
                    nodeCount++;
                    if (!it.isMaster && orientation === O_CENTER && nodeCount % 2 === 1) continue;
                    sizeLeft += isStackVertical ? it.size.y : it.size.x;
                    nodesLeft++;
                }
                let resizeDiff = resizePrevNodes ? -RESIZEDELTA : RESIZEDELTA;

                const nodeSize = isStackVertical ? PNODE.size.y : PNODE.size.x;
                const maxSizeIncrease = sizeLeft - nodesLeft * minSize;
                const maxSizeDecrease = minSize - nodeSize;

                resizeDiff = clamp(resizeDiff, maxSizeDecrease, maxSizeIncrease);
                PNODE.percSize += resizeDiff / SIZE;

                nodeCount = 0;
                for (const it of others) {
                    if (it.isMaster !== PNODE.isMaster) continue;
                    nodeCount++;
                    if (!it.isMaster && orientation === O_CENTER && nodeCount % 2 === 1) continue;
                    const size = isStackVertical ? it.size.y : it.size.x;
                    const each = maxSizeIncrease !== 0 ? resizeDiff * (size - minSize) / maxSizeIncrease : resizeDiff / nodesLeft;
                    it.percSize -= each / SIZE;
                }
            }
        }

        recalculate(space);
    }

    function swapTargets(space, a, b) {
        const na = getNodeFromWindow(space, a), nb = getNodeFromWindow(space, b);
        if (na) na.win = b;
        if (nb) nb.win = a;
    }

    // CMasterAlgorithm::getNextTarget
    function getNextTarget(space, w, next, loop) {
        const PNODE = getNodeFromWindow(space, w);
        if (!PNODE) return null;
        const list = next ? nodes(space).slice() : nodes(space).slice().reverse();
        const start = list.indexOf(PNODE);
        const ISMASTER = PNODE.isMaster;

        let CANDIDATE = null;
        for (let i = start; i < list.length; i++)
            if (list[i] !== PNODE && list[i].isMaster === ISMASTER) { CANDIDATE = list[i]; break; }
        if (!CANDIDATE)
            for (const o of list)
                if (o !== PNODE && o.isMaster !== ISMASTER) { CANDIDATE = o; break; }

        if (CANDIDATE && !loop) {
            if (CANDIDATE.isMaster && next) return null;
            if (!CANDIDATE.isMaster && ISMASTER && !next) return null;
        }
        return CANDIDATE ? CANDIDATE.win : null;
    }

    function runOrientationCycle(space, next) {
        const cycle = [O_LEFT, O_TOP, O_RIGHT, O_BOTTOM, O_CENTER];
        const cur = getDynamicOrientation(space);
        let i = cycle.indexOf(cur) + next;
        i = ((i % cycle.length) + cycle.length) % cycle.length;
        data(space).explicitOrientation = cycle[i];
        calculateWorkspace(space);
    }

    // rotate helpers mirroring std::ranges::rotate(first, middle, last)
    function rotate(arr, first, mid, last) {
        const seg = arr.slice(first, last);
        const k = mid - first;
        const rotated = seg.slice(k).concat(seg.slice(0, k));
        for (let i = 0; i < rotated.length; i++) arr[first + i] = rotated[i];
    }

    function roll(space, win, forward) {
        const v = nodes(space);
        const PNODE = getNodeFromWindow(space, win);
        if (!PNODE) return null;
        const OLDMASTER = PNODE.isMaster ? PNODE : getMasterNode(space);
        if (!OLDMASTER) return null;
        let oldIt = v.indexOf(OLDMASTER);
        const order = forward ? v.slice() : v.slice().reverse();
        let newFocus = null;
        for (const nd of order) {
            if (nd.isMaster) continue;
            nd.isMaster = true;
            newFocus = nd.win;
            const newIt = v.indexOf(nd);
            if (newIt < oldIt) rotate(v, newIt, newIt + 1, oldIt);
            else if (newIt > oldIt) rotate(v, oldIt, newIt, newIt + 1);
            OLDMASTER.isMaster = false;
            oldIt = v.indexOf(OLDMASTER);
            if (forward) {
                if (oldIt !== v.length - 1) rotate(v, oldIt, oldIt + 1, v.length);
            } else {
                if (oldIt !== 0) rotate(v, 0, oldIt, oldIt + 1);
            }
            break;
        }
        calculateWorkspace(space);
        return newFocus;
    }

    // CMasterAlgorithm::layoutMsg
    function layoutMsg(space, win, cmd, arg) {
        const D = data(space);
        const v = nodes(space);
        const PNODE = getNodeFromWindow(space, win);
        switch (cmd) {
        case "swapwithmaster": {
            if (!PNODE) return true;
            const PMASTER = getMasterNode(space);
            if (!PMASTER) return true;
            const NEWCHILD = PMASTER.win;
            if (NEWCHILD !== win) {
                swapTargets(space, win, NEWCHILD);
                recalculate(space);
                ctx.focus(arg === "child" ? NEWCHILD : win);
            } else if (arg !== "ignoremaster") {
                for (const n of v) {
                    if (!n.isMaster) {
                        const NEWMASTER = n.win;
                        swapTargets(space, NEWMASTER, NEWCHILD);
                        recalculate(space);
                        ctx.focus(arg === "master" ? NEWMASTER : NEWCHILD);
                        break;
                    }
                }
            }
            return true;
        }
        case "focusmaster": {
            const PMASTER = getMasterNode(space);
            if (!PMASTER || !win) return true;
            if (PMASTER.win !== win) {
                ctx.focus(PMASTER.win);
                if (arg === "previous") D.focusMasterPrev = win;
                return true;
            }
            const focusAuto = function () {
                for (const n of v) if (!n.isMaster) { ctx.focus(n.win); break; }
            };
            if (arg === "master") return true;
            if (arg === "previous") {
                const P = D.focusMasterPrev;
                if (P && getNodeFromWindow(space, P) && P !== win) ctx.focus(P); else focusAuto();
            } else focusAuto();
            return true;
        }
        case "cyclenext":
        case "cycleprev": {
            const t = getNextTarget(space, win, cmd === "cyclenext", arg !== "noloop");
            if (t) ctx.focus(t);
            return true;
        }
        case "swapnext":
        case "swapprev": {
            const t = getNextTarget(space, win, cmd === "swapnext", arg !== "noloop");
            if (t) { swapTargets(space, win, t); recalculate(space); ctx.focus(win); }
            return true;
        }
        case "addmaster": {
            if (getMastersNo(space) + 2 > getNodesNo(space) && !C().allow_small_split) return true;
            if (!PNODE || PNODE.isMaster) {
                for (const n of v) if (!n.isMaster) { n.isMaster = true; break; }
            } else PNODE.isMaster = true;
            calculateWorkspace(space);
            return true;
        }
        case "removemaster": {
            if (getNodesNo(space) < 2 || getMastersNo(space) < 2) return true;
            if (!PNODE || !PNODE.isMaster) {
                for (let i = v.length - 1; i >= 0; i--) if (v[i].isMaster) { v[i].isMaster = false; break; }
            } else PNODE.isMaster = false;
            calculateWorkspace(space);
            return true;
        }
        case "orientationleft": D.explicitOrientation = O_LEFT; calculateWorkspace(space); return true;
        case "orientationtop": D.explicitOrientation = O_TOP; calculateWorkspace(space); return true;
        case "orientationright": D.explicitOrientation = O_RIGHT; calculateWorkspace(space); return true;
        case "orientationbottom": D.explicitOrientation = O_BOTTOM; calculateWorkspace(space); return true;
        case "orientationcenter": D.explicitOrientation = O_CENTER; calculateWorkspace(space); return true;
        case "orientationnext": runOrientationCycle(space, 1); return true;
        case "orientationprev": runOrientationCycle(space, -1); return true;
        case "mfact": {
            const PMASTER = getMasterNode(space);
            if (!PMASTER) return true;
            PMASTER.percMaster = clamp(PMASTER.percMaster + arg, 0.05, 0.95);
            recalculate(space);
            return true;
        }
        case "rollnext":
        case "rollprev": {
            const f = roll(space, win, cmd === "rollnext");
            if (f) ctx.focus(f);
            return true;
        }
        }
        return false;
    }

    // CMasterAlgorithm::moveTargetInDirection — swap with the window in that direction
    function moveTargetInDirection(space, t, dir) {
        const other = ctx.windowInDirection(t, dir);
        if (!other || !getNodeFromWindow(space, other))
            return false;
        swapTargets(space, t, other);
        recalculate(space);
        return true;
    }

    return {
        name: "master",
        add: function (space, w, opts) { return addTarget(space, w, !(opts && opts.focal)); },
        remove: removeTarget,
        recalc: recalculate,
        has: function (space, w) { return !!getNodeFromWindow(space, w); },
        windows: function (space) { return nodes(space).map(n => n.win); },
        boxOf: function (space, w) { const n = getNodeFromWindow(space, w); return n ? boxOfNode(n) : null; },
        resize: resizeTarget,
        moveInDirection: moveTargetInDirection,
        swap: function (space, a, b) { swapTargets(space, a, b); recalculate(space); },
        msg: layoutMsg,
        onFocus: function () {},
        onClosed: function (space, oldBox) {
            // CMasterAlgorithm::getNextCandidate
            const M = getMasterNode(space);
            if (C().focus_master_on_close && M) return M.win;
            const n = getClosestNode(space, { x: oldBox.x + oldBox.w / 2, y: oldBox.y + oldBox.h / 2 });
            return n ? n.win : (M ? M.win : null);
        },
        clear: function (space) { space.master = null; }
    };
}
