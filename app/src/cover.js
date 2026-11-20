// Neon Coast Cover Studio: the cover engine.
// Draws a multi-panel, GTA-poster-style cover from the user's own photos onto any 2D canvas:
// panel layouts, a Vice City sunset / neon colour grade (a per-pixel gradient map), film grain,
// a vignette, white poster framing and bold display lettering (Anton for the caption, Pacifico
// for the script subtitle). The same drawCover() paints the editor's live preview and the
// exported PNG, so what the user sees is exactly what they share.

export const POST_SIZES = [
  { id: 'square', label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait · 1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: 'Wide · 1920 × 1080', w: 1920, h: 1080 },
];

// Colour grades as luminance ramps: a photo's brightness is remapped through these stops and
// mixed back with the original, which is what gives the panels their sunset / neon cast.
export const GRADES = [
  { id: 'sunset', name: 'Vice Sunset', mix: 0.55, sat: 1.28, con: 1.07,
    stops: [[0, '#221238'], [0.32, '#7c2d5d'], [0.62, '#e2603f'], [0.85, '#ff9e57'], [1, '#ffe9bd']] },
  { id: 'neon', name: 'Neon Nights', mix: 0.5, sat: 1.35, con: 1.1,
    stops: [[0, '#0a1030'], [0.38, '#173a6b'], [0.66, '#b83a8c'], [0.86, '#ff71ce'], [1, '#aef3ff']] },
  { id: 'gold', name: 'Golden Hour', mix: 0.45, sat: 1.18, con: 1.05,
    stops: [[0, '#1d1206'], [0.4, '#8a5a1d'], [0.7, '#e8a83e'], [1, '#fff3d6']] },
  { id: 'dusk', name: 'Dusk Mono', mix: 0.38, sat: 0.92, con: 1.12,
    stops: [[0, '#101014'], [0.5, '#5a5f6e'], [1, '#f2f0ea']] },
];

// Panel layouts. Rects are fractions of the cover; `title` is either a panel of its own
// (kind 'panel', painted dark) or a band laid over the art with a scrim (kind 'band').
export const LAYOUTS = [
  { id: 'grid', name: 'Cover Grid', panels: 5,
    rects: () => [
      { x: 0.0, y: 0.0, w: 0.322, h: 0.52 },
      { x: 0.678, y: 0.0, w: 0.322, h: 0.52 },
      { x: 0.339, y: 0.352, w: 0.322, h: 0.648 },
      { x: 0.0, y: 0.532, w: 0.322, h: 0.468 },
      { x: 0.678, y: 0.532, w: 0.322, h: 0.468 },
    ],
    title: { kind: 'panel', x: 0.339, y: 0.0, w: 0.322, h: 0.34 } },
  { id: 'hero', name: 'Hero & Crew', panels: 4,
    rects: () => [
      { x: 0.0, y: 0.0, w: 0.618, h: 1.0 },
      { x: 0.632, y: 0.0, w: 0.368, h: 0.322 },
      { x: 0.632, y: 0.339, w: 0.368, h: 0.322 },
      { x: 0.632, y: 0.678, w: 0.368, h: 0.322 },
    ],
    title: { kind: 'band', x: 0.0, y: 0.66, w: 0.618, h: 0.34 } },
  { id: 'strips', name: 'Neon Strips', panels: 4,
    rects: () => [
      { x: 0.0, y: 0.0, w: 0.242, h: 1.0 },
      { x: 0.253, y: 0.0, w: 0.242, h: 1.0 },
      { x: 0.505, y: 0.0, w: 0.242, h: 1.0 },
      { x: 0.758, y: 0.0, w: 0.242, h: 1.0 },
    ],
    title: { kind: 'band', x: 0.0, y: 0.375, w: 1.0, h: 0.25 } },
  { id: 'full', name: 'Full Bleed', panels: 1,
    rects: () => [{ x: 0.0, y: 0.0, w: 1.0, h: 1.0 }],
    title: { kind: 'band', x: 0.0, y: 0.6, w: 1.0, h: 0.4 } },
];

export function layoutById(id) { return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]; }
export function gradeById(id) { return GRADES.find((g) => g.id === id) ?? GRADES[0]; }
export function sizeById(id) { return POST_SIZES.find((s) => s.id === id) ?? POST_SIZES[0]; }

// A fresh editor state: no photos yet, sensible poster defaults.
export function newState() {
  return {
    size: 'portrait',
    layout: 'grid',
    grade: 'sunset',
    photos: [],            // [{ img, name }] — the user's own pictures, kept on this machine
    panels: [],            // [{ photo, zoom, fx, fy }] one per layout panel
    spread: false,         // true: one photo flows across every panel like a single poster
    kicker: 'WELCOME TO',
    caption: 'NEON COAST',
    subtitle: 'vice season',
    badge: 'LAUNCH WEEK',
    heat: 5,               // wanted-style star row, 0..5
    grain: true,
    vignette: true,
  };
}

// (Re)build the panel assignments for the current layout, keeping any framing that still fits
// and dealing the loaded photos across the panels in order.
export function resetPanels(state) {
  const count = layoutById(state.layout).panels;
  const next = [];
  for (let i = 0; i < count; i++) {
    const kept = state.panels[i];
    next.push({
      photo: state.photos.length ? i % state.photos.length : -1,
      zoom: kept?.zoom ?? 1,
      fx: kept?.fx ?? 0,
      fy: kept?.fy ?? 0,
    });
  }
  state.panels = next;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Build a 256-entry gradient-map lookup table for a grade.
function buildLut(grade) {
  const stops = grade.stops.map(([at, hex]) => [at, hexToRgb(hex)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const f = a[0] === b[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
  }
  return lut;
}

// Remap the canvas through the grade's ramp, mixed with the original pixels.
function applyGrade(ctx, w, h, grade) {
  const lut = buildLut(grade);
  const mix = grade.mix;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 54 + px[i + 1] * 182 + px[i + 2] * 19) >> 8; // ~0.2126/0.7152/0.0722
    const o = lum * 3;
    px[i] += (lut[o] - px[i]) * mix;
    px[i + 1] += (lut[o + 1] - px[i + 1]) * mix;
    px[i + 2] += (lut[o + 2] - px[i + 2]) * mix;
  }
  ctx.putImageData(data, 0, 0);
}

// Cover-fit geometry: scale an image to fill a box, returning the drawn size.
function coverFit(imgW, imgH, boxW, boxH, zoom) {
  const scale = Math.max(boxW / imgW, boxH / imgH) * zoom;
  return { dw: imgW * scale, dh: imgH * scale };
}

// Paint one photo into a panel rect, honouring the panel's zoom and focal offsets.
// In spread mode the photo is fitted to the whole cover once and each panel shows its slice.
function paintPhoto(ctx, img, rect, panel, state, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (state.spread) {
    const fit = coverFit(img.naturalWidth, img.naturalHeight, w, h, panel.zoom);
    const dx = (w - fit.dw) / 2 + panel.fx * Math.max(0, fit.dw - w) * 0.5;
    const dy = (h - fit.dh) / 2 + panel.fy * Math.max(0, fit.dh - h) * 0.5;
    ctx.drawImage(img, dx, dy, fit.dw, fit.dh);
  } else {
    const fit = coverFit(img.naturalWidth, img.naturalHeight, rect.w, rect.h, panel.zoom);
    const dx = rect.x + (rect.w - fit.dw) / 2 + panel.fx * Math.max(0, fit.dw - rect.w) * 0.5;
    const dy = rect.y + (rect.h - fit.dh) / 2 + panel.fy * Math.max(0, fit.dh - rect.h) * 0.5;
    ctx.drawImage(img, dx, dy, fit.dw, fit.dh);
  }
  ctx.restore();
}

// A panel with no photo yet: a dusk gradient with a palm silhouette and its number, so the
// empty cover still reads as a poster and invites the first click.
function paintPlaceholder(ctx, rect, index) {
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  g.addColorStop(0, '#3a1c5e');
  g.addColorStop(0.55, '#93335f');
  g.addColorStop(1, '#e2703a');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const cx = rect.x + rect.w / 2, base = rect.y + rect.h;
  const s = Math.min(rect.w, rect.h);
  ctx.fillStyle = 'rgba(20,8,32,0.85)';
  ctx.beginPath(); // palm trunk
  ctx.moveTo(cx - s * 0.03, base);
  ctx.quadraticCurveTo(cx + s * 0.02, base - s * 0.55, cx + s * 0.16, base - s * 0.78);
  ctx.lineTo(cx + s * 0.23, base - s * 0.76);
  ctx.quadraticCurveTo(cx + s * 0.1, base - s * 0.5, cx + s * 0.05, base);
  ctx.closePath();
  ctx.fill();
  for (let f = 0; f < 5; f++) { // palm fronds
    const a = Math.PI * (0.08 + f * 0.21);
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.19, base - s * 0.77);
    ctx.quadraticCurveTo(
      cx + s * 0.19 + Math.cos(a) * s * 0.3, base - s * 0.77 - Math.sin(a) * s * 0.3 - s * 0.06,
      cx + s * 0.19 + Math.cos(a) * s * 0.46, base - s * 0.77 - Math.sin(a) * s * 0.18);
    ctx.lineTo(cx + s * 0.19 + Math.cos(a) * s * 0.44, base - s * 0.77 - Math.sin(a) * s * 0.13);
    ctx.quadraticCurveTo(
      cx + s * 0.19 + Math.cos(a) * s * 0.28, base - s * 0.77 - Math.sin(a) * s * 0.24,
      cx + s * 0.19, base - s * 0.74);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.round(s * 0.16)}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), cx, rect.y + s * 0.28);
}

// One shared noise tile for the film grain pass.
let noiseTile = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas');
  c.width = c.height = 140;
  const nctx = c.getContext('2d');
  const data = nctx.createImageData(140, 140);
  let seed = 1234567;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = 96 + (seed % 96);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  nctx.putImageData(data, 0, 0);
  noiseTile = c;
  return c;
}

// Shrink a font size until the text fits its box (single line).
function fitFont(ctx, text, font, start, maxWidth, min) {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

// Split a multi-word caption across two lines, balancing by length.
function splitCaption(caption) {
  const words = caption.split(/\s+/);
  if (words.length < 2) return [caption];
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < bestDiff) { bestDiff = Math.abs(a - b); best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

// The caption block: star row, letterspaced kicker, big gradient-filled Anton lettering with a
// heavy outline, and the Pacifico subtitle in neon pink — drawn inside the title area.
function paintLettering(ctx, state, box, w, h) {
  const cx = box.x + box.w / 2;
  const unit = Math.min(w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (state.heat > 0) {
    const star = unit * 0.026;
    const gap = star * 2.5;
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = 'rgba(40,16,0,0.65)';
    for (let i = 0; i < 5; i++) {
      const sx = cx - gap * 2 + i * gap;
      const sy = box.y + box.h * 0.13;
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const r = p % 2 === 0 ? star : star * 0.45;
        const a = -Math.PI / 2 + p * Math.PI / 5;
        const vx = sx + Math.cos(a) * r, vy = sy + Math.sin(a) * r;
        if (p === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.lineWidth = star * 0.16;
      if (i < state.heat) { ctx.fill(); ctx.stroke(); }
      else { ctx.save(); ctx.globalAlpha = 0.28; ctx.fill(); ctx.restore(); }
    }
  }

  if (state.kicker) {
    const kSize = Math.max(11, unit * 0.03);
    ctx.font = `${kSize}px Anton, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(kSize * 0.55)}px`; } catch { /* no letterSpacing */ }
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = unit * 0.008;
    ctx.fillText(state.kicker.toUpperCase(), cx, box.y + box.h * 0.24);
    try { ctx.letterSpacing = '0px'; } catch { /* no letterSpacing */ }
    ctx.shadowBlur = 0;
  }

  const caption = (state.caption || 'NEON COAST').toUpperCase();
  const lines = caption.includes(' ') && box.h > box.w * 0.5 ? splitCaption(caption) : [caption];
  const maxW = box.w * 0.94;
  const anton = (s) => `${s}px Anton, sans-serif`;
  let capSize = unit * 0.16;
  for (const line of lines) capSize = fitFont(ctx, line, anton, capSize, maxW, 18);
  // The caption lives in its own zone below the kicker, so the lines never collide.
  const zoneTop = box.y + box.h * 0.35;
  const zoneH = box.h * (state.subtitle ? 0.38 : 0.52);
  capSize = Math.min(capSize, zoneH / (lines.length * 1.04));
  const lineH = capSize * 1.04;
  const blockH = lineH * lines.length;
  const topY = zoneTop + (zoneH - blockH) / 2;
  const grad = ctx.createLinearGradient(0, topY, 0, topY + blockH);
  grad.addColorStop(0, '#fffbe8');
  grad.addColorStop(0.45, '#ffd34d');
  grad.addColorStop(0.75, '#ff7a59');
  grad.addColorStop(1, '#ff4d7e');
  ctx.font = anton(capSize);
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const ly = topY + lineH * (i + 0.5);
    ctx.strokeStyle = '#2a0e2e';
    ctx.lineWidth = capSize * 0.16;
    ctx.shadowColor = 'rgba(20,0,24,0.6)';
    ctx.shadowBlur = unit * 0.012;
    ctx.shadowOffsetY = unit * 0.006;
    ctx.strokeText(line, cx, ly);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(line, cx, ly);
  });

  if (state.subtitle) {
    const sSize = fitFont(ctx, state.subtitle, (s) => `${s}px Pacifico, cursive`, unit * 0.062, maxW, 12);
    ctx.font = `${sSize}px Pacifico, cursive`;
    ctx.save();
    ctx.translate(cx, topY + blockH + sSize * 0.72);
    ctx.rotate(-0.045);
    ctx.shadowColor = '#ff71ce';
    ctx.shadowBlur = unit * 0.02;
    ctx.fillStyle = '#ffd7f2';
    ctx.fillText(state.subtitle, 0, 0);
    ctx.shadowBlur = unit * 0.006;
    ctx.fillStyle = '#ff71ce';
    ctx.fillText(state.subtitle, 0, 0);
    ctx.restore();
  }
}

// A rotated sticker ribbon in the top-right corner carrying the badge text.
function paintBadge(ctx, state, w, h) {
  if (!state.badge) return;
  const unit = Math.min(w, h);
  const fontSize = Math.max(12, unit * 0.028);
  ctx.font = `${fontSize}px Anton, sans-serif`;
  const tw = ctx.measureText(state.badge.toUpperCase()).width;
  const bw = tw + fontSize * 1.6, bh = fontSize * 1.9;
  ctx.save();
  ctx.translate(w - bw * 0.52, bh * 0.72);
  ctx.rotate(0.1);
  ctx.shadowColor = 'rgba(10,0,16,0.5)';
  ctx.shadowBlur = unit * 0.01;
  ctx.fillStyle = '#ffcf3f';
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh * 0.28);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#33131f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.badge.toUpperCase(), 0, fontSize * 0.05);
  ctx.restore();
}

// Paint the whole cover onto ctx at w × h. Used for the live preview and for PNG export.
export function drawCover(ctx, w, h, state) {
  const layout = layoutById(state.layout);
  const grade = gradeById(state.grade);
  const rects = layout.rects().map((r) => ({ x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h }));

  ctx.fillStyle = '#150a24';
  ctx.fillRect(0, 0, w, h);

  // Photos first, each pre-tinted with the grade's saturation / contrast push.
  ctx.save();
  try { ctx.filter = `saturate(${grade.sat}) contrast(${grade.con})`; } catch { /* no filter */ }
  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? { photo: -1, zoom: 1, fx: 0, fy: 0 };
    const photo = state.photos[panel.photo];
    if (photo?.img) paintPhoto(ctx, photo.img, rect, panel, state, w, h);
  });
  ctx.restore();
  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? { photo: -1 };
    if (!state.photos[panel.photo]?.img) paintPlaceholder(ctx, rect, i);
  });

  // The colour grade over the photography (lettering and frame stay crisp on top).
  if (grade.mix > 0) applyGrade(ctx, w, h, grade);

  if (state.vignette) {
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(10,0,18,0)');
    v.addColorStop(1, 'rgba(10,0,18,0.34)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    const tile = getNoiseTile();
    for (let x = 0; x < w; x += tile.width) for (let y = 0; y < h; y += tile.height) ctx.drawImage(tile, x, y);
    ctx.restore();
  }

  // White poster framing: panel gutters, then the outer frame.
  const gutter = Math.max(3, w * 0.007);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = gutter;
  for (const rect of rects) ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  const frameW = Math.max(6, w * 0.013);
  ctx.lineWidth = frameW;
  ctx.strokeRect(frameW / 2, frameW / 2, w - frameW, h - frameW);

  // The title area: its own dark panel, or a scrim band over the art.
  const t = layout.title;
  const box = { x: t.x * w, y: t.y * h, w: t.w * w, h: t.h * h };
  if (t.kind === 'panel') {
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, '#1c0b31');
    g.addColorStop(0.7, '#33134d');
    g.addColorStop(1, '#4a1458');
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = gutter;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  } else {
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, 'rgba(16,4,26,0)');
    g.addColorStop(0.3, 'rgba(16,4,26,0.55)');
    g.addColorStop(0.75, 'rgba(16,4,26,0.78)');
    g.addColorStop(1, 'rgba(16,4,26,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  paintLettering(ctx, state, box, w, h);
  paintBadge(ctx, state, w, h);
}

// Render the cover at the chosen post size and hand back a PNG blob (the app's real export).
export function exportCoverPNG(state) {
  const size = sizeById(state.size);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  drawCover(canvas.getContext('2d'), size.w, size.h, state);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
