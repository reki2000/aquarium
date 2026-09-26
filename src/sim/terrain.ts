import { Vector3 } from 'three/webgpu';
import { TANK } from '../config';
import { SimplexNoise, smoothstep } from '../util/noise';

export interface Obstacle {
  x: number;
  z: number;
  /** Footprint radius on the substrate. */
  radius: number;
  top: number;
}

/**
 * Substrate heightfield + static obstacles. The single source of truth shared by
 * geometry generation (substrate mesh, hardscape placement) and shrimp locomotion.
 */
export class Terrain {
  readonly obstacles: Obstacle[] = [];
  private noise = new SimplexNoise(7);

  /** Inner walkable bounds (x/z), inset from the glass. */
  readonly bounds = {
    minX: -TANK.width / 2 + 0.012,
    maxX: TANK.width / 2 - 0.012,
    minZ: -TANK.depth / 2 + 0.012,
    maxZ: TANK.depth / 2 - 0.012,
  };

  /** Substrate surface height (m) at world x/z. Classic front-low / back-high slope with soft mounds. */
  height(x: number, z: number): number {
    const d = (TANK.depth / 2 - z) / TANK.depth; // 0 front .. 1 back
    const slope = 0.03 + 0.05 * smoothstep(0, 1, d);
    const mound = this.noise.fbm2(x * 6, z * 6, 3) * 0.007;
    const ridge = Math.exp(-((x + 0.12) ** 2) / 0.006 - ((z + 0.05) ** 2) / 0.01) * 0.018;
    return slope + mound + ridge;
  }

  normal(x: number, z: number, target = new Vector3()): Vector3 {
    const e = 0.002;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return target.set(-hx, 2 * e, -hz).normalize();
  }

  addObstacle(o: Obstacle) {
    this.obstacles.push(o);
  }

  /** Signed distance (m) to the nearest obstacle edge or wall margin; negative means inside. */
  clearance(x: number, z: number): number {
    const b = this.bounds;
    let d = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    for (const o of this.obstacles) {
      d = Math.min(d, Math.hypot(x - o.x, z - o.z) - o.radius);
    }
    return d;
  }
}
