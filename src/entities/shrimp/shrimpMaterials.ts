import * as THREE from 'three/webgpu';
import {
  float, mix, mx_fractal_noise_float, mx_worley_noise_float, normalView, positionLocal, positionViewDirection,
  pow, smoothstep, uniform, vec3,
} from 'three/tsl';

export interface ShrimpColorVariant {
  /** 0 = pale "sakura" grade .. 1 = solid "fire red" grade. */
  grade: number;
  /** Yellow-green ovary saddle behind the carapace (mature females). */
  saddle: boolean;
}

export interface ShrimpMaterials {
  shell: THREE.MeshSSSNodeMaterial;
  saddle: THREE.MeshSSSNodeMaterial;
  appendage: THREE.MeshSSSNodeMaterial;
  fan: THREE.MeshSSSNodeMaterial;
  eye: THREE.MeshPhysicalNodeMaterial;
}

const cache = new Map<string, ShrimpMaterials>();

/** Materials are shared per color grade bucket to keep pipeline count low. */
export function getShrimpMaterials(variant: ShrimpColorVariant): ShrimpMaterials {
  const key = `${Math.round(variant.grade * 4)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const grade = uniform(Math.round(variant.grade * 4) / 4);
  const fresnel = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.0);

  // Chromatophores: dense small red dots over a translucent base; grade fills the gaps.
  const dots = float(1).sub(smoothstep(0.08, 0.32, mx_worley_noise_float(positionLocal.mul(9.0))));
  const blotch = mx_fractal_noise_float(positionLocal.mul(2.2), 3, 2, 0.5).mul(0.5).add(0.5);
  const pigment = dots.max(grade.mul(0.55).add(blotch.mul(0.35)).mul(grade.add(0.35))).clamp(0, 1);

  // Linear-space colors. Even low grades are a reddish translucent, never salmon-grey.
  const clear = vec3(0.42, 0.1, 0.07);
  const red = vec3(0.5, 0.012, 0.008);
  const deep = vec3(0.22, 0.004, 0.004);
  const shellColor = mix(clear, mix(red, deep, dots.mul(0.6)), pigment).mul(float(1).sub(fresnel.mul(0.35)));

  const shell = new THREE.MeshSSSNodeMaterial({ roughness: 0.38, metalness: 0 });
  shell.colorNode = shellColor;
  shell.clearcoat = 0.7;
  shell.clearcoatRoughness = 0.22;
  shell.thicknessColorNode = vec3(0.9, 0.18, 0.1);
  shell.thicknessDistortionNode = float(0.15);
  shell.thicknessAmbientNode = float(0.02);
  shell.thicknessAttenuationNode = float(0.6);
  shell.thicknessPowerNode = float(3.0);
  shell.thicknessScaleNode = float(6.0);

  const saddle = shell.clone() as THREE.MeshSSSNodeMaterial;
  saddle.colorNode = mix(shellColor, vec3(0.38, 0.36, 0.06), smoothstep(-0.2, 0.6, positionLocal.y));

  // Legs and antennae are thinner → paler and more translucent, with faint banding.
  const appendage = new THREE.MeshSSSNodeMaterial({ roughness: 0.45, metalness: 0 });
  const band = smoothstep(0.3, 0.7, mx_fractal_noise_float(positionLocal.mul(vec3(1, 1, 3)), 2, 2, 0.5).mul(0.5).add(0.5));
  appendage.colorNode = mix(vec3(0.45, 0.14, 0.1), red, band.mul(grade.mul(0.6).add(0.3)));
  appendage.thicknessColorNode = vec3(0.9, 0.3, 0.2);
  appendage.thicknessScaleNode = float(8.0);
  appendage.thicknessPowerNode = float(2.0);

  // Uropods / telson fan: thin membranes, mostly translucent.
  const fan = appendage.clone() as THREE.MeshSSSNodeMaterial;
  fan.colorNode = mix(vec3(0.5, 0.18, 0.13), red, grade.mul(0.5));
  fan.transparent = true;
  fan.opacity = 0.85;
  fan.side = THREE.DoubleSide;

  const eye = new THREE.MeshPhysicalNodeMaterial({ color: 0x050302, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });

  const mats = { shell, saddle, appendage, fan, eye };
  cache.set(key, mats);
  return mats;
}
