import * as THREE from 'three/webgpu';
import {
  Fn, abs, bumpMap, cameraPosition, cos, exp, float, length, max, min, mix, mx_fractal_noise_float,
  output, positionWorld, pow, sin, time, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { WATER_BOX } from '../config';

/** Live-tunable water optics (bound to the debug GUI). */
export const waterParams = {
  /** Beer–Lambert absorption per meter (r, g, b). Red dies first → green/teal cast. */
  absorption: uniform(new THREE.Vector3(2.2, 0.55, 0.75)),
  /** In-scattered light color (tint of suspended matter). */
  scatterColor: uniform(new THREE.Color(0.03, 0.07, 0.065)),
  scatterDensity: uniform(1.8),
  causticStrength: uniform(1.0),
  causticScale: uniform(3.2),
  causticSpeed: uniform(0.55),
};

/**
 * Scene-wide fog node: attenuates each fragment by the length of the camera ray
 * segment that lies inside the water box (slab test), so objects behind the tank
 * are also correctly tinted through the water.
 */
export const underwaterFog = Fn(() => {
  const bmin = vec3(...WATER_BOX.min);
  const bmax = vec3(...WATER_BOX.max);
  const toFrag = positionWorld.sub(cameraPosition);
  const len = length(toFrag);
  const rd = toFrag.div(len);
  // Avoid division by zero on axis-aligned rays.
  const safeRd = rd.add(vec3(1e-6));
  const t0 = bmin.sub(cameraPosition).div(safeRd);
  const t1 = bmax.sub(cameraPosition).div(safeRd);
  const tSmall = min(t0, t1);
  const tLarge = max(t0, t1);
  const tEnter = max(max(max(tSmall.x, tSmall.y), tSmall.z), 0);
  const tExit = min(min(min(tLarge.x, tLarge.y), tLarge.z), len);
  const dist = max(tExit.sub(tEnter), 0);

  const transmittance = exp(waterParams.absorption.negate().mul(dist));
  const inScatter = waterParams.scatterColor.mul(float(1).sub(exp(waterParams.scatterDensity.negate().mul(dist))));
  return vec4(output.rgb.mul(transmittance).add(inScatter), output.a);
});

/**
 * Tileable animated caustic intensity (after the well-known "tileable water caustic"
 * iteration by joltz0r / Dave_Hoskins). Returns roughly 0..1.5 with sharp bright webs.
 */
const causticPattern = Fn(([uvIn, t]: [any, any]) => {
  const TAU = 6.28318530718;
  const p = uvIn.mul(TAU).mod(TAU).sub(250.0).toVar();
  const i = vec2(p).toVar();
  const c = float(1).toVar();
  const inten = 0.005;
  for (let n = 0; n < 5; n++) {
    const tt = t.mul(1 - 3.5 / (n + 1));
    i.assign(p.add(vec2(cos(tt.sub(i.x)).add(sin(tt.add(i.y))), sin(tt.sub(i.y)).add(cos(tt.add(i.x))))));
    c.addAssign(float(1).div(length(vec2(p.x.div(sin(i.x.add(tt)).div(inten)), p.y.div(cos(i.y.add(tt)).div(inten))))));
  }
  c.divAssign(5);
  c.assign(float(1.17).sub(pow(c, 1.4)));
  return pow(abs(c), 8.0);
});

/**
 * Projected light color for the top spot light (SpotLight.colorNode). Slight RGB
 * offsets fake the dispersion visible in real aquarium caustics.
 */
export const causticLightColor = Fn(([lightCoord]: [any]) => {
  const uv = lightCoord.xy.mul(waterParams.causticScale);
  const t = time.mul(waterParams.causticSpeed);
  const r = causticPattern(uv.add(vec2(0.0035, 0)), t);
  const g = causticPattern(uv, t);
  const b = causticPattern(uv.sub(vec2(0.0035, 0)), t);
  const caustic = vec3(r, g, b);
  // Keep a diffuse floor so the light does not become a pure web pattern.
  const lit = caustic.mul(2.4).add(0.45);
  return mix(vec3(1), lit, waterParams.causticStrength);
});

/**
 * Specular-only overlay for thin dielectric sheets (glass panes, water surface):
 * rgb adds reflection, alpha slightly darkens what is behind. Avoids transmission
 * passes so every layer stays visible through every other layer.
 */
export function createReflectiveOverlayMaterial(opts: { roughness: number; darken: number }) {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: 0x000000,
    roughness: opts.roughness,
    metalness: 0,
    transparent: true,
    opacity: opts.darken,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.fog = false;
  return m;
}

export function createWaterSurfaceMaterial() {
  const m = createReflectiveOverlayMaterial({ roughness: 0.02, darken: 0.06 });
  m.ior = 1.333;
  const p = positionWorld.xz.mul(38);
  const wave = mx_fractal_noise_float(vec3(p.x, p.y, time.mul(0.35)), 3, 2.0, 0.5);
  m.normalNode = bumpMap(wave, float(0.012));
  return m;
}

export function createGlassMaterial() {
  const m = createReflectiveOverlayMaterial({ roughness: 0.015, darken: 0.035 });
  m.ior = 1.52;
  return m;
}

/** Glass edges seen end-on read as bright green lines — a strong realism cue. */
export function createGlassEdgeMaterial() {
  return new THREE.MeshPhysicalNodeMaterial({
    color: 0x4f8f6a,
    roughness: 0.05,
    transparent: true,
    opacity: 0.55,
    metalness: 0,
  });
}
