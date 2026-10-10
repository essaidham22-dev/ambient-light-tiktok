(() => {
  'use strict';
  if (window.__alTikTok) return;
  window.__alTikTok = true;

  let S = { ...AL_DEFAULTS };
  const vids = new Set();          // every <video> currently on the page
  const glows = new Map();         // video -> its own glow (at most ~3 alive during a scroll crossfade)
  let mo, layer, raf = 0, on = false;
  let lastTick = 0, lastSel = 0, lastScroll = 0, scanT = 0;

  const MEDIA_EVENTS = ['play', 'playing', 'loadeddata', 'emptied', 'ended'];
  const SCROLL_EVENTS = ['scroll', 'wheel', 'touchmove', 'keydown'];
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const clamp01 = x => Math.min(1, Math.max(0, x));

  /* ---------- video discovery (infinite scroll / SPA) ---------- */
  function scan() {
    document.querySelectorAll('video').forEach(v => vids.add(v));
    vids.forEach(v => { if (!v.isConnected) vids.delete(v); });   // forget videos TikTok removed
    kick(); ensureLoop();
  }
  const kick = () => { lastSel = 0; };
  const markScroll = () => { lastScroll = performance.now(); lastSel = 0; };
  const onResize = () => { glows.forEach(g => { g.lastKey = ''; }); kick(); };

  /* The glow belongs to ONE video: the one that is mostly on screen AND has stopped moving.
     The moment a video starts moving (scroll, arrow buttons, snap animation) its glow fades out quickly;
     the next video's glow fades in once it has settled and has a frame. Nothing waits on TikTok's player lifecycle. */
  const motion = new WeakMap();          // video -> last seen position + time it last moved
  let lastGlowSeen = -1e9;               // when any glow was last visible (to tell a scroll hand-off from a first appearance)
  const HANDOFF_MS = 160;                // max fade-out time when a glow is handed over
  function select(now) {
    const cands = [];
    if (on && S.enabled) {
      vids.forEach(v => {
        if (!v.isConnected || !v.videoWidth) return;
        const r = v.getBoundingClientRect();
        if (r.width < 180 || r.height < 180) return;               // ignore thumbnails / hover previews
        let m = motion.get(v);
        if (!m) { m = { x: r.left, y: r.top, t: now }; motion.set(v, m); }
        else if (Math.abs(r.left - m.x) + Math.abs(r.top - m.y) > 0.5) { m.x = r.left; m.y = r.top; m.t = now; }
        const ix = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
        const iy = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        cands.push({ v, frac: (ix * iy) / (r.width * r.height), still: now - m.t >= (S.eco ? 200 : 110) });
      });
      cands.sort((a, b) => b.frac - a.frac);
    }
    const best = cands[0];
    const keep = best && best.frac >= 0.6 && best.still ? best.v : null;
    if (keep) {
      let g = glows.get(keep);
      const inMs = now - lastGlowSeen < 2500 ? Math.min(S.fadeIn, 350) : S.fadeIn;   // quick after a scroll hand-off, full on first appearance
      if (!g) { g = createGlow(keep); g.inMs = inMs; }
      else if (!g.target) { g.target = 1; g.inMs = inMs; }
    }
    glows.forEach((g, v) => {
      if (g.pres > 0.02) lastGlowSeen = now;
      if (v !== keep && g.target) { g.target = 0; g.outMs = Math.min(S.fadeOut, HANDOFF_MS); }
    });
  }

  /* ---------- glow objects ---------- */
  function ensureLayer() {
    if (layer && layer.isConnected) return;
    layer = document.createElement('div');
    layer.id = 'al-tt-layer';
    document.documentElement.appendChild(layer);
  }
  function removeLayer() { if (layer) { layer.remove(); layer = null; } }

  function createGlow(v) {
    ensureLayer();
    const canvas = document.createElement('canvas'); canvas.className = 'al-glow';
    const edge = document.createElement('div'); edge.className = 'al-edge';
    layer.append(canvas, edge);
    const g = {
      v, canvas, edge, ctx: canvas.getContext('2d'), inner: null, ictx: null, hasStatic: false,
      pres: 0, target: 1, ready: false, gone: false, src: v.currentSrc || v.src || '', inMs: S.fadeIn, outMs: S.fadeOut,
      ov: 0, la: '', le: '', sizeKey: '', lastKey: '', first: true,
      lastTime: -1, lastDraw: 0, lastPlace: 0, fit: getComputedStyle(v).objectFit || 'contain'
    };
    glows.set(v, g);
    sizeCanvas(g); styleGlow(g); syncInner(g);
    return g;
  }
  function destroyGlow(g) {
    unmountInner(g); g.canvas.remove(); g.edge.remove(); glows.delete(g.v);
  }

  function styleGlow(g) {
    g.canvas.style.filter = `blur(${S.blur}px)`;
    const sh = [];
    if (S.outlineOn && S.outlineWidth > 0) sh.push(`0 0 0 ${S.outlineWidth}px ${rgba(S.outlineColor, S.outlineOpacity)}`);
    if (S.shadowOn) sh.push(`0 8px ${S.shadowSize}px ${rgba('#000000', S.shadowOpacity)}`);
    g.edge.style.boxShadow = sh.join(',') || 'none';
    if (g.inner) g.inner.style.filter = `blur(${S.blur}px)`;
    g.lastKey = ''; g.la = ''; g.le = '';
  }

  function applyOpacity(g) {
    const p = g.pres, o = p * p * (3 - 2 * p) * g.ov;      // smoothstep easing
    const a = (S.opacity * o).toFixed(3), e = o.toFixed(3);
    if (a !== g.la) { g.la = a; g.canvas.style.opacity = a; if (g.inner) g.inner.style.opacity = a; }
    if (e !== g.le) { g.le = e; g.edge.style.opacity = e; }
  }

  function sizeCanvas(g) {
    const v = g.v;
    if (!v.videoWidth) return;
    const base = { low: 24, medium: 40, high: 72 }[S.eco ? 'low' : S.resolution] || 40;
    const key = `${v.videoWidth}x${v.videoHeight}:${base}`;
    if (key === g.sizeKey) return;
    g.sizeKey = key;
    const ar = v.videoWidth / v.videoHeight;
    g.canvas.width = ar < 1 ? base : Math.round(base * ar);
    g.canvas.height = ar < 1 ? Math.round(base / ar) : base;
    if (g.inner) { g.inner.width = g.canvas.width; g.inner.height = g.canvas.height; }
    g.first = true;
  }

  function place(g) {
    const v = g.v;
    if (g.inner && g.inner.nextSibling !== v) mountInner(g);
    const r = v.getBoundingClientRect();
    let x = r.left, y = r.top, w = r.width, h = r.height;
    if (g.fit === 'contain' && v.videoWidth) {                // account for letterboxing
      const s = Math.min(w / v.videoWidth, h / v.videoHeight);
      const nw = v.videoWidth * s, nh = v.videoHeight * s;
      x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh;
    }
    const ix = Math.max(0, Math.min(x + w, innerWidth) - Math.max(x, 0));
    const iy = Math.max(0, Math.min(y + h, innerHeight) - Math.max(y, 0));
    g.ov = clamp01((ix * iy / ((w * h) || 1) - 0.5) / 0.4);   // on-screen share -> glow strength
    const key = [x, y, w, h].map(n => Math.round(n * 2)).join();
    if (key === g.lastKey) return;
    g.lastKey = key;
    const sp = S.spread, W = w + 2 * sp, H = h + 2 * sp;
    const P = Math.ceil(S.blur * 3 + 60), R = Math.max(0, Math.min(S.radius, w / 2, h / 2));
    const c = g.canvas.style;
    c.width = W + 'px'; c.height = H + 'px';
    c.transform = `translate3d(${x - sp}px,${y - sp}px,0)`;
    // cut a rounded hole where the video sits so the glow never tints the video itself
    c.clipPath = `path(evenodd,"M${-P} ${-P}H${W + P}V${H + P}H${-P}Z` +
      `M${sp + R} ${sp}H${sp + w - R}A${R} ${R} 0 0 1 ${sp + w} ${sp + R}V${sp + h - R}` +
      `A${R} ${R} 0 0 1 ${sp + w - R} ${sp + h}H${sp + R}A${R} ${R} 0 0 1 ${sp} ${sp + h - R}` +
      `V${sp + R}A${R} ${R} 0 0 1 ${sp + R} ${sp}Z")`;
    const e = g.edge.style;
    e.width = w + 'px'; e.height = h + 'px'; e.borderRadius = R + 'px';
    e.transform = `translate3d(${x}px,${y}px,0)`;
    if (g.inner) {                                             // behind-the-video glow, inside TikTok's own container
      const op = v.offsetParent || v.parentElement, pr = op.getBoundingClientRect();
      const i = g.inner.style;
      i.width = W + 'px'; i.height = H + 'px';
      i.left = (x - sp - pr.left - (op.clientLeft || 0)) + 'px';
      i.top = (y - sp - pr.top - (op.clientTop || 0)) + 'px';
      i.clipPath = `inset(${sp}px round ${R}px)`;
    }
  }

  function draw(g) {
    const w = g.canvas.width, h = g.canvas.height, ctx = g.ctx;
    const a = g.first ? 1 : Math.min(1, Math.max(0.05, 1 - S.smoothing));   // temporal smoothing
    try {
      ctx.globalAlpha = a;
      ctx.filter = `brightness(${S.brightness}) contrast(${S.contrast}) saturate(${S.saturation})`;
      ctx.drawImage(g.v, 0, 0, w, h);
      if (S.vibrance !== 0 && !S.eco) {                       // vibrance approximation
        const f = S.vibrance > 0 ? 1 + S.vibrance * 2 : 1 + S.vibrance * 0.9;
        ctx.globalAlpha = a * Math.abs(S.vibrance);
        ctx.filter = `brightness(${S.brightness}) contrast(${S.contrast}) saturate(${S.saturation * f})`;
        ctx.drawImage(g.v, 0, 0, w, h);
      }
      if (g.inner) { g.ictx.clearRect(0, 0, g.inner.width, g.inner.height); g.ictx.drawImage(g.canvas, 0, 0); }
    } catch (_) { /* frame unavailable (e.g. protected content) */ }
  }

  /* ---------- edge feathering: pure CSS on every <video>, so no video can be missed ---------- */
  function applyFeather() {
    const d = document.documentElement;
    if (S.featherOn && S.featherSoftness > 0) {
      d.setAttribute('data-al-feather', '');
      d.style.setProperty('--al-fs', String(+(S.featherSoftness * 0.22).toFixed(2)));
    } else {
      d.removeAttribute('data-al-feather');
      d.style.removeProperty('--al-fs');
    }
  }
  // Glow copy that sits directly BEHIND the video (below captions/controls) and shows through the feathered edge.
  function mountInner(g) {
    const v = g.v;
    if (!g.inner || !v.parentElement) return;
    if (g.inner.nextSibling !== v) v.parentElement.insertBefore(g.inner, v);
    if (!g.hasStatic && getComputedStyle(v).position === 'static') { v.setAttribute('data-al-static', ''); g.hasStatic = true; }
  }
  function unmountInner(g) {
    if (g.inner) { g.inner.remove(); g.inner = g.ictx = null; }
    if (g.hasStatic) { g.v.removeAttribute('data-al-static'); g.hasStatic = false; }
  }
  function syncInner(g) {
    if (!(S.featherOn && S.enabled)) return unmountInner(g);
    if (!g.inner) { g.inner = document.createElement('canvas'); g.inner.className = 'al-inner'; g.ictx = g.inner.getContext('2d'); }
    if (g.inner.width !== g.canvas.width || g.inner.height !== g.canvas.height) { g.inner.width = g.canvas.width; g.inner.height = g.canvas.height; }
    g.inner.style.filter = `blur(${S.blur}px)`;
    mountInner(g); g.la = ''; g.lastKey = '';
  }

  /* ---------- render loop ---------- */
  const ensureLoop = () => { if (!raf) { lastTick = performance.now(); raf = requestAnimationFrame(loop); } };
  const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; };

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!on && !glows.size) { stopLoop(); removeLayer(); return; }
    if (document.hidden) { lastTick = performance.now(); return; }
    const now = performance.now(), dt = Math.min(100, now - lastTick || 16);
    lastTick = now;
    const scrolling = now - lastScroll < 180;
    if (now - lastSel >= (S.eco ? 150 : 0)) { lastSel = now; select(now); }
    glows.forEach(g => step(g, now, dt, scrolling));
  }

  function step(g, now, dt, scrolling) {
    if (!g.gone && !g.v.isConnected) { g.gone = true; g.target = 0; g.outMs = Math.min(S.fadeOut, HANDOFF_MS); }
    if (!g.gone && (g.v.currentSrc || g.v.src || '') !== g.src) return destroyGlow(g);   // TikTok swapped the video's source
    const k = (g.target ? g.inMs : g.outMs) > 0 ? dt / (g.target ? g.inMs : g.outMs) : 1;
    if (g.target) { if (g.ready) g.pres = Math.min(1, g.pres + k); }
    else { g.pres = Math.max(0, g.pres - k); if (g.pres <= 0) return destroyGlow(g); }

    if (!g.gone && (!S.eco || scrolling || now - g.lastPlace > 250)) { place(g); g.lastPlace = now; }
    applyOpacity(g);
    if (g.gone || !g.target || g.v.readyState < 2 || !g.v.videoWidth) return;

    let fps = S.fps === 'display' ? 0 : (+S.fps || 30);
    if (S.eco) { fps = Math.min(fps || 60, 24); if (scrolling && !g.first) return; }
    if (fps && now - g.lastDraw < 1000 / fps - 1) return;
    sizeCanvas(g);
    const t = g.v.currentTime;                                 // skip static / paused frames
    if (!g.first && t === g.lastTime && now - g.lastDraw < (S.eco ? 1500 : 500)) return;
    g.lastTime = t; g.lastDraw = now;
    draw(g);
    g.first = false; g.ready = true;
  }

  /* ---------- hide page elements ---------- */
  // Selectors use stable-ish attributes and class-name fragments, because TikTok's hashed class names change.
  const HIDE = {
    hideSidebar: ['[class*="DivSideNavContainer"]', '[class*="SideNavContainer"]', '[data-e2e="sidebar"]'],
    hideHeader: ['#app-header', '[class*="DivHeaderContainer"]', '[data-e2e="top-header"]'],
    hideActions: ['[class*="SectionActionBarContainer"]', '[class*="DivActionBarWrapper"]', '[class*="ActionBarContainer"]'],
    hideNav: ['[class*="DivFeedNavigationContainer"]', '[class*="FeedNavigation"]', 'button[data-e2e="arrow-up"]', 'button[data-e2e="arrow-down"]',
              '[data-e2e="arrow-up"]', '[data-e2e="arrow-down"]', '[data-e2e="arrow-left"]', '[data-e2e="arrow-right"]']
  };
  function applyHide() {
    let css = '';
    for (const k in HIDE) {
      if (!S[k]) continue;
      const sel = HIDE[k];
      css += S.hideReveal
        ? `${sel.join(',')}{opacity:0!important;transition:opacity .2s ease}${sel.map(x => x + ':hover').join(',')}{opacity:1!important}`
        : `${sel.join(',')}{visibility:hidden!important}`;
    }
    let el = document.getElementById('al-tt-hide');
    if (!css) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'al-tt-hide'; document.documentElement.appendChild(el); }
    if (el.textContent !== css) el.textContent = css;
  }

  /* ---------- lifecycle ---------- */
  function enable() {
    if (on) return;
    on = true;
    mo = new MutationObserver(() => { clearTimeout(scanT); scanT = setTimeout(scan, 150); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    MEDIA_EVENTS.forEach(e => document.addEventListener(e, kick, true));
    SCROLL_EVENTS.forEach(e => addEventListener(e, markScroll, { capture: true, passive: true }));
    addEventListener('resize', onResize);
    addEventListener('popstate', scan);
    scan();
  }

  function disable() {
    if (!on) return;
    on = false;
    mo.disconnect();
    MEDIA_EVENTS.forEach(e => document.removeEventListener(e, kick, true));
    SCROLL_EVENTS.forEach(e => removeEventListener(e, markScroll, true));
    removeEventListener('resize', onResize);
    removeEventListener('popstate', scan);
    clearTimeout(scanT);
    vids.clear();
    glows.forEach(g => { g.target = 0; g.outMs = S.fadeOut; });   // fade out, then the loop cleans up and stops itself
    ensureLoop();
  }

  function applySettings(s) {
    S = { ...AL_DEFAULTS, ...s };
    applyHide();
    applyFeather();                                            // works even when the glow is switched off
    if (!S.enabled) return disable();
    if (!on) enable();
    glows.forEach(g => { sizeCanvas(g); styleGlow(g); syncInner(g); });
    kick(); ensureLoop();
  }

  chrome.storage.local.get('settings', d => applySettings(d.settings));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.settings) applySettings(c.settings.newValue);
  });
})();
