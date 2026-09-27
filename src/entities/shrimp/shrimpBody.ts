import * as THREE from 'three/webgpu';
import profileData from './cherryProfile.json';

/**
 * Body shape of Neocaridina davidi reconstructed from a lateral photo
 * (tools/shrimp-profile/extract.mjs). s runs 0 (rostrum tip) → 1 (telson tip).
 */

/** Rostrum tip → telson tip for a scale-1 (adult female) shrimp, meters. */
export const BODY_LENGTH = 0.026;

/** Segment boundaries in s, read off the reference photo. */
export const S = {
  eye: 0.118,
  antennaBase: 0.13,
  carapaceEnd: 0.38,
  abdomen: [0.38, 0.47, 0.57, 0.66, 0.72, 0.78, 0.89] as const, // 6 segments
  telsonEnd: 1.0,
  /** Where the cephalothorax pivot sits (roughly the animal's center of mass). */
  pivot: 0.3,
};

/** Walking legs lift the carapace underside this far above the ground (fraction of length, from the photo). */
const CLEARANCE = 0.127;

const samples = profileData.samples;

function sampleProfile(s: number) {
  const f = THREE.MathUtils.clamp(s, 0, 1) * (samples.length - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(samples.length - 1, i0 + 1);
  const k = f - i0;
  return {
    center: samples[i0].center * (1 - k) + samples[i1].center * k,
    height: samples[i0].height * (1 - k) + samples[i1].height * k,
  };
}

/** Width / height of the cross-section along the body (from dorsal reference photos). */
function widthRatio(s: number) {
  const table: [number, number][] = [
    [0, 0.35], // laterally compressed rostrum
    [0.12, 0.6],
    [0.2, 0.85],
    [0.38, 0.82],
    [0.6, 0.72],
    [0.85, 0.62],
    [0.9, 1.3], // telson is flat
    [1, 1.6],
  ];
  for (let i = 1; i < table.length; i++) {
    if (s <= table[i][0]) {
      const [s0, w0] = table[i - 1];
      const [s1, w1] = table[i];
      return w0 + ((w1 - w0) * (s - s0)) / (s1 - s0);
    }
  }
  return table[table.length - 1][1];
}

const ventralAt = (s: number) => {
  const p = sampleProfile(s);
  return p.center - p.height / 2;
};
// Lift so the carapace underside (lowest point between s = 0.2 and 0.36) clears the ground by CLEARANCE.
const lift = (() => {
  let lo = Infinity;
  for (let s = 0.2; s <= 0.36; s += 0.01) lo = Math.min(lo, ventralAt(s));
  return CLEARANCE - lo;
})();

/** Rest-pose point on the body surface in shrimp space (+Z forward, +Y up), meters. t: 0 dorsal → 1 ventral. */
export function bodyPoint(s: number, t: number, side = 0, target = new THREE.Vector3()) {
  const p = sampleProfile(s);
  const y = (p.center + lift + (0.5 - t) * p.height) * BODY_LENGTH;
  const halfW = (widthRatio(s) * p.height * BODY_LENGTH) / 2;
  // Superellipse lateral extent at this height.
  const v = Math.abs(1 - 2 * t);
  const x = side * halfW * Math.pow(Math.max(0, 1 - Math.pow(v, 2.4)), 1 / 2.4);
  return target.set(x, y, (S.pivot - s) * BODY_LENGTH);
}

export function centerline(s: number, target = new THREE.Vector3()) {
  return bodyPoint(s, 0.5, 0, target);
}

export function bodyHeight(s: number) {
  return sampleProfile(s).height * BODY_LENGTH;
}

/**
 * Lofted shell piece from s0 to s1 around a superellipse cross-section, positioned relative to `pivot`.
 * `growFront` / `growBack` scale the section at each end so consecutive plates overlap like armor.
 * uv = (s, 1 - t) addresses the unrolled side texture.
 */
export function loftShell(
  s0: number,
  s1: number,
  pivot: THREE.Vector3,
  growFront = 1,
  growBack = 1,
  caps: { front: boolean; back: boolean } = { front: false, back: false },
  radial = 28,
) {
  const n = 2.4;
  const ringCount = Math.max(6, Math.ceil((s1 - s0) * 160));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Vector3();
  for (let r = 0; r <= ringCount; r++) {
    const u = r / ringCount;
    const s = s0 + (s1 - s0) * u;
    const grow = growFront + (growBack - growFront) * u;
    const p = sampleProfile(s);
    centerline(s, c);
    const b = (p.height * BODY_LENGTH * grow) / 2;
    const a = b * widthRatio(s);
    for (let k = 0; k < radial; k++) {
      const phi = (k / radial) * Math.PI * 2; // 0 = dorsal
      const sn = Math.sin(phi);
      const cs = Math.cos(phi);
      const x = a * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      const y = b * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n);
      pos.push(c.x + x - pivot.x, c.y + y - pivot.y, c.z - pivot.z);
      const t = THREE.MathUtils.clamp(0.5 - y / (2 * b), 0, 1);
      uv.push(s, 1 - t);
    }
  }
  for (let r = 0; r < ringCount; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * radial + k;
      const b = r * radial + ((k + 1) % radial);
      const cc = a + radial;
      const d = b + radial;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  // Cap only the outer tips (rostrum / telson): internal caps would show through the translucent shell.
  const capRings: [number, boolean][] = [];
  if (caps.front) capRings.push([0, true]);
  if (caps.back) capRings.push([ringCount, false]);
  for (const [ring, flip] of capRings) {
    const s = s0 + ((s1 - s0) * ring) / ringCount;
    centerline(s, c);
    const ci = pos.length / 3;
    pos.push(c.x - pivot.x, c.y - pivot.y, c.z - pivot.z);
    uv.push(s, 0.5);
    for (let k = 0; k < radial; k++) {
      const a = ring * radial + k;
      const b = ring * radial + ((k + 1) % radial);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
