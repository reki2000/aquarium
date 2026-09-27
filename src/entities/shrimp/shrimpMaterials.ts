import * as THREE from 'three/webgpu';
import {
  dot, float, mix, mx_fractal_noise_float, mx_worley_noise_float, normalView, positionLocal, positionViewDirection, pow, smoothstep, texture,
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

/** Global look controls (debug GUI): 1 = defaults. */
export const shrimpLook = {
  /** Scales transmission and the Beer–Lambert distance: higher = glassier. */
  clarity: uniform(1),
  /** Scales chromatophore coverage: higher = redder, more opaque pigment. */
  pigment: uniform(1),
};

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

  // Real cherry shrimp are glassy: pigment sits in discrete chromatophores over clear tissue.
  // three.js tints transmitted light by the base color (glTF transmission), so the base color is
  // the photo only where pigment is dense and a faint clear pink elsewhere; the overall red cast
  // comes from Beer–Lambert attenuation through the body. Thickness follows the view angle so the
  // silhouette edges are the most see-through.
  const facing = normalView.dot(positionViewDirection).abs();
  // Dark red speckles in the photo = dense chromatophores (luma is linear: the body's orange-red is ≈ 0.2).
  // Individual chromatophores (~0.2–0.4mm) are finer than the photo resolves: add them procedurally
  // in (s, t) space (s spans ~26mm, t the ~8mm half-perimeter).
  const cell = mx_worley_noise_float(vec3(uv().x.mul(90), uv().y.mul(28), 0.5));
  const dots = smoothstep(0.42, 0.12, cell);
  const pigment = smoothstep(0.2, 0.05, luma).max(dots.mul(grade.mul(0.7).add(0.3))).mul(shrimpLook.pigment).clamp(0, 1);
  // Higher grades: pigment fills in between the dots.
  const cover = pigment.max(grade.mul(0.55).mul(shrimpLook.pigment)).clamp(0, 1);
  const clearTint = vec3(0.95, 0.8, 0.75);
  const shellColor = mix(clearTint, albedo, cover).mul(float(1).sub(fresnel.mul(0.2)));
  const clearness = mix(float(0.93), float(0.8), grade); // low grades are mostly clear
  const shell = new THREE.MeshSSSNodeMaterial({ roughness: 0.18, metalness: 0 });
  shell.colorNode = shellColor;
  shell.transmissionNode = clearness.mul(float(1).sub(pigment.mul(0.5))).mul(shrimpLook.clarity).clamp(0, 1);
  shell.thicknessNode = float(0.0045).mul(facing.mul(0.85).add(0.15));
  shell.attenuationColorNode = mix(vec3(0.95, 0.5, 0.4), vec3(0.92, 0.22, 0.16), grade);
  shell.attenuationDistanceNode = float(0.004).mul(shrimpLook.clarity);
  shell.iorNode = float(1.12); // chitin/tissue relative to the surrounding water
  shell.clearcoat = 0.5;
  shell.clearcoatRoughness = 0.15;
  // Light scattered inside the body picks up the photo's pigment color (organs, ovary).
  shell.thicknessColorNode = albedo;
  shell.thicknessDistortionNode = float(0.15);
  shell.thicknessAmbientNode = float(0.02);
  shell.thicknessAttenuationNode = float(0.6);
  shell.thicknessPowerNode = float(3.0);
  shell.thicknessScaleNode = float(1.0);

  // Legs and antennae: nearly clear with red bands of chromatophores.
  const red = vec3(0.5, 0.012, 0.008);
  const appendage = new THREE.MeshSSSNodeMaterial({ roughness: 0.35, metalness: 0 });
  const band = smoothstep(0.3, 0.7, mx_fractal_noise_float(positionLocal.mul(vec3(1, 1, 3)), 2, 2, 0.5).mul(0.5).add(0.5));
  const bandPigment = band.mul(grade.mul(0.6).add(0.3));
  appendage.colorNode = mix(vec3(0.95, 0.8, 0.75), red, bandPigment);
  appendage.transmissionNode = float(0.95).sub(bandPigment.mul(0.4));
  appendage.thicknessNode = float(0.0004);
  appendage.attenuationColorNode = vec3(0.95, 0.5, 0.4);
  appendage.attenuationDistanceNode = float(0.004);
  appendage.iorNode = float(1.12);
  appendage.thicknessColorNode = vec3(0.9, 0.3, 0.2);
  appendage.thicknessScaleNode = float(1.5);
  appendage.thicknessPowerNode = float(2.0);

  // Uropods / pleopods: thin clear membranes with a faint red cast.
  const fan = appendage.clone() as THREE.MeshSSSNodeMaterial;
  fan.colorNode = mix(vec3(0.95, 0.78, 0.72), red, grade.mul(0.3));
  fan.transmissionNode = float(0.92).sub(grade.mul(0.2));
  fan.thicknessNode = float(0.00015);
  fan.side = THREE.DoubleSide;

  const eye = new THREE.MeshPhysicalNodeMaterial({ color: 0x050302, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });

  // ?shrimpDebug=albedo shows the unlit photo texture on the shell (checks the uv mapping).
  let shellOut: ShrimpMaterials['shell'] = shell;
  const debugMode = new URLSearchParams(location.search).get('shrimpDebug');
  if (debugMode === 'glass') {
    // Fully clear shell: verifies the transmission path renders what is behind the body.
    const glass = new THREE.MeshSSSNodeMaterial({ roughness: 0.05, metalness: 0, color: 0xffffff });
    glass.transmissionNode = float(1);
    glass.thicknessNode = float(0.0001);
    shellOut = glass;
  }
  if (debugMode === 'albedo') {
    shellOut = new THREE.MeshBasicNodeMaterial();
    shellOut.colorNode = photo;
    shellOut.fog = false;
  }

  const mats = { shell: shellOut, appendage, fan, eye };
  cache.set(key, mats);
  return mats;
}
