import * as THREE from 'three/webgpu';
import {
  abs, bumpMap, float, mix, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_vec2,
  positionLocal, positionWorld, pow, smoothstep, uv, vec2, vec3,
} from 'three/tsl';

/** Aqua soil: ~2.5mm rounded granules, dark brown with per-granule tone variation. */
export function createSubstrateMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const p = positionWorld.mul(330);
  const w = mx_worley_noise_vec2(p, 0.9);
  // Rounded pellets: dome from distance-to-center (F1), dark gaps where cells meet (F2 - F1 → 0).
  const dome = float(1).sub(w.x.mul(1.1).clamp(0, 1).pow(2));
  const gap = smoothstep(0.02, 0.3, w.y.sub(w.x));
  const granule = dome.mul(gap);
  const cellTone = mx_fractal_noise_float(p.mul(0.7), 2, 2, 0.5).mul(0.5).add(0.5);
  const patch = mx_fractal_noise_float(positionWorld.mul(9), 3, 2, 0.5).mul(0.5).add(0.5);
  const dark = vec3(0.06, 0.04, 0.023);
  const light = vec3(0.19, 0.135, 0.072);
  const base = mix(dark, light, cellTone.mul(0.55).add(patch.mul(0.45)));
  m.colorNode = base.mul(gap.mul(0.75).add(0.25)).mul(dome.mul(0.3).add(0.7));
  m.roughnessNode = float(0.95).sub(granule.mul(0.2));
  m.normalNode = bumpMap(granule, float(1.6));
  return m;
}

/** Seiryu-style stone: blue-grey with white calcite veins. */
export function createRockMaterial(seed = 0) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 });
  // positionLocal is in meters (size is baked into the geometry): stones are ~3–9cm.
  const p = positionLocal.add(seed * 13.37);
  const mottling = mx_fractal_noise_float(p.mul(40), 4, 2, 0.5).mul(0.5).add(0.5);
  const warp = mx_noise_float(p.mul(30)).mul(0.25);
  const veinField = abs(mx_noise_float(p.mul(vec3(60, 140, 60)).add(warp)));
  const veins = pow(float(1).sub(veinField), 36);
  const base = mix(vec3(0.065, 0.068, 0.065), vec3(0.17, 0.18, 0.17), mottling);
  m.colorNode = mix(base, vec3(0.3, 0.3, 0.29), veins.mul(0.7));
  const bump = mx_fractal_noise_float(p.mul(260), 3, 2, 0.5).mul(0.5).add(0.5);
  m.normalNode = bumpMap(bump, float(0.08));
  m.roughnessNode = float(0.85).sub(veins.mul(0.2));
  return m;
}

/** Waterlogged driftwood: dark brown, longitudinal grain streaks, slightly slick. */
export function createWoodMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
  const st = uv().mul(vec2(60, 4));
  const grain = mx_fractal_noise_float(vec3(st.x, st.y.mul(8), 0), 4, 2, 0.55).mul(0.5).add(0.5);
  const streak = pow(abs(mx_noise_float(vec3(st.x.mul(0.3), st.y.mul(10), 1.7))), 0.5);
  const base = mix(vec3(0.04, 0.023, 0.014), vec3(0.15, 0.087, 0.042), grain.mul(0.7).add(streak.mul(0.3)));
  m.colorNode = base;
  m.normalNode = bumpMap(grain.add(streak), float(0.25));
  m.roughnessNode = float(0.7).sub(grain.mul(0.25));
  return m;
}
