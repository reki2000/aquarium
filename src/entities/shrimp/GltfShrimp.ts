import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { allJointNames, jointName, LEG_PAIRS, SIDES } from './joints';
import type { ShrimpRigTemplate } from './ProceduralShrimp';

/** Drop a model here (see docs/shrimp-model-spec.md) and it replaces the placeholder. */
export const SHRIMP_MODEL_URL = `${import.meta.env.BASE_URL}assets/shrimp/cherry.glb`;
const TARGET_BODY_LENGTH = 0.022;

export async function tryLoadGltfShrimp(url = SHRIMP_MODEL_URL): Promise<ShrimpRigTemplate | null> {
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  // Vite's dev server answers unknown paths with index.html, so check the content type too.
  if (!head?.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return null;

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  // Normalize: body length (excluding long antennae is up to the author) → 22mm, feet on y = 0.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = TARGET_BODY_LENGTH / Math.max(size.z, 1e-6);
  const root = new THREE.Group();
  root.name = 'shrimp';
  model.scale.setScalar(s);
  model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  root.add(model);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    }
  });

  const names = new Set(allJointNames());
  for (const side of SIDES) {
    for (let pair = 3; pair <= LEG_PAIRS; pair++) names.add(jointName.legTip(pair, side));
  }
  const found = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    if (names.has(o.name)) found.set(o.name, o);
  });
  if (found.size === 0) console.warn(`[shrimp] ${url} has no joints matching the naming spec; it will not animate.`);
  return { root, resolve: (n) => found.get(n) };
}

export function cloneGltfShrimp(template: ShrimpRigTemplate): ShrimpRigTemplate {
  const root = SkeletonUtils.clone(template.root);
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name, o);
  });
  return { root, resolve: (n) => byName.get(n) };
}
