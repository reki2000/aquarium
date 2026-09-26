import * as THREE from 'three/webgpu';
import {
  ABDOMEN_SEGMENTS, ANTENNA_SEGMENTS, ANTENNULE_SEGMENTS, LEG_PAIRS, LEG_SEGMENTS, PLEOPOD_PAIRS, SIDES, type Side,
  jointName,
} from './joints';
import { getShrimpMaterials, type ShrimpColorVariant, type ShrimpMaterials } from './shrimpMaterials';

/**
 * Placeholder Neocaridina (cherry shrimp) built from rigid segments — arthropod
 * exoskeletons are rigid plates, so a joint hierarchy without skinning is anatomically
 * reasonable. Real-world size: ~22mm body length. Replaced by a glTF model when present.
 */

type Role = keyof ShrimpMaterials;

const sphereGeo = new THREE.SphereGeometry(1, 28, 18);
/** Unit tapered limb along +Z from 0 to 1, radius 1 → 0.7 distally. */
const limbGeo = (() => {
  const g = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  return g;
})();
const coneGeo = (() => {
  const g = new THREE.ConeGeometry(1, 1, 8, 1);
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

function ellipsoid(parent: THREE.Object3D, role: Role, mats: ShrimpMaterials, r: [number, number, number], c: [number, number, number]) {
  const m = mesh(sphereGeo, role, mats);
  m.scale.set(...r);
  m.position.set(...c);
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

export function buildProceduralShrimp(variant: ShrimpColorVariant): ShrimpRigTemplate {
  const mats = getShrimpMaterials(variant);
  const root = new THREE.Group();
  root.name = 'shrimp';
  const joints = new Map<string, THREE.Object3D>();

  const addJoint = (name: string, parent: THREE.Object3D, pos: [number, number, number]) => {
    const j = new THREE.Object3D();
    j.name = name;
    j.position.set(...pos);
    parent.add(j);
    joints.set(name, j);
    return j;
  };

  /** Orient a freshly added joint so its +Z points along `dir` (expressed in shrimp space). */
  const aim = (j: THREE.Object3D, dir: THREE.Vector3) => {
    root.updateMatrixWorld(true);
    j.parent!.getWorldQuaternion(_pq);
    _q.setFromUnitVectors(Z, dir.clone().normalize());
    j.quaternion.copy(_pq.invert().multiply(_q));
  };

  // --- Cephalothorax -------------------------------------------------------
  const body = addJoint(jointName.body, root, [0, 0.0028, 0]);
  ellipsoid(body, 'shell', mats, [0.0021, 0.0023, 0.0052], [0, 0.0024, 0.0034]);
  ellipsoid(body, 'shell', mats, [0.0017, 0.0012, 0.004], [0, 0.0008, 0.0036]); // ventral branchial region
  const rostrum = mesh(coneGeo, 'shell', mats);
  rostrum.scale.set(0.00032, 0.00045, 0.0034);
  rostrum.position.set(0, 0.0034, 0.0078);
  rostrum.rotation.x = -0.18;
  body.add(rostrum);
  for (const s of SIDES) {
    const sx = s === 'L' ? 1 : -1;
    const stalk = limb(body, 'appendage', mats, 0.00028, 0.0008);
    stalk.position.set(sx * 0.0009, 0.003, 0.0079);
    stalk.quaternion.setFromUnitVectors(Z, new THREE.Vector3(sx * 0.8, 0.15, 0.6).normalize());
    ellipsoid(body, 'eye', mats, [0.00062, 0.00062, 0.00062], [sx * 0.0015, 0.0031, 0.0084]);
  }

  // --- Abdomen chain --------------------------------------------------------
  const lengths = [0.0027, 0.0026, 0.0025, 0.0022, 0.002, 0.0027];
  const radii = [0.0021, 0.0021, 0.0019, 0.0016, 0.0013, 0.001];
  const restPitch = [0.1, 0.12, -0.3, -0.24, -0.16, -0.08];
  let parent: THREE.Object3D = body;
  let pos: [number, number, number] = [0, 0.0028, -0.0014];
  for (let i = 1; i <= ABDOMEN_SEGMENTS; i++) {
    const L = lengths[i - 1];
    const r = radii[i - 1];
    const j = addJoint(jointName.abdomen(i), parent, pos);
    j.rotation.x = restPitch[i - 1];
    // Second pleuron overlaps the first and third in Caridea → slightly larger plate.
    const plate = i === 2 ? 1.12 : 1;
    ellipsoid(j, i === 1 && variant.saddle ? 'saddle' : 'shell', mats, [r * 0.92 * plate, r * plate, L * 0.7], [0, -0.0001, -L * 0.5]);
    parent = j;
    pos = [0, 0, -L];
  }
  const telson = addJoint(jointName.telson, parent, pos);
  telson.rotation.x = 0.06;
  ellipsoid(telson, 'fan', mats, [0.00055, 0.00022, 0.0025], [0, 0, -0.0022]);
  for (const yaw of [-0.55, -0.26, 0.26, 0.55]) {
    const pivot = new THREE.Object3D();
    pivot.rotation.y = yaw;
    telson.add(pivot);
    ellipsoid(pivot, 'fan', mats, [0.0009, 0.00008, 0.0023], [0, 0, -0.0021]);
  }

  // --- Antennae & antennules --------------------------------------------------
  for (const s of SIDES) {
    const sx = s === 'L' ? 1 : -1;
    const antLen = [0.004, 0.0058, 0.0068, 0.0072];
    let p: THREE.Object3D = body;
    let at: [number, number, number] = [sx * 0.0008, 0.0027, 0.0086];
    for (let i = 1; i <= ANTENNA_SEGMENTS; i++) {
      const j = addJoint(jointName.antenna(s, i), p, at);
      const yaw = sx * (0.35 + 0.42 * (i - 1));
      const pitch = -0.42 + 0.2 * (i - 1);
      aim(j, new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)));
      limb(j, 'appendage', mats, 0.00012 * (1 - (i - 1) * 0.2), antLen[i - 1]);
      p = j;
      at = [0, 0, antLen[i - 1]];
    }
    p = body;
    at = [sx * 0.00045, 0.0031, 0.0088];
    for (let i = 1; i <= ANTENNULE_SEGMENTS; i++) {
      const j = addJoint(jointName.antennule(s, i), p, at);
      const yaw = sx * (0.22 + 0.25 * (i - 1));
      aim(j, new THREE.Vector3(Math.sin(yaw), 0.35, Math.cos(yaw)));
      limb(j, 'appendage', mats, 0.00013, 0.0022);
      p = j;
      at = [0, 0, 0.0022];
    }
  }

  // --- Pereiopods: pairs 1–2 are small chelipeds, 3–5 walking legs --------------
  const legZ = [0.0068, 0.0056, 0.0043, 0.003, 0.0017];
  const splay = [1.1, 0.75, 0.35, -0.15, -0.55];
  const segLen = [
    [0.0019, 0.0016, 0.0007],
    [0.0021, 0.0018, 0.0008],
    [0.0031, 0.0019, 0.0008],
    [0.0033, 0.002, 0.0008],
    [0.0033, 0.002, 0.0008],
  ];
  const segRad = [0.0002, 0.00016, 0.0001];
  for (let pair = 1; pair <= LEG_PAIRS; pair++) {
    for (const s of SIDES) {
      const sx = s === 'L' ? 1 : -1;
      const f = splay[pair - 1];
      const cheliped = pair <= 2;
      const dirs = cheliped
        ? [new THREE.Vector3(sx * 0.55, -0.75, 1.0), new THREE.Vector3(sx * 0.1, -0.7, 0.9), new THREE.Vector3(sx * 0.05, -0.3, 1.0)]
        : [new THREE.Vector3(sx * 1.0, -0.55, f), new THREE.Vector3(sx * 0.35, -1.0, f * 0.5), new THREE.Vector3(sx * 0.1, -1.0, f * 0.25)];
      let p: THREE.Object3D = body;
      let at: [number, number, number] = [sx * 0.0011, 0.0005, legZ[pair - 1]];
      for (let i = 1; i <= LEG_SEGMENTS; i++) {
        const j = addJoint(jointName.leg(pair, s, i), p, at);
        aim(j, dirs[i - 1]);
        const L = segLen[pair - 1][i - 1];
        limb(j, 'appendage', mats, segRad[i - 1] * (cheliped && i === 3 ? 1.6 : 1), L);
        p = j;
        at = [0, 0, L];
      }
    }
  }

  // --- Pleopods (swimmerets) under abdominal segments 1–5 ----------------------
  for (let pair = 1; pair <= PLEOPOD_PAIRS; pair++) {
    const seg = joints.get(jointName.abdomen(pair))!;
    for (const s of SIDES as readonly Side[]) {
      const sx = s === 'L' ? 1 : -1;
      const j = addJoint(jointName.pleopod(pair, s), seg, [sx * 0.0006, -radii[pair - 1] * 0.75, -lengths[pair - 1] * 0.45]);
      aim(j, new THREE.Vector3(sx * 0.25, -1, -0.45));
      ellipsoid(j, 'fan', mats, [0.00034, 0.00006, 0.0011], [0, 0, 0.001]);
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
  // The saddle only exists on some females; recolor segment 1 accordingly.
  const seg1 = byName.get(jointName.abdomen(1));
  seg1?.children.forEach((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && (m.userData.role === 'shell' || m.userData.role === 'saddle')) {
      m.userData.role = variant.saddle ? 'saddle' : 'shell';
      m.material = mats[m.userData.role as Role];
    }
  });
  return { root, resolve: (name) => byName.get(name) };
}
