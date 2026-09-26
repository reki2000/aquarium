import * as THREE from 'three/webgpu';
import {
  dot, float, mix, mx_fractal_noise_float, normalView, positionLocal, positionViewDirection, pow, smoothstep, texture,
  uniform, uv, vec3,
} from 'three/tsl';

export interface ShrimpColorVariant {
  /** 0 = pale "sakura" grade .. 1 = solid "fire red" grade (the reference photo). */
  grade: number;
}

export interface ShrimpMaterials {
  shell: THREE.MeshSSSNodeMaterial | THREE.MeshBasicNodeMaterial;
  appendage: THREE.MeshSSSNodeMaterial;
  fan: THREE.MeshSSSNodeMaterial;
  eye: THREE.MeshPhysicalNodeMaterial;
}

/** Unrolled side photo (tools/shrimp-profile/extract.mjs), addressed by uv = (s along body, dorsal → ventral). */
let sideTexture: THREE.Texture | null = null;
function getSideTexture() {
  if (!sideTexture) {
    sideTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/shrimp/cherry-side.png`);
    sideTexture.colorSpace = THREE.SRGBColorSpace;
    sideTexture.anisotropy = 4;
  }
  return sideTexture;
}

const cache = new Map<string, ShrimpMaterials>();

/** Materials are shared per color grade bucket to keep pipeline count low. */
export function getShrimpMaterials(variant: ShrimpColorVariant): ShrimpMaterials {
  const bucket = Math.round(variant.grade * 4) / 4;
  const key = `${bucket}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const grade = uniform(bucket);
  const fresnel = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.0);

  // Photo albedo. The photo was lit brightly from above; scale it down to a plausible shell albedo
  // but keep its local contrast (chromatophore speckles, stomach, ovary).
  const photo = texture(getSideTexture(), uv()).rgb;
  const luma = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  const albedo = photo.mul(0.8);
  // Lower grades: pigment thins out into a translucent, faintly red shell.
  const pale = mix(vec3(0.42, 0.2, 0.15).mul(luma.mul(1.5).add(0.3)), albedo, 0.35);
  const shellColor = mix(pale, albedo, grade.mul(0.75).add(0.25)).mul(float(1).sub(fresnel.mul(0.3)));

  const shell = new THREE.MeshSSSNodeMaterial({ roughness: 0.45, metalness: 0 });
  shell.colorNode = shellColor;
  shell.clearcoat = 0.35;
  shell.clearcoatRoughness = 0.3;
  // Transmitted light takes the local pigment color so it does not wash out the photo detail.
  shell.thicknessColorNode = shellColor.mul(1.4);
  shell.thicknessDistortionNode = float(0.15);
  shell.thicknessAmbientNode = float(0.02);
  shell.thicknessAttenuationNode = float(0.6);
  shell.thicknessPowerNode = float(3.0);
  shell.thicknessScaleNode = float(6.0);

  // Legs and antennae are thinner → paler and more translucent, with faint banding.
  const red = vec3(0.5, 0.012, 0.008);
  const appendage = new THREE.MeshSSSNodeMaterial({ roughness: 0.45, metalness: 0 });
  const band = smoothstep(0.3, 0.7, mx_fractal_noise_float(positionLocal.mul(vec3(1, 1, 3)), 2, 2, 0.5).mul(0.5).add(0.5));
  appendage.colorNode = mix(vec3(0.45, 0.14, 0.1), red, band.mul(grade.mul(0.6).add(0.3)));
  appendage.thicknessColorNode = vec3(0.9, 0.3, 0.2);
  appendage.thicknessScaleNode = float(8.0);
  appendage.thicknessPowerNode = float(2.0);

  // Uropods / pleopods: thin membranes, mostly translucent.
  const fan = appendage.clone() as THREE.MeshSSSNodeMaterial;
  fan.colorNode = mix(vec3(0.5, 0.18, 0.13), red, grade.mul(0.5));
  fan.transparent = true;
  fan.opacity = 0.85;
  fan.side = THREE.DoubleSide;

  const eye = new THREE.MeshPhysicalNodeMaterial({ color: 0x050302, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });

  // ?shrimpDebug=albedo shows the unlit photo texture on the shell (checks the uv mapping).
  let shellOut: ShrimpMaterials['shell'] = shell;
  if (new URLSearchParams(location.search).get('shrimpDebug') === 'albedo') {
    shellOut = new THREE.MeshBasicNodeMaterial();
    shellOut.colorNode = photo;
    shellOut.fog = false;
  }

  const mats = { shell: shellOut, appendage, fan, eye };
  cache.set(key, mats);
  return mats;
}
