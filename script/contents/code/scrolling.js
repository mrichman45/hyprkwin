// Port of Hyprland src/layout/algorithm/tiled/scrolling/ (ScrollingAlgorithm.cpp and
// ScrollTapeController.cpp, commit 5177d94). Windows sit in columns on an endless strip
// ("tape") that scrolls so the focused column is in view, like niri / PaperWM.

function create(ctx) {
    const MIN_COLUMN_WIDTH = 0.05, MAX_COLUMN_WIDTH = 1.0;
    const MIN_ROW_HEIGHT = 0.1, MAX_ROW_HEIGHT = 1.0;
    const DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;

    function C() { return ctx.cfg.scrolling; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function data(space) {
        if (!space.scrolling)
            space.scrolling = { columns: [], offset: 0, inhibited: false, offsetWhenInhibited: 0 };
        return space.scrolling;
    }

    // ---------------- CScrollTapeController ----------------
    function direction() { return C().direction; } // "right" | "left" | "down" | "up"
    function isPrimaryHorizontal() { return direction() === "right" || direction() === "left"; }
    function isReversed() { return direction() === "left" || direction() === "up"; }
    function P(sz) { return isPrimaryHorizontal() ? sz.w : sz.h; }
    function S(sz) { return isPrimaryHorizontal() ? sz.h : sz.w; }
    function fsOnOne() { return C().fullscreen_on_one_column; }

    function usableArea(space) {
        const WA = ctx.workArea(space);
        return { x: 0, y: 0, w: Math.max(WA.w, 1), h: Math.max(WA.h, 1) };
    }

    function setOffset(D, offset) {
        if (D.inhibited)
            D.offset = D.offsetWhenInhibited;
        else
            D.offset = Math.max(0, offset);
    }
    function adjustOffset(D, delta) { setOffset(D, D.offset + delta); }

    function calculateMaxExtent(space) {
        const D = data(space), U = usableArea(space);
        if (!D.columns.length) return 0;
        if (fsOnOne() && D.columns.length === 1) return P(U);
        let total = 0;
        for (const c of D.columns) total += P(U) * c.width;
        return total;
    }

    function calculateStripStart(space, i) {
        const D = data(space), U = usableArea(space);
        if (i >= D.columns.length) return 0;
        let cur = 0;
        for (let k = 0; k < i; ++k)
            cur += (fsOnOne() && D.columns.length === 1) ? P(U) : P(U) * D.columns[k].width;
        return cur;
    }

    function calculateStripSize(space, i) {
        const D = data(space), U = usableArea(space);
        if (i >= D.columns.length) return 0;
        if (fsOnOne() && D.columns.length === 1) return P(U);
        return P(U) * D.columns[i].width;
    }

    function calculateCameraOffset(space) {
        const D = data(space), U = usableArea(space);
        const maxExtent = calculateMaxExtent(space);
        if (maxExtent < P(U))
            setOffset(D, (maxExtent - P(U)) / 2.0);
        if (maxExtent > P(U) && D.offset < 0 && C().focus_fit_method !== 0)
            setOffset(D, 0);
        return D.offset;
    }

    function makeBox(primaryPos, secondaryPos, primarySize, secondarySize) {
        return isPrimaryHorizontal()
            ? { x: primaryPos, y: secondaryPos, w: primarySize, h: secondarySize }
            : { x: secondaryPos, y: primaryPos, w: secondarySize, h: primarySize };
    }

    function calculateStripBox(space, i, WAPOS) {
        const U = usableArea(space);
        const cameraOffset = calculateCameraOffset(space);
        let primaryPos = calculateStripStart(space, i);
        const primarySize = calculateStripSize(space, i);
        if (isReversed())
            primaryPos = P(U) - primaryPos - primarySize + cameraOffset;
        else
            primaryPos -= cameraOffset;
        const b = makeBox(primaryPos, 0, primarySize, S(U));
        b.x += WAPOS.x;
        b.y += WAPOS.y;
        return b;
    }

    function calculateTargetBox(space, i, j, WAPOS) {
        const D = data(space), U = usableArea(space);
        const col = D.columns[i];
        const b = calculateStripBox(space, i, WAPOS);
        let secondaryPos = 0;
        for (let k = 0; k < j; ++k) secondaryPos += col.sizes[k] * S(U);
        const secondarySize = col.sizes[j] * S(U);
        if (isPrimaryHorizontal()) { b.y = WAPOS.y + secondaryPos; b.h = secondarySize; }
        else { b.x = WAPOS.x + secondaryPos; b.w = secondarySize; }
        return b;
    }

    function centerStrip(space, i) {
        const D = data(space), U = usableArea(space);
        setOffset(D, calculateStripStart(space, i) - (P(U) - calculateStripSize(space, i)) / 2.0);
    }

    function fitStrip(space, i) {
        const D = data(space), U = usableArea(space);
        const start = calculateStripStart(space, i), size = calculateStripSize(space, i);
        const lo = start - P(U) + size, hi = start;
        if (lo > hi) {
            setOffset(D, start - (P(U) - size) / 2.0);
            return;
        }
        setOffset(D, clamp(D.offset, lo, hi));
    }

    function clampedCenterStrip(space, i) {
        const D = data(space), U = usableArea(space);
        const start = calculateStripStart(space, i), size = calculateStripSize(space, i);
        const limit = Math.max(0, calculateMaxExtent(space) - P(U));
        D.offset = clamp(start - (P(U) - size) / 2.0, 0, limit);
    }

    function isStripVisible(space, i, full) {
        const D = data(space), U = usableArea(space);
        if (i < 0 || i >= D.columns.length) return false;
        const start = calculateStripStart(space, i);
        const end = start + calculateStripSize(space, i);
        const vs = D.offset, ve = D.offset + P(U);
        return full ? (start >= vs && end <= ve) : (start < ve && vs < end);
    }

    function getStripAtCenter(space) {
        const D = data(space), U = usableArea(space);
        if (!D.columns.length) return 0;
        const viewCenter = D.offset + P(U) / 2.0;
        let currentEnd = 0;
        for (let i = 0; i < D.columns.length; ++i) {
            currentEnd += calculateStripSize(space, i);
            if (currentEnd >= viewCenter - 2.0) return i;
        }
        return D.columns.length - 1;
    }

    // ---------------- SColumnData ----------------
    function newColumn(width) {
        return { targets: [], width: width, sizes: [], lastFocused: null };
    }

    function colAdd(col, td, after) {
        const n = col.targets.length;
        const newSize = 1 / (n + 1);
        for (let i = 0; i < n; ++i) col.sizes[i] = col.sizes[i] * n / (n + 1);
        if (after === undefined) {
            col.targets.push(td);
            col.sizes.push(newSize);
        } else {
            col.targets.splice(after + 1, 0, td);
            col.sizes.splice(after + 1, 0, newSize);
        }
        td.column = col;
    }

    function colRemove(space, col, w) {
        const idx = col.targets.findIndex(t => t.win === w);
        if (idx === -1) return;
        col.targets.splice(idx, 1);
        col.sizes.splice(idx, 1);
        let total = 0;
        for (const s of col.sizes) total += s;
        if (total > 0) for (let i = 0; i < col.sizes.length; ++i) col.sizes[i] /= total;
        if (col.lastFocused && col.lastFocused.win === w) col.lastFocused = null;
        if (!col.targets.length) {
            const D = data(space);
            const ci = D.columns.indexOf(col);
            if (ci !== -1) D.columns.splice(ci, 1);
            col.dead = true;
        }
    }

    function colIdxForHeight(col, y) {
        if (!col.targets.length) return 0;
        for (let i = 0; i < col.targets.length; ++i) {
            if (col.targets[i].layoutBox.y < y) continue;
            return i === 0 ? 0 : i - 1;
        }
        return col.targets.length - 1;
    }

    function colUp(col, td) {
        const i = col.targets.indexOf(td);
        if (i < 1) return false;
        const t = col.targets[i]; col.targets[i] = col.targets[i - 1]; col.targets[i - 1] = t;
        return true;
    }
    function colDown(col, td) {
        const i = col.targets.indexOf(td);
        if (i === -1 || i >= col.targets.length - 1) return false;
        const t = col.targets[i]; col.targets[i] = col.targets[i + 1]; col.targets[i + 1] = t;
        return true;
    }
    function colNext(col, td) { const i = col.targets.indexOf(td); return i !== -1 && i < col.targets.length - 1 ? col.targets[i + 1] : null; }
    function colPrev(col, td) { const i = col.targets.indexOf(td); return i > 0 ? col.targets[i - 1] : null; }

    // ---------------- SScrollingData ----------------
    function defaultColumnWidth() { return clamp(C().column_width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH); }

    function addColumn(space, after, width) {
        const D = data(space);
        const col = newColumn(width === undefined ? defaultColumnWidth() : width);
        if (after === undefined || after >= D.columns.length) D.columns.push(col);
        else D.columns.splice(Math.max(-1, after) + 1, 0, col);
        return col;
    }
    function colIndex(space, c) { return data(space).columns.indexOf(c); }
    function nextCol(space, c) { const D = data(space), i = D.columns.indexOf(c); return i !== -1 && i < D.columns.length - 1 ? D.columns[i + 1] : null; }
    function prevCol(space, c) { const D = data(space), i = D.columns.indexOf(c); return i > 0 ? D.columns[i - 1] : null; }

    function centerCol(space, c) { if (c && colIndex(space, c) >= 0) centerStrip(space, colIndex(space, c)); }
    function fitCol(space, c) { if (c && colIndex(space, c) >= 0) fitStrip(space, colIndex(space, c)); }
    function clampedCenterCol(space, c) { if (c && colIndex(space, c) >= 0) clampedCenterStrip(space, colIndex(space, c)); }
    function centerOrFitCol(space, c) {
        const m = C().focus_fit_method;
        if (m === 0) centerCol(space, c);
        else if (m === 1) fitCol(space, c);
        else clampedCenterCol(space, c);
    }
    function visible(space, c, full) { return isStripVisible(space, colIndex(space, c), full); }
    function atCenter(space) { const D = data(space); const i = getStripAtCenter(space); return i < D.columns.length ? D.columns[i] : null; }

    function dataFor(space, w) {
        if (!w) return null;
        for (const c of data(space).columns)
            for (const td of c.targets)
                if (td.win === w) return td;
        return null;
    }

    // SScrollingData::recalculate
    function recalculate(space) {
        const D = data(space);
        if (ctx.fullscreenIn(space))
            return;
        const WA = ctx.workArea(space);
        const WAPOS = { x: WA.x, y: WA.y };
        const PH = isPrimaryHorizontal();

        for (let i = 0; i < D.columns.length; ++i) {
            const COL = D.columns[i];
            for (let j = 0; j < COL.targets.length; ++j) {
                const TD = COL.targets[j];
                TD.layoutBox = calculateTargetBox(space, i, j, WAPOS);

                const notTop = isReversed() ? j + 1 < COL.targets.length : j > 0;
                const notBottom = isReversed() ? j > 0 : j + 1 < COL.targets.length;
                const gaps = {
                    l: PH || notTop, r: PH || notBottom,
                    t: !PH || notTop, b: !PH || notBottom
                };
                const b = TD.layoutBox;
                const offscreen = PH ? (b.x + b.w <= WA.x || b.x >= WA.x + WA.w)
                                     : (b.y + b.h <= WA.y || b.y >= WA.y + WA.h);
                ctx.place(space, TD.win, b, { gaps: gaps, offscreen: offscreen });
            }
        }
    }

    // ---------------- CScrollingAlgorithm ----------------
    function focusOnInput(space, w, hard) {
        const D = data(space);
        const TD = dataFor(space, w);
        if (!TD) return;
        TD.column.lastFocused = TD;

        if (!hard && C().follow_min_visible > 0) {
            const MON = ctx.monitorBox(space);
            const T = TD.layoutBox;
            const IS_HORIZ = isPrimaryHorizontal();
            const VISIBLE_LEN = IS_HORIZ
                ? Math.abs(Math.min(MON.x + MON.w, T.x + T.w) - Math.max(MON.x, T.x))
                : Math.abs(Math.min(MON.y + MON.h, T.y + T.h) - Math.max(MON.y, T.y));
            if (VISIBLE_LEN < (IS_HORIZ ? MON.w : MON.h) * clamp(C().follow_min_visible, 0, 1))
                return;
        }

        if (visible(space, TD.column, true) && !hard)
            return;

        centerOrFitCol(space, TD.column);
        recalculate(space);
    }

    function newTarget(space, target) {
        let droppingOn = ctx.active();
        if (droppingOn === target || !dataFor(space, droppingOn))
            droppingOn = null;
        if (!droppingOn && ctx.wasDragging())
            droppingOn = windowAt(space, ctx.cursor(), target);

        const droppingData = droppingOn ? dataFor(space, droppingOn) : null;
        let droppingColumn = droppingData ? droppingData.column : null;
        const td = { win: target, column: null, layoutBox: { x: 0, y: 0, w: 0, h: 0 } };

        if (!droppingColumn) {
            const col = addColumn(space);
            colAdd(col, td);
            fitCol(space, col);
        } else if (ctx.wasDragging()) {
            const MOUSE = ctx.cursor();
            const DB = droppingData.layoutBox;
            const AXIS = isPrimaryHorizontal() ? MOUSE.x : MOUSE.y;
            const R = isPrimaryHorizontal() ? { x: DB.x, y: DB.w } : { x: DB.y, y: DB.h };
            const T = 0.3;
            const WITHIN_RANGE_LEFT = AXIS <= R.x + R.y * T;
            const WITHIN_RANGE = WITHIN_RANGE_LEFT || AXIS >= R.x + R.y * (1 - T);

            if (!WITHIN_RANGE) {
                const IDX = droppingColumn.targets.indexOf(droppingData);
                const TOP = DB.y + DB.h / 2 > MOUSE.y;
                colAdd(droppingColumn, td, TOP ? (IDX === 0 ? -1 : IDX - 1) : IDX);
            } else {
                droppingColumn = WITHIN_RANGE_LEFT ? addColumn(space, colIndex(space, droppingColumn) - 1)
                                                   : addColumn(space, colIndex(space, droppingColumn));
                colAdd(droppingColumn, td);
            }
            fitCol(space, droppingColumn);
        } else {
            const idx = colIndex(space, droppingColumn);
            const col = idx === -1 ? addColumn(space) : addColumn(space, idx);
            colAdd(col, td);
            fitCol(space, col);
        }

        recalculate(space);
        return true;
    }

    function windowAt(space, p, skip) {
        for (const c of data(space).columns)
            for (const td of c.targets) {
                const b = td.layoutBox;
                if (td.win !== skip && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h)
                    return td.win;
            }
        return null;
    }

    function removeTarget(space, target) {
        const D = data(space);
        const TD = dataFor(space, target);
        if (!TD) return;
        const U = usableArea(space);
        const col = TD.column;

        if (!nextCol(space, col) && col.targets.length <= 1)
            adjustOffset(D, -(P(U) * col.width));

        colRemove(space, col, target);

        if (col.dead) {
            const newOffset = clamp(D.offset, 0, Math.max(calculateMaxExtent(space) - P(U), 1));
            setOffset(D, newOffset);
        }
        recalculate(space);
    }

    // CScrollingAlgorithm::resizeTarget
    function resizeTarget(space, target, delta, corner) {
        const D = data(space);
        const TD = dataFor(space, target);
        if (!TD) return;
        corner = corner || { l: false, t: false, r: false, b: false };

        const PH = isPrimaryHorizontal();
        const AD = PH ? { x: delta.x, y: delta.y } : { x: delta.y, y: delta.x };
        const U = usableArea(space);
        const DELTA_AS_PERC = { x: AD.x / U.w, y: AD.y / U.h };
        const modDelta = { x: AD.x, y: AD.y };

        const COL = TD.column;
        const COL_IDX = colIndex(space, COL);
        if (COL_IDX < 0) return;

        const start = calculateStripStart(space, COL_IDX);
        const size = calculateStripSize(space, COL_IDX);
        const end = start + size;
        const cameraOffset = D.offset;
        const usableP = PH ? U.w : U.h;
        const onScreenStart = start - cameraOffset;
        const onScreenEnd = end - cameraOffset;

        setOffset(D, cameraOffset);

        const RESIZING_LEFT = PH ? corner.l : corner.t;
        const oldWidth = COL.width;
        if (RESIZING_LEFT) {
            let actual = clamp(oldWidth - DELTA_AS_PERC.x, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH) - oldWidth;
            if (actual * usableP > onScreenStart) actual = onScreenStart / usableP;
            if (actual !== 0) {
                COL.width = oldWidth + actual;
                adjustOffset(D, actual * usableP);
            }
        } else {
            let actual = clamp(oldWidth + DELTA_AS_PERC.x, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH) - oldWidth;
            if (onScreenEnd + actual * usableP > usableP) actual = (usableP - onScreenEnd) / usableP;
            if (actual !== 0) COL.width = oldWidth + actual;
        }

        if (COL.targets.length > 1) {
            const NEXT = colNext(COL, TD), PREV = colPrev(COL, TD);
            let c = { l: corner.l, t: corner.t, r: corner.r, b: corner.b };
            if (!c.l && !c.t && !c.r && !c.b) {
                if (!PREV) c = { r: true, b: true };
                else { c = { r: true, t: true }; modDelta.y *= -1; }
            }
            const ci = COL.targets.indexOf(TD);
            if (c.b && NEXT) {
                const ni = COL.targets.indexOf(NEXT);
                const nextSize = COL.sizes[ni], currSize = COL.sizes[ci];
                if (!(nextSize <= MIN_ROW_HEIGHT && modDelta.y >= 0)) {
                    const adjust = clamp(modDelta.y / U.h, -currSize + MIN_ROW_HEIGHT, nextSize - MIN_ROW_HEIGHT);
                    COL.sizes[ni] = clamp(nextSize - adjust, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
                    COL.sizes[ci] = clamp(currSize + adjust, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
                }
            } else if (c.t && PREV) {
                const pi = COL.targets.indexOf(PREV);
                const prevSize = COL.sizes[pi], currSize = COL.sizes[ci];
                if (!((prevSize <= MIN_ROW_HEIGHT && modDelta.y <= 0) || (currSize <= MIN_ROW_HEIGHT && delta.y >= 0))) {
                    const adjust = clamp(modDelta.y / U.h, -(prevSize - MIN_ROW_HEIGHT), currSize - MIN_ROW_HEIGHT);
                    COL.sizes[pi] = clamp(prevSize + adjust, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
                    COL.sizes[ci] = clamp(currSize - adjust, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
                }
            }
        }

        recalculate(space);
    }

    function expelTarget(space, td, srcCol, insertIdx) {
        const col = insertIdx === null || insertIdx === undefined ? addColumn(space) : addColumn(space, insertIdx);
        colRemove(space, srcCol, td.win);
        colAdd(col, td);
        centerOrFitCol(space, col);
    }

    function rotateDir(dir) {
        switch (direction()) {
        case "left":
            if (dir === DIR_LEFT) return DIR_RIGHT;
            if (dir === DIR_RIGHT) return DIR_LEFT;
            return dir;
        case "up":
            if (dir === DIR_UP) return DIR_RIGHT;
            if (dir === DIR_DOWN) return DIR_LEFT;
            if (dir === DIR_LEFT) return DIR_UP;
            if (dir === DIR_RIGHT) return DIR_DOWN;
            return dir;
        case "down":
            if (dir === DIR_UP) return DIR_LEFT;
            if (dir === DIR_DOWN) return DIR_RIGHT;
            if (dir === DIR_LEFT) return DIR_UP;
            if (dir === DIR_RIGHT) return DIR_DOWN;
            return dir;
        }
        return dir;
    }

    // CScrollingAlgorithm::moveTargetTo — false means "try another monitor"
    function moveTargetTo(space, t, dir) {
        const D = data(space);
        const TD = dataFor(space, t);
        if (!TD) return false;
        const CUR = TD.column;
        const current_idx = colIndex(space, CUR);
        const R = rotateDir(dir);
        const mouseY = ctx.cursor().y;

        const commence = function () {
            if (R === DIR_LEFT) {
                const COL = prevCol(space, CUR);
                if (!COL && current_idx === 0 && CUR.targets.length === 1) return false;
                colRemove(space, CUR, t);
                if (!COL) {
                    const NEWCOL = addColumn(space, -1);
                    colAdd(NEWCOL, TD);
                    centerOrFitCol(space, NEWCOL);
                } else {
                    if (COL.targets.length > 0) colAdd(COL, TD, colIdxForHeight(COL, mouseY));
                    else colAdd(COL, TD);
                    centerOrFitCol(space, COL);
                }
                return true;
            } else if (R === DIR_RIGHT) {
                const COL = nextCol(space, CUR);
                if (!COL && current_idx === D.columns.length - 1 && CUR.targets.length === 1) return false;
                colRemove(space, CUR, t);
                if (!COL) {
                    const NEWCOL = addColumn(space);
                    colAdd(NEWCOL, TD);
                    centerOrFitCol(space, NEWCOL);
                } else {
                    if (COL.targets.length > 0) colAdd(COL, TD, colIdxForHeight(COL, mouseY));
                    else colAdd(COL, TD);
                    centerOrFitCol(space, COL);
                }
                return true;
            } else if (R === DIR_UP) {
                return colUp(CUR, TD);
            } else if (R === DIR_DOWN) {
                return colDown(CUR, TD);
            }
            return false;
        };

        if (!commence())
            return false;
        recalculate(space);
        TD.column.lastFocused = TD;
        return true;
    }

    // CScrollingAlgorithm::findBestNeighbor
    function findBestNeighbor(cur, col) {
        if (!cur || !col || !col.targets.length) return null;
        const top = cur.layoutBox.y, bottom = cur.layoutBox.y + cur.layoutBox.h;
        const overlapping = col.targets.filter(c => c.layoutBox.y < bottom && c.layoutBox.y + c.layoutBox.h > top);
        if (overlapping.length) {
            if (col.lastFocused && overlapping.indexOf(col.lastFocused) !== -1) return col.lastFocused;
            let best = overlapping[0];
            for (const o of overlapping) if (o.layoutBox.y < best.layoutBox.y) best = o;
            return best;
        }
        return col.targets[0];
    }

    function focusTD(td) {
        if (!td) return;
        td.column.lastFocused = td;
        ctx.focus(td.win);
    }

    // CScrollingAlgorithm::layoutMsg
    function layoutMsg(space, win, cmd, arg) {
        const D = data(space);
        const TD = dataFor(space, win);
        const U = usableArea(space);

        switch (cmd) {
        case "move": {
            if (arg === "+col" || arg === "col") {
                if (!TD) return true;
                const COL = nextCol(space, TD.column);
                if (!COL) {
                    setOffset(D, calculateMaxExtent(space));
                    recalculate(space);
                    return true;
                }
                centerOrFitCol(space, COL);
                recalculate(space);
                focusTD(COL.targets[0]);
                return true;
            } else if (arg === "-col") {
                if (!TD) {
                    if (D.columns.length) {
                        const last = D.columns[D.columns.length - 1];
                        centerCol(space, last);
                        recalculate(space);
                        focusTD(last.targets[last.targets.length - 1]);
                    }
                    return true;
                }
                const COL = prevCol(space, TD.column);
                if (!COL) return true;
                centerOrFitCol(space, COL);
                recalculate(space);
                focusTD(COL.targets[COL.targets.length - 1]);
                return true;
            }
            adjustOffset(D, -Number(arg));
            recalculate(space);
            const AC = atCenter(space);
            if (AC) focusTD(AC.targets[0]);
            return true;
        }
        case "colresize": {
            if (!TD) return true;
            const col = TD.column;
            if (arg === "all") return true;
            if (typeof arg === "object" && arg.all !== undefined) {
                for (const c of D.columns) c.width = arg.all;
                recalculate(space);
                return true;
            }
            const widths = ctx.explicitColumnWidths();
            if (arg === "+conf") {
                for (let i = 0; i < widths.length; ++i) {
                    if (widths[i] > col.width) { col.width = widths[i]; break; }
                    if (i === widths.length - 1) col.width = widths[0];
                }
            } else if (arg === "-conf") {
                for (let i = widths.length - 1; ; --i) {
                    if (widths[i] < col.width) { col.width = widths[i]; break; }
                    if (i === 0) { col.width = widths[widths.length - 1]; break; }
                }
            } else if (typeof arg === "number") {
                col.width = col.width + arg;
            } else if (typeof arg === "object" && arg.exact !== undefined) {
                col.width = arg.exact;
            }
            col.width = clamp(col.width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
            centerOrFitCol(space, col);
            recalculate(space);
            return true;
        }
        case "fit": {
            if (!TD || !D.columns.length) return true;
            if (arg === "active") {
                TD.column.width = 1;
                let off = 0;
                for (const c of D.columns) { if (c === TD.column) break; off += U.w * c.width; }
                setOffset(D, off);
                recalculate(space);
            } else if (arg === "expand") {
                let w = 0, USED = null;
                for (const c of D.columns) {
                    if (c !== TD.column && visible(space, c, false)) w += c.width;
                    else USED = c;
                }
                const rem = clamp(1 - w, 0, 1);
                if (rem !== TD.column.width) {
                    TD.column.width = rem;
                    setOffset(D, 0);
                    centerOrFitCol(space, USED);
                    recalculate(space);
                }
            } else if (arg === "all") {
                for (const c of D.columns) c.width = 1 / D.columns.length;
                setOffset(D, 0);
                recalculate(space);
            } else if (arg === "toend") {
                const foundAt = D.columns.indexOf(TD.column);
                for (let i = foundAt; i < D.columns.length; ++i) D.columns[i].width = 1 / (D.columns.length - foundAt);
                let off = 0;
                for (let i = 0; i < foundAt; ++i) off += U.w * D.columns[i].width;
                setOffset(D, off);
                recalculate(space);
            } else if (arg === "tobeg") {
                const foundAt = D.columns.indexOf(TD.column);
                for (let i = foundAt; i >= 0; --i) D.columns[i].width = 1 / (foundAt + 1);
                setOffset(D, 0);
                recalculate(space);
            } else if (arg === "visible") {
                let foundAt = -1;
                const vis = [];
                for (let i = 0; i < D.columns.length; ++i) {
                    if (foundAt === -1 && !visible(space, D.columns[i], false)) continue;
                    if (foundAt === -1) foundAt = i;
                    if (!visible(space, D.columns[i], false)) break;
                    vis.push(D.columns[i]);
                }
                if (foundAt === -1) return true;
                let off = 0;
                for (let i = 0; i < foundAt; ++i) off += U.w * D.columns[i].width;
                for (const c of vis) c.width = 1 / vis.length;
                setOffset(D, off);
                recalculate(space);
            }
            return true;
        }
        case "focus": {
            if (!TD || !arg) return true;
            const vertical = direction() === "down" || direction() === "up";
            const ch = arg[0];
            const prevInStrip = (!vertical && (ch === "u" || ch === "t")) || (vertical && ch === "l");
            const nextInStrip = (!vertical && (ch === "b" || ch === "d")) || (vertical && ch === "r");
            const prevStrip = (!vertical && ch === "l") || (vertical && (ch === "u" || ch === "t"));
            const nextStrip = (!vertical && ch === "r") || (vertical && (ch === "b" || ch === "d"));
            const noFallback = ctx.cfg.general.no_focus_fallback;

            if (prevInStrip) {
                let PREV = colPrev(TD.column, TD);
                if (!PREV) { if (noFallback) return true; PREV = TD.column.targets[TD.column.targets.length - 1]; }
                focusTD(PREV);
            } else if (nextInStrip) {
                let NEXT = colNext(TD.column, TD);
                if (!NEXT) { if (noFallback) return true; NEXT = TD.column.targets[0]; }
                focusTD(NEXT);
            } else if (prevStrip || nextStrip) {
                let COL = prevStrip ? prevCol(space, TD.column) : nextCol(space, TD.column);
                if (!COL) {
                    if (noFallback) {
                        centerOrFitCol(space, TD.column);
                        recalculate(space);
                        return true;
                    }
                    if (prevStrip) COL = C().wrap_focus ? D.columns[D.columns.length - 1] : D.columns[0];
                    else COL = C().wrap_focus ? D.columns[0] : D.columns[D.columns.length - 1];
                }
                const t = findBestNeighbor(TD, COL);
                if (t) {
                    focusTD(t);
                    centerOrFitCol(space, COL);
                    recalculate(space);
                }
            }
            return true;
        }
        case "promote":
        case "consume":
        case "expel":
        case "consume_or_expel": {
            if (!TD) return true;
            const CUR = TD.column;
            if (cmd === "promote") {
                expelTarget(space, TD, CUR, colIndex(space, CUR));
            } else if (cmd === "expel") {
                if (CUR.targets.length < 2) return true;
                const last = CUR.targets[CUR.targets.length - 1];
                const idx = colIndex(space, CUR);
                expelTarget(space, last, CUR, nextCol(space, CUR) ? idx : null);
            } else if (cmd === "consume") {
                const NEXT = nextCol(space, CUR);
                if (!NEXT) return true;
                const t = NEXT.targets[0];
                colRemove(space, NEXT, t.win);
                colAdd(CUR, t);
                centerOrFitCol(space, CUR);
            } else {
                const prev = arg === "prev";
                if (CUR.targets.length > 1) {
                    const idx = colIndex(space, CUR);
                    expelTarget(space, TD, CUR, prev ? idx - 1 : idx);
                } else {
                    const ADJ = prev ? prevCol(space, CUR) : nextCol(space, CUR);
                    if (!ADJ) return true;
                    colRemove(space, CUR, TD.win);
                    colAdd(ADJ, TD);
                    centerOrFitCol(space, ADJ);
                }
            }
            recalculate(space);
            return true;
        }
        case "swapcol": {
            if (!TD || D.columns.length < 2) return true;
            const cur = colIndex(space, TD.column);
            const n = D.columns.length;
            let target;
            if (arg === "l") target = C().wrap_swapcol ? (cur === 0 ? n - 1 : cur - 1) : Math.max(0, cur - 1);
            else target = C().wrap_swapcol ? (cur === n - 1 ? 0 : cur + 1) : Math.min(n - 1, cur + 1);
            const tmp = D.columns[cur]; D.columns[cur] = D.columns[target]; D.columns[target] = tmp;
            centerOrFitCol(space, TD.column);
            recalculate(space);
            return true;
        }
        case "center":
            if (TD) { centerCol(space, TD.column); recalculate(space); }
            return true;
        case "inhibit_scroll":
            if (D.inhibited) D.inhibited = false;
            else { D.offsetWhenInhibited = D.offset; D.inhibited = true; }
            return true;
        case "fit_into_view":
            if (TD) { centerOrFitCol(space, TD.column); recalculate(space); }
            return true;
        }
        return false;
    }

    return {
        name: "scrolling",
        add: function (space, w) { return newTarget(space, w); },
        remove: removeTarget,
        recalc: recalculate,
        has: function (space, w) { return !!dataFor(space, w); },
        windows: function (space) {
            const out = [];
            for (const c of data(space).columns) for (const td of c.targets) out.push(td.win);
            return out;
        },
        boxOf: function (space, w) { const td = dataFor(space, w); return td ? td.layoutBox : null; },
        resize: resizeTarget,
        moveInDirection: moveTargetTo,
        swap: function (space, a, b) {
            const ta = dataFor(space, a), tb = dataFor(space, b);
            if (ta) ta.win = b;
            if (tb) tb.win = a;
            recalculate(space);
        },
        msg: layoutMsg,
        // follow_focus
        onFocus: function (space, w, hard) {
            if (!C().follow_focus && !hard) {
                const td = dataFor(space, w);
                if (td) td.column.lastFocused = td;
                return;
            }
            focusOnInput(space, w, hard);
        },
        onClosed: function (space, oldBox) {
            // CScrollingAlgorithm::getNextCandidate -> closestNode
            let res = null, best = -1;
            for (const c of data(space).columns)
                for (const td of c.targets) {
                    const d = ctx.vecToRectDistanceSquared({ x: oldBox.x + oldBox.w / 2, y: oldBox.y + oldBox.h / 2 }, td.layoutBox);
                    if (!res || d < best) { res = td; best = d; }
                }
            return res ? res.win : null;
        },
        clear: function (space) { space.scrolling = null; }
    };
}
