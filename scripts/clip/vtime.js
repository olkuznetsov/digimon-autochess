// Virtual time for frame-exact capture: rAF, timers, performance.now/Date.now and CSS
// animations run on a clock that only advances when __vt.step() is called.
(() => {
  if (window.__vt) return;
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const rST = window.setTimeout.bind(window), rCT = window.clearTimeout.bind(window);
  const rSI = window.setInterval.bind(window), rCI = window.clearInterval.bind(window);
  let virtual = false, vt = 0, vt0 = 0, date0 = 0;
  performance.now = () => (virtual ? vt : realNow());
  Date.now = () => (virtual ? date0 + (vt - vt0) : realDateNow());
  let q = [], nextId = 1;
  window.requestAnimationFrame = (cb) => { const id = nextId++; q.push([id, cb]); return id; };
  window.cancelAnimationFrame = (id) => { q = q.filter((e) => e[0] !== id); };
  const flush = (ts) => { const cur = q; q = []; for (const [, cb] of cur) { try { cb(ts); } catch (e) { console.error(e); } } };
  const pump = () => { if (!virtual) flush(realNow()); realRaf(pump); };
  realRaf(pump);
  let timers = [], tid = 1e7;
  window.setTimeout = (cb, ms, ...a) => {
    if (!virtual) return rST(cb, ms, ...a);
    const id = tid++; timers.push({ id, at: vt + Math.max(0, +ms || 0), cb, a }); return id;
  };
  window.clearTimeout = (id) => { if (id >= 1e7) timers = timers.filter((t) => t.id !== id); else rCT(id); };
  window.setInterval = (cb, ms, ...a) => {
    if (!virtual) return rSI(cb, ms, ...a);
    const every = Math.max(1, +ms || 0); const id = tid++; timers.push({ id, at: vt + every, every, cb, a }); return id;
  };
  window.clearInterval = (id) => { if (id >= 1e7) timers = timers.filter((t) => t.id !== id); else rCI(id); };
  const tracked = new WeakMap();
  const syncAnims = () => {
    for (const an of document.getAnimations()) {
      let t = tracked.get(an);
      if (!t) { t = { start: vt, done: false }; tracked.set(an, t); try { an.pause(); } catch {} }
      if (t.done) continue;
      const local = vt - t.start;
      let end = Infinity;
      try { end = an.effect.getComputedTiming().endTime; } catch {}
      if (local >= end) { t.done = true; try { an.finish(); } catch {} } else { try { an.currentTime = local; } catch {} }
    }
  };
  window.__vt = {
    start() { vt = realNow(); vt0 = vt; date0 = realDateNow(); virtual = true; },
    now: () => vt,
    // advance the clock: due timers in order, then one animation frame
    step(ms) {
      const target = vt + ms;
      for (let guard = 0; guard < 10000; guard++) {
        timers.sort((x, y) => x.at - y.at || x.id - y.id);
        const t = timers[0];
        if (!t || t.at > target) break;
        vt = Math.max(vt, t.at);
        if (t.every) t.at += t.every; else timers.shift();
        try { if (typeof t.cb === "function") t.cb(...t.a); else (0, eval)(t.cb); } catch (e) { console.error(e); }
      }
      vt = target;
      flush(vt);
    },
    // let React commit (MessageChannel tasks run in real time), then pose the CSS animations
    settle: () => new Promise((r) => rST(() => { syncAnims(); r(); }, 12)),
  };
})();
