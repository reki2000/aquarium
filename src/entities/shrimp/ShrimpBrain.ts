import type { Terrain } from '../../sim/terrain';
import { clamp, smoothstep } from '../../util/noise';

export type ShrimpActivity = 'graze' | 'walk' | 'rest' | 'swim';

/** Behavior + locomotion for one shrimp on the substrate heightfield. */
export class ShrimpBrain {
  x: number;
  z: number;
  heading: number;
  /** Height above the substrate (m); > 0 only while swimming. */
  altitude = 0;
  speed = 0;
  turnRate = 0;
  swim = 0;
  graze = 0;
  activity: ShrimpActivity = 'graze';

  private timer = 0;
  private targetX = 0;
  private targetZ = 0;
  private swimHeight = 0;
  private swimStart = { x: 0, z: 0 };
  private microStep = 0;

  constructor(private terrain: Terrain, private rand: () => number, x: number, z: number) {
    this.x = x;
    this.z = z;
    this.heading = rand() * Math.PI * 2;
    this.timer = rand() * 4;
  }

  update(dt: number, neighbours: readonly ShrimpBrain[]) {
    this.timer -= dt;
    let desiredSpeed = 0;
    let desiredHeading = this.heading;

    switch (this.activity) {
      case 'graze': {
        // Shuffle a step now and then while feeding.
        this.microStep -= dt;
        if (this.microStep < -1.5 - this.rand() * 3) this.microStep = 0.3 + this.rand() * 0.4;
        if (this.microStep > 0) {
          desiredSpeed = 0.004;
          desiredHeading = this.heading + (this.rand() - 0.5) * 0.6;
        }
        if (this.timer <= 0) this.chooseNext();
        break;
      }
      case 'rest':
        if (this.timer <= 0) this.chooseNext();
        break;
      case 'walk': {
        const dx = this.targetX - this.x;
        const dz = this.targetZ - this.z;
        const dist = Math.hypot(dx, dz);
        desiredHeading = Math.atan2(dx, dz);
        desiredSpeed = 0.011 * smoothstep(0.002, 0.02, dist);
        if (dist < 0.004 || this.timer <= 0) this.begin('graze', 4 + this.rand() * 8);
        break;
      }
      case 'swim': {
        const dx = this.targetX - this.x;
        const dz = this.targetZ - this.z;
        const dist = Math.hypot(dx, dz);
        const total = Math.hypot(this.targetX - this.swimStart.x, this.targetZ - this.swimStart.z) || 1;
        const u = clamp(1 - dist / total, 0, 1);
        this.altitude = Math.sin(u * Math.PI) * this.swimHeight;
        desiredHeading = Math.atan2(dx, dz);
        desiredSpeed = 0.045;
        if (dist < 0.006 || this.timer <= 0) {
          this.altitude = 0;
          this.begin('graze', 3 + this.rand() * 6);
        }
        break;
      }
    }

    // Blend postures.
    const swimTarget = this.activity === 'swim' ? 1 : 0;
    const grazeTarget = this.activity === 'graze' ? 1 : 0;
    this.swim += (swimTarget - this.swim) * Math.min(1, dt * 3);
    this.graze += (grazeTarget - this.graze) * Math.min(1, dt * 2.5);
    if (this.activity !== 'swim') this.altitude *= Math.max(0, 1 - dt * 4);

    // Separation from neighbours (they bump and step aside rather than overlap).
    for (const o of neighbours) {
      if (o === this) continue;
      const dx = this.x - o.x;
      const dz = this.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < 0.014 && Math.abs(this.altitude - o.altitude) < 0.01) {
        const push = (0.014 - d) * 0.8;
        this.x += (dx / d) * push * dt * 10;
        this.z += (dz / d) * push * dt * 10;
      }
    }

    // Look ahead: steer away from walls / rocks unless swimming high enough.
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    if (this.altitude < 0.03 && this.terrain.clearance(this.x + fx * 0.015, this.z + fz * 0.015) < 0.004) {
      const left = this.terrain.clearance(this.x + Math.sin(this.heading + 0.8) * 0.015, this.z + Math.cos(this.heading + 0.8) * 0.015);
      const right = this.terrain.clearance(this.x + Math.sin(this.heading - 0.8) * 0.015, this.z + Math.cos(this.heading - 0.8) * 0.015);
      desiredHeading = this.heading + (left > right ? 1.2 : -1.2);
      if (this.activity === 'walk') this.pickTarget(0.03, 0.1);
    }

    // Turn with a limited yaw rate; slow down for sharp turns.
    const maxTurn = this.activity === 'swim' ? 3.5 : 2.2;
    let dh = Math.atan2(Math.sin(desiredHeading - this.heading), Math.cos(desiredHeading - this.heading));
    dh = clamp(dh, -maxTurn * dt, maxTurn * dt);
    this.heading += dh;
    this.turnRate = dh / Math.max(dt, 1e-4);
    const turnSlow = 1 - clamp(Math.abs(dh / (maxTurn * dt + 1e-6)) * 0.6, 0, 0.6);
    this.speed += (desiredSpeed * turnSlow - this.speed) * Math.min(1, dt * 5);

    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    if (this.terrain.clearance(nx, nz) > 0 || this.altitude > 0.03) {
      this.x = nx;
      this.z = nz;
    } else {
      this.speed = 0;
    }
    const b = this.terrain.bounds;
    this.x = clamp(this.x, b.minX, b.maxX);
    this.z = clamp(this.z, b.minZ, b.maxZ);
  }

  private chooseNext() {
    const r = this.rand();
    if (r < 0.55) {
      this.begin('walk', 12);
      this.pickTarget(0.03, 0.12);
    } else if (r < 0.72) {
      this.begin('graze', 3 + this.rand() * 8);
    } else if (r < 0.87) {
      this.begin('rest', 2 + this.rand() * 6);
    } else {
      this.begin('swim', 10);
      this.pickTarget(0.08, 0.25);
      this.swimStart = { x: this.x, z: this.z };
      this.swimHeight = 0.03 + this.rand() * 0.07;
    }
  }

  private begin(activity: ShrimpActivity, duration: number) {
    this.activity = activity;
    this.timer = duration;
  }

  private pickTarget(minDist: number, maxDist: number) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = this.heading + (this.rand() - 0.5) * Math.PI * 1.4;
      const d = minDist + this.rand() * (maxDist - minDist);
      const tx = this.x + Math.sin(a) * d;
      const tz = this.z + Math.cos(a) * d;
      if (this.terrain.clearance(tx, tz) > 0.01) {
        this.targetX = tx;
        this.targetZ = tz;
        return;
      }
    }
    this.targetX = this.x;
    this.targetZ = this.z;
  }
}
