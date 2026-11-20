// Fixed scenes for screenshots: ?shot=cover shows the finished cover alone, edge to edge;
// ?shot=editor shows the studio with photos loaded and the panels framed. Query params pick
// the layout, grade, post size, sample photos and words, plus per-panel framing overrides
// (pzoom / pfx / pfy, comma-separated by panel). window.__shotReady is set once the scene is
// painted, and window.neonCoast.exportDataURL() hands back the app's real exported PNG.
export async function runShot(query, scene) {
  const { state, loadSample, finish } = scene;
  if (query.get('shot') === 'cover') document.body.classList.add('shot-cover');
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.grade = query.get('grade');
  if (query.get('size')) state.size = query.get('size');
  for (const key of ['kicker', 'caption', 'subtitle', 'badge']) {
    if (query.get(key) !== null) state[key] = query.get(key);
  }
  if (query.get('heat') !== null) state.heat = Number(query.get('heat'));
  if (query.get('grain') === '0') state.grain = false;
  if (query.get('vignette') === '0') state.vignette = false;

  const names = (query.get('photos') ?? 'neon,boulevard,pier')
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of names) await loadSample(name);

  if (query.get('spread') && state.photos.length) {
    state.spread = true;
    for (const p of state.panels) p.photo = 0;
  }
  const lists = {
    zoom: (query.get('pzoom') ?? '').split(','),
    fx: (query.get('pfx') ?? '').split(','),
    fy: (query.get('pfy') ?? '').split(','),
  };
  state.panels.forEach((panel, i) => {
    for (const key of ['zoom', 'fx', 'fy']) {
      const v = lists[key][i];
      if (v !== undefined && v !== '') panel[key] = Number(v);
    }
  });

  await finish();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
