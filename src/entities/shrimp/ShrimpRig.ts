import {
  ABDOMEN_SEGMENTS, ANTENNA_SEGMENTS, ANTENNULE_SEGMENTS, JointSet, LEG_PAIRS, PLEOPOD_PAIRS, SIDES, jointName,
} from './joints';
import { clamp } from '../../util/noise';

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
    const walk = clamp(s.speed / 0.008, 0, 1) * (1 - s.swim);
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
          // Chelipeds: alternating rapid picking (~1.2 Hz per claw) while grazing, held forward otherwise.
          const pick = 0.5 + 0.5 * Math.sin(t * 7.5 + anti + pair * 1.3 + this.seed);
          const g = s.graze * (1 - s.swim);
          j.set(jointName.leg(pair, side, 1), g * (0.2 + 0.45 * pick) - s.swim * 0.5, sx * 0.08 * Math.sin(t * 2.3 + pair));
          j.set(jointName.leg(pair, side, 2), -g * 0.7 * pick);
          j.set(jointName.leg(pair, side, 3), g * 0.3 * (1 - pick));
          continue;
        }
        // Walking legs: neighbours and contralateral legs out of phase.
        const ph = this.gait + pair * 2.1 + anti;
        const swing = Math.sin(ph) * 0.38 * walk;
        const lift = Math.max(0, Math.cos(ph)) * 0.32 * walk;
        const idle = 0.03 * Math.sin(t * 0.7 + pair + anti) * (1 - walk);
        const tuck = s.swim;
        j.set(jointName.leg(pair, side, 1), 0, -sx * (swing + idle) + sx * 0.55 * tuck, sx * (lift + 0.35 * tuck));
        j.set(jointName.leg(pair, side, 2), 0, 0, sx * (lift * 0.5 + 0.25 * tuck));
      }

      for (let pair = 1; pair <= PLEOPOD_PAIRS; pair++) {
        const amp = 0.18 + 0.45 * s.swim;
        j.set(jointName.pleopod(pair, side), amp * Math.sin(this.pleo - pair * 0.9));
      }
    }
  }
}
