import {
  ABDOMEN_SEGMENTS, ANTENNA_SEGMENTS, ANTENNULE_SEGMENTS, JointSet, LEG_PAIRS, PLEOPOD_PAIRS, SIDES, jointName,
} from './joints';
import { clamp, smoothstep } from '../../util/noise';

export interface LocomotionState {
  /** Ground speed (m/s). */
  speed: number;
  /** Yaw rate (rad/s), positive = turning left. */
  turnRate: number;
  /** 0..1 blend towards swimming posture. */
  swim: number;
  /** 0..1 blend towards grazing (chelipeds picking at the substrate). */
  graze: number;
}

const TAU = Math.PI * 2;

/** Procedural animation: tripod-ish wave gait, cheliped picking, metachronal pleopod beat, antenna sway. */
export class ShrimpRig {
  private t: number;
  private gait = 0;
  private pleo = 0;
  private smoothTurn = 0;

  constructor(private joints: JointSet, private seed: number, private scale = 1) {
    this.t = seed * 10;
  }

  update(dt: number, s: LocomotionState) {
    const j = this.joints;
    this.t += dt;
    const t = this.t;
    const stride = 0.0032 * this.scale;
    const walk = clamp(s.speed / 0.004, 0, 1) * (1 - s.swim);
    this.gait += (s.speed / stride) * TAU * dt * (1 - s.swim);
    this.smoothTurn += (s.turnRate - this.smoothTurn) * Math.min(1, dt * 4);
    // Pleopods fan gently all the time; beat hard while swimming.
    const pleoFreq = 2.2 + 8.5 * s.swim;
    this.pleo += pleoFreq * TAU * dt;

    // Body: nose dips while grazing, slight lateral rock while walking.
    j.set(jointName.body, s.graze * 0.12 - s.swim * 0.05, 0, Math.sin(this.gait) * 0.025 * walk);

    // Abdomen: breathing, swim undulation, slight curl while grazing.
    for (let i = 1; i <= ABDOMEN_SEGMENTS; i++) {
      const breathe = Math.sin(t * 1.4 + i * 0.5) * 0.012;
      const undulate = Math.sin(this.pleo * 0.25 - i * 0.6) * 0.05 * s.swim;
      j.set(jointName.abdomen(i), breathe + undulate + s.graze * 0.025, this.smoothTurn * -0.015 * i);
    }
    j.set(jointName.telson, Math.sin(t * 0.9 + this.seed) * 0.05 - s.swim * 0.1);

    for (const side of SIDES) {
      const sx = side === 'L' ? 1 : -1;
      const anti = side === 'L' ? 0 : Math.PI;

      // Antennae: continuous exploratory sweeps, lagging outward on turns, streaming back when swimming.
      for (let i = 1; i <= ANTENNA_SEGMENTS; i++) {
        const w = i / ANTENNA_SEGMENTS;
        const yaw =
          sx * (0.14 * Math.sin(t * 1.6 + i * 0.8 + this.seed + anti * 0.3) + 0.22 * s.swim * w) - this.smoothTurn * 0.06 * i;
        const pitch = 0.1 * Math.sin(t * 1.15 + i * 0.7 + this.seed * 2 + anti) + 0.05 * s.graze + 0.12 * s.swim * w;
        j.set(jointName.antenna(side, i), pitch, yaw);
      }
      for (let i = 1; i <= ANTENNULE_SEGMENTS; i++) {
        const flick = Math.pow(Math.max(0, Math.sin(t * 3.3 + this.seed + anti)), 6);
        j.set(jointName.antennule(side, i), -0.25 * flick + 0.05 * Math.sin(t * 5 + i), sx * 0.08 * Math.sin(t * 2.1 + i));
      }

      for (let pair = 1; pair <= LEG_PAIRS; pair++) {
        if (pair <= 2) {
          // Search with all four chelipeds even while walking; feed more actively when grazing.
          const reach = 0.5 + 0.5 * Math.sin(t * 3.3 + anti + pair * 1.3 + this.seed);
          const g = (0.35 + 0.65 * s.graze) * (1 - s.swim);
          j.set(jointName.leg(pair, side, 1), g * (0.12 + 0.65 * reach) - s.swim * 0.5, sx * g * 0.18 * Math.sin(t * 1.7 + pair + this.seed));
          j.set(jointName.leg(pair, side, 2), -g * 0.95 * reach);
          j.set(jointName.leg(pair, side, 3), g * 0.45 * (1 - reach));
          continue;
        }
        // Keep the foot's lateral position fixed: lift by bending both joints,
        // carry the folded leg forward, then extend it for the planted stroke.
        const phase = ((this.gait + pair * 2.1 + anti) % TAU) / TAU;
        const stance = 0.65;
        let sweep: number;
        let fold = 0;
        if (phase < stance) {
          sweep = 0.3 * (1 - 2 * phase / stance);
        } else {
          const swing = (phase - stance) / (1 - stance);
          fold = smoothstep(0, 0.2, swing) * (1 - smoothstep(0.75, 1, swing));
          sweep = -0.3 + 0.6 * smoothstep(0.2, 0.75, swing);
        }
        fold *= walk;
        const tuck = s.swim;
        if (tuck < 0.001 && j.setLegFoot(pair, side, 0.0015 * fold, 0.001 * sweep / 0.3 * walk)) continue;
        // Models without optional foot markers retain the joint-angle fallback.
        j.set(jointName.leg(pair, side, 1), 0, -sx * sweep * walk + sx * 0.7 * tuck, sx * (0.1 * fold + 0.45 * tuck));
        j.set(jointName.leg(pair, side, 2), 0, 0, sx * (-0.7 * fold + 0.4 * tuck));
        j.set(jointName.leg(pair, side, 3), 0, 0, sx * 0.4 * fold);
      }

      for (let pair = 1; pair <= PLEOPOD_PAIRS; pair++) {
        const amp = 0.18 + 0.45 * s.swim;
        j.set(jointName.pleopod(pair, side), amp * Math.sin(this.pleo - pair * 0.9));
      }
    }
  }
}
