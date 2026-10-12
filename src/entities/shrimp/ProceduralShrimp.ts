import * as THREE from 'three/webgpu';
import {
  ABDOMEN_SEGMENTS, ANTENNA_SEGMENTS, ANTENNULE_SEGMENTS, LEG_PAIRS, LEG_SEGMENTS, PLEOPOD_PAIRS, SIDES, jointName,
} from './joints';
import { getShrimpMaterials, type ShrimpColorVariant, type ShrimpMaterials } from './shrimpMaterials';
import { S, bodyHeight, bodyPoint, centerline, loftShell } from './shrimpBody';

/**
 * Neocaridina (cherry shrimp) built from a photo-derived lofted shell (shrimpBody.ts) split into
 * rigid plates — arthropod exoskeletons are rigid, so a joint hierarchy without skinning is
 * anatomically reasonable — plus procedural appendages. Replaced by a glTF model when present.
 */

type Role = keyof ShrimpMaterials;

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
/** Unit tapered limb along +Z from 0 to 1, radius 1 → 0.7 distally. */
const limbGeo = (() => {
  const g = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  return g;
})();

const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

function mesh(geo: THREE.BufferGeometry, role: Role, mats: ShrimpMaterials) {
  const m = new THREE.Mesh(geo, mats[role]);
  m.userData.role = role;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function ellipsoid(parent: THREE.Object3D, role: Role, mats: ShrimpMaterials, r: [number, number, number], c: THREE.Vector3Like) {
  const m = mesh(sphereGeo, role, mats);
  m.scale.set(...r);
  m.position.copy(c);
  parent.add(m);
  return m;
}

function limb(parent: THREE.Object3D, role: Role, mats: ShrimpMaterials, radius: number, length: number) {
  const m = mesh(limbGeo, role, mats);
  m.scale.set(radius, radius, length);
  parent.add(m);
  return m;
}

export interface ShrimpRigTemplate {
  root: THREE.Object3D;
  /** Name → node lookup for JointSet. */
  resolve: (name: string) => THREE.Object3D | undefined;
}

/** Shell geometry is identical for every individual; build once. */
let shellCache: { carapace: THREE.BufferGeometry; abdomen: THREE.BufferGeometry[]; telson: THREE.BufferGeometry } | null = null;
function shellGeometries() {
  if (shellCache) return shellCache;
  const bodyPivot = centerline(S.pivot);
  const carapace = loftShell(0, S.carapaceEnd + 0.012, bodyPivot, 1, 1.025, { front: true, back: false });
  const abdomen: THREE.BufferGeometry[] = [];
  for (let i = 0; i < ABDOMEN_SEGMENTS; i++) {
    const s0 = S.abdomen[i];
    const s1 = S.abdomen[i + 1];
    // Each plate starts slightly inside the previous one and flares at its rear edge.
    abdomen.push(loftShell(s0 - 0.012, s1 + 0.01, centerline(s0), 0.975, 1.025));
  }
  const telson = loftShell(S.abdomen[ABDOMEN_SEGMENTS] - 0.01, S.telsonEnd, centerline(S.abdomen[ABDOMEN_SEGMENTS]), 0.95, 1, { front: false, back: true });
  shellCache = { carapace, abdomen, telson };
  return shellCache;
}

export function buildProceduralShrimp(variant: ShrimpColorVariant): ShrimpRigTemplate {
  const mats = getShrimpMaterials(variant);
  const shells = shellGeometries();
  const root = new THREE.Group();
  root.name = 'shrimp';
  const joints = new Map<string, THREE.Object3D>();
  /** Rest-pose shrimp-space position of every joint (the root sits at the origin, unrotated). */
  const restPos = new Map<THREE.Object3D, THREE.Vector3>([[root, new THREE.Vector3()]]);

  /** Add a joint at shrimp-space point `at`; converted into the (possibly rotated) parent's frame. */
  const addJoint = (name: string, parent: THREE.Object3D, at: THREE.Vector3) => {
    const j = new THREE.Object3D();
    j.name = name;
    root.updateMatrixWorld(true);
    j.position.copy(parent.worldToLocal(at.clone()));
    parent.add(j);
    joints.set(name, j);
    restPos.set(j, at.clone());
    return j;
  };

  /** Orient a freshly added joint so its +Z points along `dir` (expressed in shrimp space). */
  const aim = (j: THREE.Object3D, dir: THREE.Vector3) => {
    root.updateMatrixWorld(true);
    j.parent!.getWorldQuaternion(_pq);
    _q.setFromUnitVectors(Z, dir.clone().normalize());
    j.quaternion.copy(_pq.invert().multiply(_q));
  };

  // --- Cephalothorax (includes rostrum) -----------------------------------------------
  const body = addJoint(jointName.body, root, centerline(S.pivot));
  body.add(mesh(shells.carapace, 'shell', mats));
  for (const s of SIDES) {
    const sx = s === 'L' ? 1 : -1;
    const eye = bodyPoint(S.eye, 0.35, sx * 0.9).sub(restPos.get(body)!);
    ellipsoid(body, 'eye', mats, [0.0007, 0.0007, 0.0007], eye);
  }

  // --- Abdomen chain: rigid plates pivoting at their front edge ------------------------------
  let parent: THREE.Object3D = body;
  for (let i = 1; i <= ABDOMEN_SEGMENTS; i++) {
    const j = addJoint(jointName.abdomen(i), parent, centerline(S.abdomen[i - 1]));
    j.add(mesh(shells.abdomen[i - 1], 'shell', mats));
    parent = j;
  }
  const telson = addJoint(jointName.telson, parent, centerline(S.abdomen[ABDOMEN_SEGMENTS]));
  telson.add(mesh(shells.telson, 'shell', mats));
  // Uropods: thin translucent paddles fanning out from the base of the telson.
  const tailBase = centerline(S.abdomen[ABDOMEN_SEGMENTS] + 0.02).sub(restPos.get(telson)!);
  for (const yaw of [-0.5, -0.22, 0.22, 0.5]) {
    const pivot = new THREE.Object3D();
    pivot.position.copy(tailBase);
    pivot.rotation.set(0.12, yaw, 0);
    telson.add(pivot);
    ellipsoid(pivot, 'fan', mats, [0.001, 0.00008, 0.0022], { x: 0, y: 0, z: -0.002 });
  }

  // --- Antennae & antennules --------------------------------------------------------------
  for (const s of SIDES) {
    const sx = s === 'L' ? 1 : -1;
    const antLen = [0.004, 0.0058, 0.0068, 0.0072];
    let p: THREE.Object3D = body;
    let at = bodyPoint(S.antennaBase, 0.6, sx * 0.6);
    for (let i = 1; i <= ANTENNA_SEGMENTS; i++) {
      const j = addJoint(jointName.antenna(s, i), p, at);
      const yaw = sx * (0.35 + 0.42 * (i - 1));
      const pitch = -0.42 + 0.2 * (i - 1);
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      aim(j, dir);
      limb(j, 'appendage', mats, 0.00012 * (1 - (i - 1) * 0.2), antLen[i - 1]);
      p = j;
      at = at.clone().addScaledVector(dir, antLen[i - 1]);
    }
    p = body;
    at = bodyPoint(S.antennaBase - 0.01, 0.4, sx * 0.4);
    for (let i = 1; i <= ANTENNULE_SEGMENTS; i++) {
      const j = addJoint(jointName.antennule(s, i), p, at);
      const yaw = sx * (0.22 + 0.25 * (i - 1));
      const dir = new THREE.Vector3(Math.sin(yaw), 0.35, Math.cos(yaw)).normalize();
      aim(j, dir);
      limb(j, 'appendage', mats, 0.00013, 0.0022);
      p = j;
      at = at.clone().addScaledVector(dir, 0.0022);
    }
  }

  // --- Pereiopods: pairs 1–2 are small chelipeds, 3–5 walking legs ---------------------------
  // Cluster roots along the lower flanks of the head/thorax, behind the mouth.
  // The upper segment opens outward; the longer lower segment folds toward the substrate.
  const legS = [0.22, 0.255, 0.29, 0.33, 0.365];
  const splay = [1.1, 0.75, 0.35, -0.15, -0.55];
  const baseLen = [
    [0.0019, 0.0016, 0.0007],
    [0.0021, 0.0018, 0.0008],
    [0.0023, 0.003, 0.0009],
    [0.0025, 0.0032, 0.0009],
    [0.0025, 0.0032, 0.0009],
  ];
  const segRad = [0.0002, 0.00016, 0.0001];
  for (let pair = 1; pair <= LEG_PAIRS; pair++) {
    for (const s of SIDES) {
      const sx = s === 'L' ? 1 : -1;
      const f = splay[pair - 1];
      const cheliped = pair <= 2;
      const dirs = (
        cheliped
          ? [new THREE.Vector3(sx * 0.65, -0.15, 1.0), new THREE.Vector3(sx * 0.15, -0.85, 0.45), new THREE.Vector3(sx * 0.05, -0.3, 1.0)]
          : [new THREE.Vector3(sx * 1.0, 0.08, f), new THREE.Vector3(sx * 0.12, -1.0, f * 0.5), new THREE.Vector3(-sx * 0.2, -0.9, f * 0.25)]
      ).map((d) => d.normalize());
      const start = bodyPoint(legS[pair - 1], 0.78, sx * 0.9);
      let lens = baseLen[pair - 1].map((len) => len * (cheliped ? 1.2 : 1));
      if (!cheliped) {
        // Scale so the tip lands just below y = 0 (pressed into the substrate slightly).
        const drop = lens.reduce((acc, len, i) => acc - dirs[i].y * len, 0);
        const k = (start.y + 0.0002) / drop;
        lens = lens.map((len) => len * k);
      }
      let p: THREE.Object3D = body;
      let at = start;
      for (let i = 1; i <= LEG_SEGMENTS; i++) {
        const j = addJoint(jointName.leg(pair, s, i), p, at);
        aim(j, dirs[i - 1]);
        const len = lens[i - 1];
        limb(j, 'appendage', mats, segRad[i - 1] * (cheliped && i === 3 ? 1.6 : 1), len);
        p = j;
        at = at.clone().addScaledVector(dirs[i - 1], len);
      }
      if (!cheliped) addJoint(jointName.legTip(pair, s), p, at);
    }
  }

  // --- Pleopods (swimmerets) under abdominal segments 1–5 --------------------------------------
  for (let pair = 1; pair <= PLEOPOD_PAIRS; pair++) {
    const seg = joints.get(jointName.abdomen(pair))!;
    const sMid = (S.abdomen[pair - 1] + S.abdomen[pair]) / 2;
    for (const s of SIDES) {
      const sx = s === 'L' ? 1 : -1;
      const j = addJoint(jointName.pleopod(pair, s), seg, bodyPoint(sMid, 0.9, sx * 0.35));
      aim(j, new THREE.Vector3(sx * 0.25, -1, -0.45));
      const len = Math.min(0.0014, bodyHeight(sMid) * 0.35);
      ellipsoid(j, 'fan', mats, [0.00034, 0.00006, len], { x: 0, y: 0, z: len * 0.9 });
    }
  }

  return { root, resolve: (name) => joints.get(name) };
}

/** Clone a template for another individual, swapping materials to its own color variant. */
export function cloneShrimp(template: ShrimpRigTemplate, variant: ShrimpColorVariant): ShrimpRigTemplate {
  const root = template.root.clone(true);
  const mats = getShrimpMaterials(variant);
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name, o);
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.role) m.material = mats[m.userData.role as Role];
  });
  return { root, resolve: (name) => byName.get(name) };
}
