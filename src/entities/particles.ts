import * as THREE from 'three/webgpu';
import {
  float, instancedBufferAttribute, mx_noise_vec3, positionWorld, smoothstep, time, uv, vec3,
} from 'three/tsl';
import { TANK } from '../config';
import { mulberry32 } from '../util/noise';

/** Suspended micro-particles catching the top light — sells the "water volume" more than anything. */
export function createSuspendedParticles(count: number): THREE.Sprite {
  const rand = mulberry32(99);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4 + 0] = (rand() - 0.5) * (TANK.width - 0.01);
    data[i * 4 + 1] = 0.03 + rand() * (TANK.waterLevel - 0.04);
    data[i * 4 + 2] = (rand() - 0.5) * (TANK.depth - 0.01);
    data[i * 4 + 3] = rand();
  }
  const attr = new THREE.InstancedBufferAttribute(data, 4);
  const base = instancedBufferAttribute(attr, 'vec4') as unknown as THREE.Node<'vec4'>;
  const seed = base.w;

  // Slow turbulent drift, wrapped inside the water volume.
  const drift = mx_noise_vec3(vec3(base.x.mul(8), base.z.mul(8), time.mul(0.05).add(seed.mul(10)))).mul(0.012);
  const sink = time.mul(0.0015).add(seed.mul(1.7)).mod(1).mul(-0.01);
  const pos = base.xyz.add(drift).add(vec3(0, sink, 0));

  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = pos;
  m.scaleNode = float(0.00035).add(seed.mul(0.0005));
  const d = uv().sub(0.5).length();
  const disc = float(1).sub(smoothstep(0.15, 0.5, d));
  // Brighter near the lit surface, fading with depth.
  const lightFalloff = smoothstep(0.0, TANK.waterLevel, positionWorld.y).mul(0.7).add(0.3);
  m.colorNode = vec3(0.8, 0.9, 0.85).mul(lightFalloff).mul(0.35);
  m.opacityNode = disc.mul(seed.mul(0.6).add(0.4));

  const sprite = new THREE.Sprite(m);
  sprite.count = count;
  sprite.frustumCulled = false;
  sprite.name = 'suspended-particles';
  return sprite;
}
