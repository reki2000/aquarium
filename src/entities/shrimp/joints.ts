import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from 'three/webgpu';

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
  legTip: (pair: number, s: Side) => `leg_${pair}_${s}_tip`,
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

interface LegState {
  upper: JointState;
  lower: JointState;
  upperVector: Vector3;
  lowerVector: Vector3;
  foot: Vector3;
  parentRestRootInv: Quaternion;
}

const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _target = new Vector3();
const _axis = new Vector3();
const _bend = new Vector3();
const _upper = new Vector3();
const _lower = new Vector3();
const _knee = new Vector3();
const _origin = new Vector3();
const _upperRotation = new Quaternion();
const _lowerRotation = new Quaternion();
const _parentRotation = new Quaternion();
const _parentInverse = new Quaternion();

/**
 * Applies pose deltas expressed in shrimp space (pitch about X, yaw about Y, roll about Z),
 * independent of how the model author oriented or rolled each bone.
 */
export class JointSet {
  private joints = new Map<string, JointState>();
  private legs = new Map<string, LegState>();

  constructor(private root: Object3D, resolve: (name: string) => Object3D | undefined) {
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
    for (let pair = 3; pair <= LEG_PAIRS; pair++) {
      for (const side of SIDES) {
        const upper = this.joints.get(jointName.leg(pair, side, 1));
        const lower = this.joints.get(jointName.leg(pair, side, 2));
        const tip = resolve(jointName.legTip(pair, side));
        if (!upper || !lower || !tip) continue;
        const origin = root.worldToLocal(upper.node.getWorldPosition(new Vector3()));
        const knee = root.worldToLocal(lower.node.getWorldPosition(new Vector3()));
        const foot = root.worldToLocal(tip.getWorldPosition(new Vector3()));
        this.legs.set(jointName.legTip(pair, side), {
          upper, lower, foot,
          upperVector: knee.clone().sub(origin),
          lowerVector: foot.clone().sub(knee),
          parentRestRootInv: rootInv.clone().multiply(upper.node.parent!.getWorldQuaternion(new Quaternion())).invert(),
        });
      }
    }
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

  /** Bend both joints to reach a foot target with the resting lateral coordinate. */
  setLegFoot(pair: number, side: Side, lift: number, forward: number): boolean {
    const leg = this.legs.get(jointName.legTip(pair, side));
    if (!leg) return false;
    const upperLength = leg.upperVector.length();
    const lowerLength = leg.lowerVector.length();
    if (upperLength < 1e-8 || lowerLength < 1e-8) return false;

    _target.copy(leg.foot);
    _target.y += lift;
    _target.z += forward;
    this.root.worldToLocal(leg.upper.node.getWorldPosition(_origin));
    this.root.getWorldQuaternion(_parentRotation).invert();
    _parentRotation.multiply(leg.upper.node.parent!.getWorldQuaternion(_parentInverse)).multiply(leg.parentRestRootInv);
    _parentInverse.copy(_parentRotation).invert();
    _axis.copy(_target).sub(_origin);
    const distance = _axis.length();
    if (distance < 1e-8) return false;
    _axis.divideScalar(distance);
    // Keep targets reachable while allowing both segments to bend naturally.
    const reach = MathUtils.clamp(distance, Math.abs(upperLength - lowerLength) + 1e-8, upperLength + lowerLength - 1e-8);
    _target.copy(_origin).addScaledVector(_axis, reach);
    const along = (upperLength * upperLength + reach * reach - lowerLength * lowerLength) / (2 * reach);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    _bend.copy(leg.upperVector).applyQuaternion(_parentRotation);
    _bend.addScaledVector(_axis, -_bend.dot(_axis)).normalize();
    _knee.copy(_origin).addScaledVector(_axis, along).addScaledVector(_bend, height);
    _upper.copy(_knee).sub(_origin).normalize().applyQuaternion(_parentInverse);
    _upperRotation.setFromUnitVectors(_bend.copy(leg.upperVector).normalize(), _upper);
    _lower.copy(_target).sub(_knee).normalize().applyQuaternion(_parentInverse)
      .applyQuaternion(_lowerRotation.copy(_upperRotation).invert());
    _lowerRotation.setFromUnitVectors(_bend.copy(leg.lowerVector).normalize(), _lower);

    leg.upper.node.quaternion.copy(leg.upper.restRootInv).multiply(_upperRotation).multiply(leg.upper.restRoot).premultiply(leg.upper.restLocal);
    leg.lower.node.quaternion.copy(leg.lower.restRootInv).multiply(_lowerRotation).multiply(leg.lower.restRoot).premultiply(leg.lower.restLocal);
    this.set(jointName.leg(pair, side, 3), 0);
    return true;
  }
}
