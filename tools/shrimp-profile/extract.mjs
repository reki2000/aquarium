// Extract a lateral body profile + "unrolled" side texture from a side-view shrimp photo.
//
//   node tools/shrimp-profile/extract.mjs [--debug <dir>]
//
// Outputs:
//   src/entities/shrimp/cherryProfile.json   centerline / height samples along the body (normalized to body length)
//   public/assets/shrimp/cherry-side.png     side texture resampled into (s, t) space: s = along body, t = dorsal..ventral
//
// Source: assets-src/shrimp/Neocaridina_heteropoda_female.png (Pedro Doria Meunier, public domain, Wikimedia Commons)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SRC = 'assets-src/shrimp/Neocaridina_heteropoda_female.png';
// Region containing the shrimp (px). Keeps pebbles and plants elsewhere in the frame out of the mask.
const ROI = { x0: 330, x1: 1500, y0: 470, y1: 790 };
// Opening radius (px): removes legs and antennae (≈3–8px thick) but keeps the body (≥ 100px tall).
const OPEN_R = 9;
const SAMPLES = 96;
const TEX_W = 1024;
const TEX_H = 256;

const args = process.argv.slice(2);
const debugDir = args.includes('--debug') ? args[args.indexOf('--debug') + 1] : null;

const img = PNG.sync.read(readFileSync(SRC));
const { width: W, height: H, data } = img;
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

// 1. Color segmentation: saturated red/orange pixels inside the ROI.
const mask = new Uint8Array(W * H);
for (let y = ROI.y0; y < ROI.y1; y++) {
  for (let x = ROI.x0; x < ROI.x1; x++) {
    const [r, g, b] = px(x, y);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (r === max && r > 110 && sat > 0.42 && r > g * 1.45 && r > b * 1.6) mask[y * W + x] = 1;
  }
}

// 2. Morphology helpers (square structuring element, separable).
function morph(src, r, isDilate) {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  const pick = isDilate ? (a, b) => a | b : (a, b) => a & b;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = isDilate ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        v = pick(v, xx >= 0 && xx < W ? src[y * W + xx] : 0);
      }
      tmp[y * W + x] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = isDilate ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        v = pick(v, yy >= 0 && yy < H ? tmp[yy * W + x] : 0);
      }
      out[y * W + x] = v;
    }
  }
  return out;
}
// Close small gaps (speckled pigment, specular glints), then open to strip thin appendages.
let body = morph(morph(mask, 4, true), 4, false);
body = morph(morph(body, OPEN_R, false), OPEN_R, true);

// 3. Keep the largest connected component.
const label = new Int32Array(W * H);
let best = 0;
let bestSize = 0;
let next = 1;
for (let i = 0; i < W * H; i++) {
  if (!body[i] || label[i]) continue;
  const stack = [i];
  label[i] = next;
  let size = 0;
  while (stack.length) {
    const j = stack.pop();
    size++;
    const x = j % W;
    const y = (j / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const k = yy * W + xx;
      if (body[k] && !label[k]) {
        label[k] = next;
        stack.push(k);
      }
    }
  }
  if (size > bestSize) {
    bestSize = size;
    best = next;
  }
  next++;
}
for (let i = 0; i < W * H; i++) body[i] = label[i] === best ? 1 : 0;

// 4. Per-column dorsal / ventral extents.
const cols = [];
for (let x = 0; x < W; x++) {
  let top = -1;
  let bot = -1;
  for (let y = 0; y < H; y++) {
    if (body[y * W + x]) {
      if (top < 0) top = y;
      bot = y;
    }
  }
  if (top >= 0 && bot - top > 6) cols.push({ x, top, bot });
}
const colAt = new Map(cols.map((c) => [c.x, c]));
const xFront = cols[0].x;
const xBack = cols[cols.length - 1].x;
const lengthPx = xBack - xFront;
console.log(`body columns ${xFront}..${xBack} (${lengthPx}px), component ${bestSize}px`);

// Smooth + resample: s = 0 front of carapace → 1 tip of telson (x increases towards the tail).
// Gaussian-weighted over ±SMOOTH_PX: the dorsal edge is ragged where specular highlights fail the color test.
const SMOOTH_PX = 22;
const at = (x) => {
  let top = 0;
  let bot = 0;
  let wsum = 0;
  for (const c of cols) {
    const d = c.x - x;
    if (Math.abs(d) > SMOOTH_PX * 2) continue;
    const w = Math.exp(-(d * d) / (2 * SMOOTH_PX * SMOOTH_PX));
    top += c.top * w;
    bot += c.bot * w;
    wsum += w;
  }
  return { top: top / wsum, bot: bot / wsum };
};
const samples = [];
for (let i = 0; i < SAMPLES; i++) {
  const s = i / (SAMPLES - 1);
  const x = xFront + s * lengthPx;
  const { top, bot } = at(x);
  samples.push({ s, x, top, bot, c: (top + bot) / 2, h: bot - top });
}
// Correct heights for the slope of the centerline (a tilted tube looks taller in a column).
for (let i = 0; i < SAMPLES; i++) {
  const a = samples[Math.max(0, i - 2)];
  const b = samples[Math.min(SAMPLES - 1, i + 2)];
  const slope = (b.c - a.c) / (b.x - a.x);
  samples[i].hTrue = samples[i].h * Math.cos(Math.atan(slope));
}

// Normalize by body length. y is up (image y down), relative to the centerline at s = 0.
const c0 = samples[0].c;
const profile = {
  source: 'Neocaridina heteropoda female — Pedro Doria Meunier, public domain (Wikimedia Commons)',
  note: 'Lateral profile of the shell without appendages. Units: fraction of body length (carapace front → telson tip). y up.',
  samples: samples.map((p) => ({
    s: +p.s.toFixed(4),
    center: +(-(p.c - c0) / lengthPx).toFixed(5),
    height: +(p.hTrue / lengthPx).toFixed(5),
  })),
};
writeFileSync('src/entities/shrimp/cherryProfile.json', `${JSON.stringify(profile, null, 1)}\n`);

// 5. Unrolled side texture: column = s, row = t (0 dorsal → 1 ventral), sampling the photo along the body.
const tex = new PNG({ width: TEX_W, height: TEX_H });
const bilinear = (fx, fy) => {
  const x = Math.min(W - 2, Math.max(0, fx));
  const y = Math.min(H - 2, Math.max(0, fy));
  const x0 = x | 0;
  const y0 = y | 0;
  const tx = x - x0;
  const ty = y - y0;
  const out = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const p = px(x0 + dx, y0 + dy);
    for (let k = 0; k < 3; k++) out[k] += p[k] * w;
  }
  return out;
};
for (let u = 0; u < TEX_W; u++) {
  const s = u / (TEX_W - 1);
  const f = s * (SAMPLES - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(SAMPLES - 1, i0 + 1);
  const k = f - i0;
  const top = samples[i0].top * (1 - k) + samples[i1].top * k;
  const bot = samples[i0].bot * (1 - k) + samples[i1].bot * k;
  const x = xFront + s * lengthPx;
  // Mean shell color of this column: fallback for samples that fall outside the mask (background).
  const xi = Math.round(x);
  const mean = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
    if (!mask[y * W + xi]) continue;
    const p = px(xi, y);
    for (let k = 0; k < 3; k++) mean[k] += p[k];
    n++;
  }
  for (let k = 0; k < 3; k++) mean[k] = n ? mean[k] / n : 128;
  for (let v = 0; v < TEX_H; v++) {
    const t = v / (TEX_H - 1);
    // Pull 4% inside the silhouette so background never bleeds into the texture edge.
    const y = top + (bot - top) * (0.04 + 0.92 * t);
    // Inside the (unsmoothed) silhouette of this column → real pixels, including dark organs.
    const col = colAt.get(xi);
    const inside = col && y >= col.top + 2 && y <= col.bot - 2;
    const [r, g, b] = inside ? bilinear(x, y) : mean;
    const o = (v * TEX_W + u) * 4;
    tex.data[o] = r;
    tex.data[o + 1] = g;
    tex.data[o + 2] = b;
    tex.data[o + 3] = 255;
  }
}
mkdirSync('public/assets/shrimp', { recursive: true });
writeFileSync('public/assets/shrimp/cherry-side.png', PNG.sync.write(tex));

if (debugDir) {
  mkdirSync(debugDir, { recursive: true });
  const dbg = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    dbg.data[i * 4] = body[i] ? 255 : r * 0.35;
    dbg.data[i * 4 + 1] = mask[i] && !body[i] ? 200 : g * 0.35;
    dbg.data[i * 4 + 2] = b * 0.35;
    dbg.data[i * 4 + 3] = 255;
  }
  for (const p of samples) {
    for (const y of [p.top, p.bot, p.c]) {
      const i = (Math.round(y) * W + Math.round(p.x)) * 4;
      dbg.data[i] = 255;
      dbg.data[i + 1] = 255;
      dbg.data[i + 2] = 0;
    }
  }
  writeFileSync(`${debugDir}/mask.png`, PNG.sync.write(dbg));
  console.log(`debug → ${debugDir}/mask.png`);
}
console.log('wrote src/entities/shrimp/cherryProfile.json, public/assets/shrimp/cherry-side.png');
