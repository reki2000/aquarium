import { Euler, Object3D, Quaternion } from 'three/webgpu';

/**
 * Joint naming contract shared by the procedural placeholder and user-supplied glTF
 * models (see docs/shrimp-model-spec.md). Shrimp space: +Z forward (head), +Y up, +X left.
 */
export const SIDES = ['L', 'R'] as const;
export type Side = (typeof SIDES)[number];

export const ABDOMEN_SEGMENTS = 6;
export const ANTENNA_SEGMENTS = 4;
export const ANTENNULE_SEGMENTS = 2;
export const LEG_PAIRS = 5;
export const LEG_SEGMENTS = 3;
export const PLEOPOD_PAIRS = 5;

export const jointName = {
  body: 'body',
  abdomen: (i: number) => `abdomen_${i}`,
  telson: 'telson',
  antenna: (s: Side, i: number) => `antenna_${s}_${i}`,
  antennule: (s: Side, i: number) => `antennule_${s}_${i}`,
  leg: (pair: number, s: Side, i: number) => `leg_${pair}_${s}_${i}`,
  pleopod: (pair: number, s: Side) => `pleopod_${pair}_${s}`,
};

export function allJointNames(): string[] {
  const names: string[] = [jointName.body, jointName.telson];
  for (let i = 1; i <= ABDOMEN_SEGMENTS; i++) names.push(jointName.abdomen(i));
  for (const s of SIDES) {
    for (let i = 1; i <= ANTENNA_SEGMENTS; i++) names.push(jointName.antenna(s, i));
    for (let i = 1; i <= ANTENNULE_SEGMENTS; i++) names.push(jointName.antennule(s, i));
    for (let p = 1; p <= LEG_PAIRS; p++) for (let i = 1; i <= LEG_SEGMENTS; i++) names.push(jointName.leg(p, s, i));
    for (let p = 1; p <= PLEOPOD_PAIRS; p++) names.push(jointName.pleopod(p, s));
  }
  return names;
}

interface JointState {
  node: Object3D;
  restLocal: Quaternion;
  /** Rest orientation relative to the shrimp root, used to express deltas in shrimp space. */
  restRoot: Quaternion;
  restRootInv: Quaternion;
}

const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');

/**
 * Applies pose deltas expressed in shrimp space (pitch about X, yaw about Y, roll about Z),
 * independent of how the model author oriented or rolled each bone.
 */
export class JointSet {
  private joints = new Map<string, JointState>();

  constructor(root: Object3D, resolve: (name: string) => Object3D | undefined) {
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new Quaternion()).invert();
    for (const name of allJointNames()) {
      const node = resolve(name);
      if (!node) continue;
      const restRoot = rootInv.clone().multiply(node.getWorldQuaternion(new Quaternion()));
      this.joints.set(name, {
        node,
        restLocal: node.quaternion.clone(),
        restRoot,
        restRootInv: restRoot.clone().invert(),
      });
    }
  }

  has(name: string) {
    return this.joints.has(name);
  }

  get size() {
    return this.joints.size;
  }

  /** Set the joint's rotation relative to rest, given in shrimp-space Euler angles (radians). */
  set(name: string, pitch: number, yaw = 0, roll = 0) {
    const j = this.joints.get(name);
    if (!j) return;
    _q.setFromEuler(_e.set(pitch, yaw, roll));
    // local delta = restRoot^-1 * delta * restRoot, applied after the rest local rotation.
    j.node.quaternion.copy(j.restRootInv).multiply(_q).multiply(j.restRoot);
    j.node.quaternion.premultiply(j.restLocal);
  }
}
