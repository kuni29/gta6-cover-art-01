// Neon Coast Cover Studio: wires the page to the cover engine (./cover.js).
// Photos are read with object URLs and drawn on the user's own machine — nothing is uploaded.
// A `?shot=` query sets up a fixed scene for screenshots instead (./shots.js), and
// window.neonCoast exposes the state plus the app's real PNG export for those captures.
import {
  POST_SIZES, GRADES, LAYOUTS, newState, resetPanels,
  layoutById, sizeById, drawCover, exportCoverPNG,
} from './cover.js';
import { runShot } from './shots.js';

const state = newState();
resetPanels(state);

const canvas = document.getElementById('cover');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
let activePanel = 0;
let frameQueued = false;

// Redraw the live preview, coalescing bursts of control changes into one paint.
function redraw() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    drawCover(ctx, canvas.width, canvas.height, state);
  });
}

// Size the preview canvas to the chosen post size's aspect (the export uses full resolution).
function fitPreview() {
  const size = sizeById(state.size);
  const scale = Math.min(1, 560 / size.w);
  canvas.width = Math.round(size.w * scale);
  canvas.height = Math.round(size.h * scale);
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Add a loaded image to the photo set and refresh everything that depends on it.
function addPhoto(img, name) {
  state.photos.push({ img, name });
  if (state.spread) for (const p of state.panels) p.photo = 0;
  else resetPanels(state);
  buildPhotoStrip();
  buildPanelList();
  redraw();
}

async function addPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  addPhoto(img, file.name.replace(/\.[^.]+$/, ''));
}

async function addSample(name) {
  const img = await loadImage(`samples/${name}.jpg`);
  addPhoto(img, name);
}

// --- Photos UI -------------------------------------------------------------

const photoStrip = document.getElementById('photoStrip');
function buildPhotoStrip() {
  photoStrip.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    img.title = photo.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.title = `Remove ${photo.name}`;
    del.addEventListener('click', () => {
      state.photos.splice(i, 1);
      for (const p of state.panels) {
        if (p.photo === i) p.photo = -1;
        else if (p.photo > i) p.photo -= 1;
      }
      buildPhotoStrip();
      buildPanelList();
      redraw();
    });
    fig.append(img, del);
    photoStrip.append(fig);
  });
}

document.getElementById('photoInput').addEventListener('change', async (e) => {
  for (const file of e.target.files) await addPhotoFile(file);
  e.target.value = '';
  if (state.photos.length) status.textContent = `${state.photos.length} photo(s) loaded — now frame the panels.`;
});
document.getElementById('sampleBtn').addEventListener('click', async () => {
  for (const name of ['neon', 'boulevard', 'pier']) await addSample(name);
  status.textContent = 'Sample photos loaded (made with an image model, free to use).';
});

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  for (const file of e.dataTransfer.files) if (file.type.startsWith('image/')) await addPhotoFile(file);
});

document.getElementById('spreadToggle').addEventListener('change', (e) => {
  state.spread = e.target.checked;
  if (state.spread && state.photos.length) for (const p of state.panels) p.photo = 0;
  if (!state.spread) resetPanels(state);
  buildPanelList();
  redraw();
});

// --- Panels UI -------------------------------------------------------------

const panelList = document.getElementById('panelList');
function buildPanelList() {
  panelList.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const row = document.createElement('div');
    row.className = 'panel-row' + (i === activePanel ? ' active' : '');
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = `Panel ${i + 1}`;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Photo for panel ${i + 1}`);
    const none = document.createElement('option');
    none.value = '-1';
    none.textContent = '— empty —';
    sel.append(none);
    state.photos.forEach((photo, pi) => {
      const opt = document.createElement('option');
      opt.value = String(pi);
      opt.textContent = `Photo ${pi + 1} · ${photo.name}`;
      sel.append(opt);
    });
    sel.value = String(panel.photo);
    sel.addEventListener('change', () => { panel.photo = Number(sel.value); redraw(); });
    const zoom = document.createElement('input');
    zoom.type = 'range';
    zoom.min = '1';
    zoom.max = '2.8';
    zoom.step = '0.01';
    zoom.value = String(panel.zoom);
    zoom.setAttribute('aria-label', `Zoom for panel ${i + 1}`);
    zoom.addEventListener('input', () => { panel.zoom = Number(zoom.value); redraw(); });
    row.addEventListener('pointerdown', () => { activePanel = i; buildPanelList(); });
    row.append(name, sel, zoom);
    panelList.append(row);
  });
}

// Drag on the preview to reframe the panel under the pointer; scroll to zoom it.
function panelAt(x, y) {
  const layout = layoutById(state.layout);
  const rects = layout.rects();
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const hit = panelAt(x, y);
  if (hit < 0) return;
  activePanel = hit;
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  buildPanelList();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const panel = state.panels[activePanel];
  panel.fx = clamp(panel.fx + ((e.clientX - drag.x) / rect.width) * 2.4, -1, 1);
  panel.fy = clamp(panel.fy + ((e.clientY - drag.y) / rect.height) * 2.4, -1, 1);
  drag = { x: e.clientX, y: e.clientY };
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const hit = panelAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  if (hit < 0) return;
  activePanel = hit;
  const panel = state.panels[hit];
  panel.zoom = clamp(panel.zoom * Math.exp(-e.deltaY * 0.0012), 1, 3);
  buildPanelList();
  redraw();
}, { passive: false });

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// --- Layout, grade, words, size -------------------------------------------

function buildSegRow(el, items, current, onPick) {
  el.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = item.name ?? item.label;
    b.setAttribute('aria-pressed', String(item.id === current));
    b.addEventListener('click', () => onPick(item.id));
    el.append(b);
  }
}
function buildPickers() {
  buildSegRow(document.getElementById('layoutRow'), LAYOUTS, state.layout, (id) => {
    state.layout = id;
    activePanel = 0;
    resetPanels(state);
    if (state.spread && state.photos.length) for (const p of state.panels) p.photo = 0;
    buildPanelList();
    buildPickers();
    redraw();
  });
  buildSegRow(document.getElementById('gradeRow'), GRADES, state.grade, (id) => {
    state.grade = id;
    buildPickers();
    redraw();
  });
}

const sizeSel = document.getElementById('sizeSel');
for (const s of POST_SIZES) {
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = s.label;
  sizeSel.append(opt);
}
sizeSel.value = state.size;
sizeSel.addEventListener('change', () => { state.size = sizeSel.value; fitPreview(); redraw(); });

for (const [id, key] of [['kicker', 'kicker'], ['caption', 'caption'], ['subtitle', 'subtitle'], ['badge', 'badge']]) {
  document.getElementById(id).addEventListener('input', (e) => { state[key] = e.target.value; redraw(); });
}
document.getElementById('heat').addEventListener('change', (e) => { state.heat = Number(e.target.value); redraw(); });
document.getElementById('grainToggle').addEventListener('change', (e) => { state.grain = e.target.checked; redraw(); });
document.getElementById('vignetteToggle').addEventListener('change', (e) => { state.vignette = e.target.checked; redraw(); });

// --- Export -----------------------------------------------------------------

document.getElementById('exportBtn').addEventListener('click', async () => {
  const blob = await exportCoverPNG(state);
  const size = sizeById(state.size);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neon-coast-cover-${size.w}x${size.h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  status.textContent = `Saved neon-coast-cover-${size.w}x${size.h}.png — post it anywhere.`;
});

// The app's real export as a data URL, for screenshot captures of an exported cover.
async function exportDataURL() {
  const blob = await exportCoverPNG(state);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
// Paint the cover at an exact pixel size (screenshot captures of the cover scene).
function renderAt(w, h) {
  canvas.width = w;
  canvas.height = h;
  drawCover(ctx, w, h, state);
}
window.neonCoast = { state, exportDataURL, renderAt };

// Keep every control in step with the state (used after a ?shot= scene sets it up).
function syncUI() {
  document.getElementById('kicker').value = state.kicker;
  document.getElementById('caption').value = state.caption;
  document.getElementById('subtitle').value = state.subtitle;
  document.getElementById('badge').value = state.badge;
  document.getElementById('heat').value = String(state.heat);
  document.getElementById('spreadToggle').checked = state.spread;
  sizeSel.value = state.size;
  buildPhotoStrip();
  buildPanelList();
  buildPickers();
  fitPreview();
  redraw();
}

// --- Boot -------------------------------------------------------------------

const query = new URLSearchParams(location.search);
async function boot() {
  buildPickers();
  buildPanelList();
  fitPreview();
  redraw();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('40px Anton'),
        document.fonts.load('40px Pacifico'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fonts fall back to system faces */ }
  redraw();
  if (query.get('shot')) {
    await runShot(query, {
      state,
      loadSample: addSample,
      finish: async () => { syncUI(); await document.fonts.ready; redraw(); },
    });
  }
}
boot();
