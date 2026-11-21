const fs = require('fs'), vm = require('vm'), path = require('path');
const CODE = path.join(__dirname, '..', 'script', 'contents', 'code') + path.sep;
function load(file, name) {
  const ctx = vm.createContext({ console, Math, Number, String, Object, Array, isNaN, parseFloat, Infinity });
  vm.runInContext(fs.readFileSync(CODE + file, 'utf8'), ctx, { filename: file });
  return ctx[name];
}
function sig() { const l = []; return { connect: f => l.push(f), emit: (...a) => l.forEach(f => f(...a)) }; }
let nid = 0;
function makeEnv(opts = {}) {
  const desk1 = { id: 'd1' }, desk2 = { id: 'd2' };
  const outs = opts.outputs || [{ name: 'DP-1', geo: { x: 0, y: 0, width: 1920, height: 1080 } }];
  const PANEL = opts.panel === undefined ? 40 : opts.panel;
  const ws = { cursorPos: { x: 1700, y: 800 }, currentDesktop: desk1, _active: null,
    get activeWindow() { return this._active; }, set activeWindow(w) { this._active = w; core && core.onActivated(w); },
    sendClientToScreen(w, o) { w.output = o; w.outputChanged.emit(); }, windows: [] };
  const kwin = { ws, MaximizeArea: 2, FullScreenArea: 1,
    area(opt, out) { const g = out.geo; return opt === 2 ? { x: g.x, y: g.y, width: g.width, height: g.height - PANEL } : { ...g }; },
    setGeometry(w, x, y, ww, hh) { w.frameGeometry = { x, y, width: ww, height: hh }; },
    screenAt(p) { return outs.find(o => p.x >= o.geo.x && p.x < o.geo.x + o.geo.width && p.y >= o.geo.y && p.y < o.geo.y + o.geo.height) || null; },
    raise() {}, toggleMaximize() {}, desktopNumber(d) { return [desk1, desk2].indexOf(d) + 1; }, osd(t) { kwin.lastOsd = t; }, log: m => { if (!opts.quiet) console.log(m); } };
  const creators = { dwindle: load('dwindle.js', 'create'), master: load('master.js', 'create'),
                     scrolling: load('scrolling.js', 'create'), monocle: load('monocle.js', 'create') };
  const createCore = load('core.js', 'createCore');
  const cfg = JSON.parse(JSON.stringify(opts.cfg || defaultCfg()));
  var core = createCore(kwin, creators, cfg);
  function win(name, extra = {}) {
    const w = Object.assign({ name, internalId: 'id' + (nid++), output: outs[0], desktops: [desk1], onAllDesktops: false,
      normalWindow: true, transient: false, specialWindow: false, popupWindow: false, moveable: true, resizeable: true,
      minimized: false, fullScreen: false, resourceClass: name.toLowerCase(), frameGeometry: { x: 100, y: 100, width: 800, height: 600 },
      maxSize: { width: 32767, height: 32767 }, noBorder: false, keepAbove: false, opacity: 1, demandsAttention: false,
      closeWindow() {} }, extra);
    for (const s of ['minimizedChanged', 'desktopsChanged', 'outputChanged', 'fullScreenChanged', 'interactiveMoveResizeStarted', 'interactiveMoveResizeFinished'])
      w[s] = sig();
    ws.windows.push(w);
    core.hook(w);
    ws.activeWindow = w;
    return w;
  }
  function close(w) { ws.windows.splice(ws.windows.indexOf(w), 1); core.forget(w); w.deleted = true; }
  function g(w) { const f = w.frameGeometry; return `${f.x},${f.y} ${f.width}x${f.height}`; }
  return { core, kwin, ws, win, close, g, cfg, desk1, desk2, outs };
}
function defaultCfg() {
  return {
    general: { layout: 'dwindle', gaps_in: 5, gaps_out: 20, smart_gaps: false, hide_titlebars: false, float_above: true,
      focus_preferred_method: 0, monitor_fallback: true, no_focus_fallback: false, float_classes: [], ignore_classes: [],
      active_opacity: 1, inactive_opacity: 1, fullscreen_opacity: 1, special_scale_factor: 0.9, resize_step: 40, tiling_default: 'all', tiled_desktops: [1,3,4,5,6,7,8,9,10] },
    dwindle: { force_split: 0, preserve_split: false, smart_split: false, smart_resizing: true, permanent_direction_override: false,
      split_width_multiplier: 1, use_active_for_splits: true, default_split_ratio: 1, split_bias: false, precise_mouse_move: false },
    master: { allow_small_split: false, mfact: 0.55, new_status: 'slave', new_on_top: false, new_on_active: 'none', orientation: 'left',
      slave_count_for_center_master: 2, center_master_fallback: 'left', center_ignores_reserved: false, smart_resizing: true,
      drop_at_cursor: true, always_keep_position: false, focus_master_on_close: false },
    scrolling: { column_width: 0.5, fullscreen_on_one_column: true, focus_fit_method: 0, follow_focus: true, follow_min_visible: 0.4,
      explicit_column_widths: '0.333, 0.5, 0.667, 1.0', direction: 'right', wrap_focus: true, wrap_swapcol: true, hide_offscreen: true }
  };
}
module.exports = { makeEnv, defaultCfg };
