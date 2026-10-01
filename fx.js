/* Language Stack: optional WebGL layer (Paper Shaders).
   Loaded after first paint. If anything here fails, the page keeps its CSS
   gradient and inline SVG logo. app.js talks to this file only through
   DOM events: `stack-stats`, `session-logged`, `target-reached`. */

const PAPER_VERSION = '0.0.81';
const PAPER = `https://cdn.jsdelivr.net/npm/@paper-design/shaders@${PAPER_VERSION}/dist/`;
const MAX_LIVE = 2; // never more than two WebGL canvases at once

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = matchMedia('(forced-colors: active)');
const isPhone = matchMedia('(max-width: 600px)').matches;
const root = document.documentElement;

let P = null;             // loaded Paper modules
let bg = null, mark = null, badge = null;
let markImage = null, blankImage = null;
const live = new Set();

const MARK_COLORS = {
  // back = colour outside the shape (kept transparent); tint colours the metal
  dark:  { back: '#00000000', tint: '#ffe1b3' },
  light: { back: '#00000000', tint: '#e0763a' },
};
const theme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function boot() {
  if (!hasWebGL2()) return;
  try {
    const [mount, color, sizing, mesh, metal] = await Promise.all([
      import(`${PAPER}shader-mount.js`),
      import(`${PAPER}get-shader-color-from-string.js`),
      import(`${PAPER}shader-sizing.js`),
      import(`${PAPER}shaders/mesh-gradient.js`),
      import(`${PAPER}shaders/liquid-metal.js`),
    ]);
    P = { ...mount, ...color, ...sizing, ...mesh, ...metal };
    [markImage, blankImage] = await Promise.all([
      loadImage('assets/mark-processed.png'),
      loadImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
    ]);
  } catch (err) {
    console.info('Paper Shaders unavailable, keeping CSS fallback.', err);
    return;
  }
  mountBackground();
  mountMark();
}

/* ---------- helpers ---------- */
function sizing(fit, extra = {}) {
  return {
    u_fit: P.ShaderFitOptions[fit], u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0,
    u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0, ...extra,
  };
}

function create(kind, el, fragment, uniforms, opts = {}) {
  if (live.size >= MAX_LIVE) return null;
  try {
    const m = new P.ShaderMount(el, fragment, uniforms, { antialias: false, powerPreference: 'low-power' },
      0, opts.frame || 0, opts.minPixelRatio ?? 2, opts.maxPixelCount, opts.mipmaps || []);
    live.add(m);
    m.canvasElement.addEventListener('webglcontextlost', ev => {
      ev.preventDefault();
      destroy(m);
      if (kind === 'bg') { bg = null; el.classList.remove('is-live'); setTimeout(mountBackground, 2000); }
      if (kind === 'mark') { mark = null; el.classList.remove('is-live'); setTimeout(mountMark, 2000); }
    }, { once: true });
    return m;
  } catch (err) {
    console.info('Paper Shaders mount failed', err);
    return null;
  }
}

function destroy(m) {
  if (!m) return;
  live.delete(m);
  try { m.dispose(); } catch { /* already gone */ }
}

// Ramp speed up, hold, then ease back to a still frame. Skipped for reduced motion.
const ramps = new WeakMap();
function breathe(m, peak, holdMs) {
  if (!m || reduceMotion.matches) return;
  cancelAnimationFrame(ramps.get(m));
  const t0 = performance.now(), up = 400, down = 1200, total = up + holdMs + down;
  const tick = now => {
    const t = now - t0;
    let s;
    if (t < up) s = peak * (t / up);
    else if (t < up + holdMs) s = peak;
    else if (t < total) { const k = (t - up - holdMs) / down; s = peak * (1 - k) * (1 - k); }
    else { m.setSpeed(0); return; }
    m.setSpeed(s);
    ramps.set(m, requestAnimationFrame(tick));
  };
  ramps.set(m, requestAnimationFrame(tick));
}

/* ---------- background mesh gradient ---------- */
function bgColors() {
  const a = window.__stackAtmosphere;
  const fallback = theme() === 'light' ? ['#f3efe7', '#dde3ea', '#f1ede5', '#d4dce5'] : ['#0b0a0b', '#121b2c', '#0a0909', '#1b2539'];
  return (a && a.colors ? a.colors : fallback).map(P.getShaderColorFromString);
}

function mountBackground() {
  if (bg || !P || forcedColors.matches) return;
  const el = document.getElementById('atmo');
  const colors = bgColors();
  bg = create('bg', el, P.meshGradientFragmentShader, {
    u_colors: colors, u_colorsCount: colors.length,
    u_distortion: 0.85, u_swirl: 0.35, u_grainMixer: 0, u_grainOverlay: 0,
    ...sizing('cover'),
  }, { frame: 8000, minPixelRatio: 1, maxPixelCount: isPhone ? 420 * 900 : 1280 * 900 });
  if (bg) requestAnimationFrame(() => el.classList.add('is-live'));
}

/* ---------- liquid-metal logo ---------- */
function markUniforms() {
  const c = MARK_COLORS[theme()];
  return {
    u_colorBack: P.getShaderColorFromString(c.back),
    u_colorTint: P.getShaderColorFromString(c.tint),
  };
}

function mountMark() {
  if (mark || !P || !markImage) return;
  const el = document.getElementById('brand-mark');
  mark = create('mark', el, P.liquidMetalFragmentShader, {
    ...markUniforms(),
    u_image: markImage, u_isImage: true, u_shape: P.LiquidMetalShapes.none,
    u_contour: 0.4, u_distortion: 0.07, u_softness: 0.1, u_repetition: 2,
    u_shiftRed: 0.3, u_shiftBlue: 0.3, u_angle: 70,
    ...sizing('contain', { u_scale: 0.8 }),
  }, { frame: 2600, minPixelRatio: 2, maxPixelCount: 160 * 160, mipmaps: ['u_image'] });
  if (mark) {
    el.querySelector('img')?.remove();
    el.classList.remove('is-snap');
    el.classList.add('is-live');
  }
}

/* ---------- target-reached badge ---------- */
function showBadge(lang) {
  const slot = document.querySelector(`.block[data-lang="${lang}"] .block-badge`);
  if (!slot || !P) return;
  destroy(badge); badge = null;
  // Free a WebGL slot: swap the logo for a still snapshot while the badge is up.
  if (live.size >= MAX_LIVE && mark) {
    const el = document.getElementById('brand-mark');
    try {
      mark.render(performance.now());
      const img = new Image();
      img.alt = '';
      img.src = mark.canvasElement.toDataURL();
      el.appendChild(img);
      el.classList.add('is-snap');
    } catch { /* falls back to the inline SVG */ }
    el.classList.remove('is-live');
    destroy(mark); mark = null;
  }
  slot.classList.add('is-live');
  badge = create('badge', slot, P.liquidMetalFragmentShader, {
    u_colorBack: P.getShaderColorFromString('#00000000'),
    u_colorTint: P.getShaderColorFromString('#5cc98a'),
    u_image: blankImage, u_isImage: false, u_shape: P.LiquidMetalShapes.circle,
    u_contour: 0.4, u_distortion: 0.07, u_softness: 0.1, u_repetition: 2,
    u_shiftRed: 0.3, u_shiftBlue: 0.3, u_angle: 70,
    ...sizing('contain', { u_scale: 0.75 }),
  }, { frame: 1000, minPixelRatio: 2, maxPixelCount: 96 * 96, mipmaps: ['u_image'] });
  if (badge) breathe(badge, 1, 2600);
  setTimeout(() => {
    destroy(badge); badge = null;
    slot.classList.remove('is-live');
    mountMark();
  }, 4500);
}

/* ---------- wiring ---------- */
document.addEventListener('stack-stats', () => {
  if (bg) bg.setUniforms({ u_colors: bgColors(), u_colorsCount: 4 });
  if (mark) mark.setUniforms(markUniforms());
});
document.addEventListener('session-logged', () => {
  breathe(bg, 0.6, 3000);
  breathe(mark, 1, 3000);
});
document.addEventListener('target-reached', ev => showBadge(ev.detail.lang));

// Start after first paint and idle time so the dashboard never waits on the CDN.
const start = () => (window.requestIdleCallback ? requestIdleCallback(boot, { timeout: 1500 }) : setTimeout(boot, 200));
if (document.readyState === 'complete') start();
else addEventListener('load', start, { once: true });
