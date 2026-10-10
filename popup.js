const $ = s => document.querySelector(s);
// [key, label, type, options, dependsOnToggleKey]
const R = (k, l, min, max, step, u = '', dep) => [k, l, 'range', { min, max, step, u }, dep];
const T = (k, l) => [k, l, 'toggle'];
const C = (k, l, dep) => [k, l, 'color', null, dep];
const SEL = (k, l, o) => [k, l, 'select', o];

const SCHEMA = [
  { id: 'glow', t: 'Glow', open: true, c: [
    R('blur', 'Blur radius', 0, 200, 1, 'px'), R('spread', 'Spread distance', 0, 200, 1, 'px'),
    R('opacity', 'Opacity', 0, 1, 0.01), R('smoothing', 'Smoothing', 0, 0.95, 0.01),
    R('fadeIn', 'Fade-in', 0, 2000, 10, 'ms'), R('fadeOut', 'Fade-out', 0, 2000, 10, 'ms') ] },
  { id: 'color', t: 'Color', c: [
    R('brightness', 'Brightness', 0.5, 2, 0.01), R('contrast', 'Contrast', 0.5, 2, 0.01),
    R('saturation', 'Saturation', 0, 3, 0.01), R('vibrance', 'Vibrance', -1, 1, 0.05) ] },
  { id: 'frame', t: 'Frame', c: [
    R('radius', 'Corner radius', 0, 40, 1, 'px'),
    T('shadowOn', 'Drop shadow'), R('shadowSize', 'Size', 0, 120, 1, 'px', 'shadowOn'), R('shadowOpacity', 'Opacity', 0, 1, 0.01, '', 'shadowOn'),
    T('outlineOn', 'Video outline'), R('outlineWidth', 'Width', 0, 10, 1, 'px', 'outlineOn'),
    C('outlineColor', 'Color', 'outlineOn'), R('outlineOpacity', 'Opacity', 0, 1, 0.01, '', 'outlineOn') ] },
  { id: 'edges', t: 'Soft edges', c: [
    T('featherOn', 'Soften video edges'), R('featherSoftness', 'Softness', 0, 100, 1, '%', 'featherOn') ] },
  { id: 'perf', t: 'Performance', c: [
    SEL('fps', 'Frame rate', [['30', '30 FPS'], ['60', '60 FPS'], ['display', 'Display rate']]),
    SEL('resolution', 'Sample quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
    T('eco', 'Eco mode (low power)') ] },
  { id: 'hide', t: 'Hide page elements', c: [
    T('hideSidebar', 'Left sidebar'), T('hideHeader', 'Top-right bar (Get Coins / Get App)'),
    T('hideActions', 'Like / comment / share buttons'), T('hideNav', 'Up / down arrows'),
    T('hideReveal', 'Show again on hover') ] }
];
const FLAT = Object.fromEntries(SCHEMA.flatMap(g => g.c).map(c => [c[0], c]));
let S = { ...AL_DEFAULTS }, saveT = 0;

/* ---------- build ---------- */
function ctl([k, label, type, o, dep]) {
  const d = dep ? ` data-dep="${dep}"` : '';
  if (type === 'toggle') return `<label class="row"${d}><span class="label">${label}</span><span class="switch"><input type="checkbox" data-k="${k}"><i></i></span></label>`;
  if (type === 'color') return `<label class="row"${d}><span class="label">${label}</span><input type="color" data-k="${k}"></label>`;
  if (type === 'select') return `<label class="row"${d}><span class="label">${label}</span><select data-k="${k}">${o.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
  return `<label class="row col"${d}><span class="top"><span class="label">${label}</span><span class="val" data-v="${k}"></span></span><input type="range" data-k="${k}" min="${o.min}" max="${o.max}" step="${o.step}"></label>`;
}

let openState = {};
try { openState = JSON.parse(localStorage.getItem('al-open') || '{}'); } catch (_) {}
$('#groups').innerHTML = SCHEMA.map(g => {
  const open = g.id in openState ? openState[g.id] : !!g.open;
  return `<section class="group${open ? ' open' : ''}" data-g="${g.id}">
    <button type="button" aria-expanded="${open}">${g.t}</button>
    <div class="body"><div class="inner">${g.c.map(ctl).join('')}</div></div></section>`;
}).join('');

$('#groups').addEventListener('click', e => {
  const b = e.target.closest('.group > button'); if (!b) return;
  const g = b.parentElement, open = g.classList.toggle('open');
  b.setAttribute('aria-expanded', open);
  openState[g.dataset.g] = open;
  try { localStorage.setItem('al-open', JSON.stringify(openState)); } catch (_) {}
});

/* ---------- state <-> UI ---------- */
function show(k) {
  const el = document.querySelector(`[data-k="${k}"]`); if (!el) return;
  if (el.type === 'checkbox') el.checked = !!S[k]; else el.value = S[k];
  if (el.type === 'range') {
    el.style.setProperty('--p', ((S[k] - el.min) / (el.max - el.min) * 100) + '%');
    const out = document.querySelector(`[data-v="${k}"]`);
    // Print the number as-is: 30 stays 30, 100 stays 100, 0.65 stays 0.65.
    if (out) out.textContent = String(+(+S[k]).toFixed(2)) + (FLAT[k][3].u || '');
  }
}
function syncDeps() {
  document.querySelectorAll('[data-dep]').forEach(r => r.classList.toggle('off', !S[r.dataset.dep]));
}
const syncAll = () => { Object.keys(AL_DEFAULTS).forEach(show); syncDeps(); };

function flash(msg) {
  const el = $('#status'); el.textContent = msg; el.classList.add('show');
  clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove('show'), 1300);
}
function save(now) {
  clearTimeout(saveT);
  const go = () => chrome.storage.local.set({ settings: S });
  now ? go() : (saveT = setTimeout(go, 30));
}

document.addEventListener('input', e => {
  const t = e.target, k = t.dataset.k; if (!k) return;
  S[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value;
  show(k);
  if (t.type === 'checkbox') syncDeps();
  save();
});

/* ---------- import / export / reset ---------- */
function sanitize(obj) {
  const out = {};
  for (const k in AL_DEFAULTS) {
    const v = obj?.[k], d = AL_DEFAULTS[k];
    if (typeof v !== typeof d) continue;
    const c = FLAT[k];
    if (typeof v === 'number' && c) out[k] = Math.min(c[3].max, Math.max(c[3].min, v));
    else if (c?.[2] === 'select') { if (c[3].some(([x]) => x === v)) out[k] = v; }
    else if (c?.[2] === 'color') { if (/^#[0-9a-f]{6}$/i.test(v)) out[k] = v; }
    else out[k] = v;
  }
  return out;
}
$('#reset').onclick = () => { S = { ...AL_DEFAULTS }; syncAll(); save(true); flash('Reset to defaults'); };
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'ambient-light-tiktok', version: 1, settings: S }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'ambient-light-tiktok-settings.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash('Exported');
};
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    S = { ...AL_DEFAULTS, ...sanitize(j.settings || j) };
    syncAll(); save(true); flash('Imported');
  } catch { flash('Invalid file'); }
};

chrome.storage.local.get('settings', d => { S = { ...AL_DEFAULTS, ...d.settings }; syncAll(); });
