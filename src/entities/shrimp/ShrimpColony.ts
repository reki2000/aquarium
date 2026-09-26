import * as THREE from 'three/webgpu';
import type { Terrain } from '../../sim/terrain';
import { mulberry32 } from '../../util/noise';
import { JointSet } from './joints';
import { buildProceduralShrimp, cloneShrimp, type ShrimpRigTemplate } from './ProceduralShrimp';
import { cloneGltfShrimp, tryLoadGltfShrimp, type GltfShrimpTemplate } from './GltfShrimp';
import { ShrimpBrain } from './ShrimpBrain';
import { ShrimpRig } from './ShrimpRig';
import type { ShrimpColorVariant } from './shrimpMaterials';

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _f = new THREE.Vector3();
const _x = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

export class Shrimp {
  readonly object: THREE.Object3D;
  readonly brain: ShrimpBrain;
  private rig: ShrimpRig;

  constructor(rigTemplate: ShrimpRigTemplate, brain: ShrimpBrain, seed: number, readonly scale: number) {
    this.object = rigTemplate.root;
    this.object.scale.setScalar(scale);
    this.brain = brain;
    this.rig = new ShrimpRig(new JointSet(this.object, rigTemplate.resolve), seed, scale);
  }

  update(dt: number, terrain: Terrain, neighbours: readonly ShrimpBrain[]) {
    const b = this.brain;
    b.update(dt, neighbours);
    this.rig.update(dt, b);

    // Align to the substrate normal on the ground, level out while swimming.
    terrain.normal(b.x, b.z, _n).lerp(UP, b.swim).normalize();
    _f.set(Math.sin(b.heading), 0, Math.cos(b.heading));
    _f.addScaledVector(_n, -_f.dot(_n)).normalize();
    _x.crossVectors(_n, _f).normalize();
    _m.makeBasis(_x, _n, _f);
    _q.setFromRotationMatrix(_m);
    this.object.quaternion.slerp(_q, Math.min(1, dt * 8));
    this.object.position.set(b.x, terrain.height(b.x, b.z) + b.altitude, b.z);
  }
}

export class ShrimpColony {
  readonly group = new THREE.Group();
  readonly shrimp: Shrimp[] = [];
  source: 'gltf' | 'procedural' = 'procedural';

  constructor(private terrain: Terrain) {
    this.group.name = 'shrimp-colony';
  }

  async spawn(count: number, seed = 42) {
    const rand = mulberry32(seed);
    const gltf: GltfShrimpTemplate | null = await tryLoadGltfShrimp().catch((e) => {
      console.warn('[shrimp] failed to load glTF model, using procedural placeholder', e);
      return null;
    });
    this.source = gltf ? 'gltf' : 'procedural';
    const proceduralTemplate = gltf ? null : buildProceduralShrimp({ grade: 0.8, saddle: false });

    for (let i = 0; i < count; i++) {
      // Mix of grades; larger individuals are females and some carry a saddle.
      const female = rand() < 0.55;
      const variant: ShrimpColorVariant = {
        grade: female ? 0.65 + rand() * 0.35 : 0.2 + rand() * 0.4,
        saddle: female && rand() < 0.4,
      };
      const scale = female ? 0.95 + rand() * 0.2 : 0.72 + rand() * 0.15;
      const rig = gltf ? cloneGltfShrimp(gltf) : cloneShrimp(proceduralTemplate!, variant);

      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        x = (rand() - 0.5) * 0.5;
        z = (rand() - 0.5) * 0.24;
        if (this.terrain.clearance(x, z) > 0.012) break;
      }
      const s = new Shrimp(rig, new ShrimpBrain(this.terrain, rand, x, z), rand() * 100, scale);
      this.shrimp.push(s);
      this.group.add(s.object);
    }
  }

  update(dt: number) {
    const brains = this.shrimp.map((s) => s.brain);
    for (const s of this.shrimp) s.update(dt, this.terrain, brains);
  }
}
