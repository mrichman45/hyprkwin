// Layout and core behaviour, against a mock KWin (tests/harness.js). Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { makeEnv } = require('./harness');

const LAYOUTS = ['dwindle', 'master', 'scrolling', 'monocle'];
const box = w => { const f = w.frameGeometry; return { x: f.x, y: f.y, w: f.width, h: f.height }; };
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                          Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function env(layout, opts = {}) {
  const e = makeEnv({ quiet: true, ...opts });
  e.cfg.general.layout = layout;
  e.core.reload();
  return e;
}

for (const layout of ['dwindle', 'master']) {
  test(`${layout}: tiles fill the work area without overlapping`, () => {
    const e = env(layout);
    const ws = ['A', 'B', 'C', 'D', 'E'].map(n => e.win(n));
    const WA = { x: 20, y: 20, w: 1880, h: 1000 };          // 1920x1080 minus a 40px panel, gaps_out 20
    for (const w of ws) {
      const b = box(w);
      assert.ok(b.x >= WA.x - 1 && b.y >= WA.y - 1 && b.x + b.w <= WA.x + WA.w + 1 && b.y + b.h <= WA.y + WA.h + 1,
        `${w.name} ${JSON.stringify(b)} leaves the work area`);
    }
    for (let i = 0; i < ws.length; i++)
      for (let j = i + 1; j < ws.length; j++)
        assert.equal(overlap(box(ws[i]), box(ws[j])), 0, `${ws[i].name} overlaps ${ws[j].name}`);
    const area = ws.reduce((s, w) => s + box(w).w * box(w).h, 0);
    assert.ok(area > WA.w * WA.h * 0.95, 'tiles leave large holes');
  });
}

test('dwindle: one window fills the work area; two split side by side', () => {
  const e = env('dwindle');
  const A = e.win('A');
  assert.deepEqual(box(A), { x: 20, y: 20, w: 1880, h: 1000 });
  const B = e.win('B');
  assert.ok(box(A).y === box(B).y && box(A).h === box(B).h, 'a wide area should split left/right');
  assert.equal(box(B).x - (box(A).x + box(A).w), 10, 'gap between windows is 2 x gaps_in');
});

test('monocle: only the current window is visible', () => {
  const e = env('monocle');
  const ws = ['A', 'B', 'C'].map(n => e.win(n));
  assert.deepEqual(ws.map(w => w.opacity), [0, 0, 1]);
  e.core.dispatch('monocle:cyclenext');
  assert.equal(ws.filter(w => w.opacity === 1).length, 1);
});

test('scrolling: columns off screen are parked out of sight', () => {
  const e = env('scrolling');
  const ws = ['A', 'B', 'C', 'D'].map(n => e.win(n));
  const parked = ws.filter(w => box(w).y > 50000);
  assert.ok(parked.length >= 1 && parked.length < ws.length);
});

test('directional focus moves to the neighbour', () => {
  const e = env('dwindle');
  const A = e.win('A'), B = e.win('B');
  e.ws.activeWindow = B;
  e.core.dispatch('focus-left');
  assert.equal(e.ws.activeWindow, A);
});

test('closing the active window focuses the nearest one', () => {
  const e = env('dwindle');
  const A = e.win('A'), B = e.win('B'), C = e.win('C');
  e.ws.activeWindow = C;
  e.close(C);
  assert.ok([A, B].includes(e.ws.activeWindow));
});

test('move-right at the screen edge sends the window to the next monitor', () => {
  const e = makeEnv({ quiet: true, outputs: [
    { name: 'DP-1', geo: { x: 0, y: 0, width: 1920, height: 1080 } },
    { name: 'DP-2', geo: { x: 1920, y: 0, width: 1920, height: 1080 } }] });
  const X = e.win('X'), Y = e.win('Y');
  e.ws.activeWindow = Y;
  e.core.dispatch('move-right');
  assert.equal(Y.output.name, 'DP-2');
  assert.ok(box(Y).x >= 1920);
});

test('gaming mode (Super+T) restores window sizes and shows the right message', () => {
  const e = env('dwindle');
  const A = e.win('A', { frameGeometry: { x: 300, y: 200, width: 700, height: 500 } });
  e.win('B');
  const shown = [];
  e.kwin.osd = t => shown.push(t);
  e.core.dispatch('toggle-tiling');
  assert.deepEqual(box(A), { x: 300, y: 200, w: 700, h: 500 });
  e.core.dispatch('toggle-tiling');
  assert.deepEqual(shown, ['Gaming Mode On', 'Gaming Mode Off']);
});

test('gaming desktop from settings is never tiled', () => {
  const e = env('dwindle');
  e.cfg.general.tiling_default = 'list';
  e.cfg.general.tiled_desktops = [1, 3, 4, 5, 6, 7, 8, 9, 10];
  e.core.reload();
  const game = e.win('Game', { desktops: [e.desk2], frameGeometry: { x: 300, y: 200, width: 900, height: 600 } });
  const A = e.win('A');
  assert.deepEqual(box(game), { x: 300, y: 200, w: 900, h: 600 });
  assert.deepEqual(box(A), { x: 20, y: 20, w: 1880, h: 1000 });
});

test('fullscreen windows are left alone', () => {
  const e = env('dwindle');
  const G = e.win('G', { fullScreen: true, frameGeometry: { x: 0, y: 0, width: 1920, height: 1080 } });
  e.win('B');
  assert.deepEqual(box(G), { x: 0, y: 0, w: 1920, h: 1080 });
});

test('wallpaper engines and HyprKWin pop-ups are never tiled', () => {
  const e = env('dwindle');
  const W = e.win('waywallen', { resourceClass: 'io.github.waywallen.Renderer', frameGeometry: { x: 5, y: 5, width: 50, height: 50 } });
  const G = e.win('kwin', { caption: 'HyprKWin keybindings', frameGeometry: { x: 400, y: 200, width: 1280, height: 860 } });
  e.win('A');
  assert.deepEqual(box(W), { x: 5, y: 5, w: 50, h: 50 });
  assert.deepEqual(box(G), { x: 400, y: 200, w: 1280, h: 860 });
});

test('every action runs in every layout without errors', () => {
  for (const layout of LAYOUTS) for (const n of [0, 1, 4]) {
    const errors = [];
    const e = makeEnv({ quiet: true });
    e.kwin.log = m => { if (/failed|unknown/.test(m)) errors.push(m.split('\n')[0]); };
    e.cfg.general.layout = layout; e.core.reload();
    const ws = []; for (let i = 0; i < n; i++) ws.push(e.win('W' + i));
    for (const a of e.core.actions()) { e.core.dispatch(a); if (ws.length) e.ws.activeWindow = ws[i0(ws.length)]; }
    for (const w of ws) for (const v of Object.values(w.frameGeometry)) assert.ok(Number.isFinite(v), `${layout}: NaN geometry`);
    assert.deepEqual(errors, [], `${layout} with ${n} windows`);
  }
  function i0(n) { return Math.floor(Math.random() * n); }
});

test('every shortcut in main.qml maps to an action, and every action appears in the glossary', () => {
  const q = fs.readFileSync(path.join(__dirname, '..', 'script', 'contents', 'ui', 'main.qml'), 'utf8');
  const block = q.slice(q.indexOf('readonly property var shortcuts'), q.indexOf('readonly property var glossaryRows'));
  const ids = [...block.matchAll(/\["([^"]+)",\s*"[^"]*",\s*"[^"]*"\]/g)].map(m => m[1]);
  const actions = new Set(makeEnv({ quiet: true }).core.actions());
  assert.deepEqual(ids.filter(i => i !== 'glossary' && !actions.has(i)), []);
  const gl = q.slice(q.indexOf('readonly property var glossaryRows'), q.indexOf('readonly property var staticKeys'));
  const inGlossary = new Set([...gl.matchAll(/"([a-z][^"]*)"/g)].map(m => m[1]));
  assert.deepEqual(ids.filter(i => !inGlossary.has(i)), []);
  const keys = [...block.matchAll(/\["[^"]+",\s*"[^"]*",\s*"([^"]+)"\]/g)].map(m => m[1]);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], 'two actions share a default key');
});

test('animations effect: open, glide and close', () => {
  const calls = [];
  const types = i => JSON.parse(JSON.stringify(calls[i].animations.map(a => a.type)));   // arrays from the sandbox
  const sig = () => { const l = []; return { connect: f => l.push(f), emit: (...a) => l.forEach(f => f(...a)) }; };
  const ctx = {
    QEasingCurve: { OutBack: 1, OutExpo: 2, OutCubic: 3, InOutCubic: 4, Linear: 5, InCubic: 6 },
    Effect: { Scale: 1, Opacity: 2, Translation: 3, Size: 4, WindowAddedGrabRole: 10, WindowClosedGrabRole: 11 },
    KWin: { FullScreenArea: 1 }, animationTime: d => d, animate: o => { calls.push(o); return calls.length; }, cancel: () => {},
    Date, Math, effect: { readConfig: (k, d) => d, configChanged: sig() },
    effects: { windowAdded: sig(), windowClosed: sig(), stackingOrder: [], hasActiveFullScreenEffect: false,
               clientArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'effect', 'contents', 'code', 'main.js'), 'utf8'), ctx);
  const w = { visible: true, normalWindow: true, geometry: { x: 100, y: 100, width: 800, height: 600 }, _d: {},
              data(r) { return this._d[r]; }, setData(r, v) { this._d[r] = v; }, windowFrameGeometryChanged: sig() };
  ctx.effects.windowAdded.emit(w);
  assert.deepEqual(types(0), [1, 2]);       // pop-in: scale + fade
  w.hyprOpening = false;
  const old = { ...w.geometry };
  w.geometry = { x: 500, y: 100, width: 400, height: 600 };
  w.windowFrameGeometryChanged.emit(w, old);
  assert.deepEqual(types(1), [4, 3]);       // glide: size + translation
  ctx.effects.windowClosed.emit(w);
  assert.equal(calls.length, 3);
});
