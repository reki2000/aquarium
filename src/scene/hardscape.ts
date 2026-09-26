import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TANK } from '../config';
import { createRockMaterial, createSubstrateMaterial, createWoodMaterial } from '../materials/hardscape';
import type { Terrain } from '../sim/terrain';
import { SimplexNoise } from '../util/noise';

/** Closed substrate slab: heightfield top + side skirts visible through the glass. */
function createSubstrate(terrain: Terrain): THREE.Mesh {
  const nx = 180;
  const nz = 90;
  const W = TANK.width;
  const D = TANK.depth;
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (i: number, k: number) => [-W / 2 + (W * i) / nx, -D / 2 + (D * k) / nz] as const;

  for (let k = 0; k <= nz; k++) {
    for (let i = 0; i <= nx; i++) {
      const [x, z] = at(i, k);
      pos.push(x, terrain.height(x, z), z);
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const a = k * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Skirts along the four glass walls, down to the tank floor.
  const skirt = (edge: [number, number][], flip: boolean) => {
    const base = pos.length / 3;
    for (const [x, z] of edge) {
      pos.push(x, terrain.height(x, z), z);
      pos.push(x, 0, z);
    }
    for (let s = 0; s < edge.length - 1; s++) {
      const a = base + s * 2;
      const [t0, b0, t1, b1] = [a, a + 1, a + 2, a + 3];
      if (flip) idx.push(t0, t1, b0, t1, b1, b0);
      else idx.push(t0, b0, t1, t1, b0, b1);
    }
  };
  const front: [number, number][] = [];
  const back: [number, number][] = [];
  for (let i = 0; i <= nx; i++) {
    front.push([at(i, nz)[0], D / 2]);
    back.push([at(i, 0)[0], -D / 2]);
  }
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let k = 0; k <= nz; k++) {
    left.push([-W / 2, at(0, k)[1]]);
    right.push([W / 2, at(0, k)[1]]);
  }
  skirt(front, false);
  skirt(back, true);
  skirt(left, false);
  skirt(right, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, createSubstrateMaterial());
  m.receiveShadow = true;
  m.castShadow = true;
  m.name = 'substrate';
  return m;
}

function createRockGeometry(seed: number, size: [number, number, number]): THREE.BufferGeometry {
  const noise = new SimplexNoise(seed);
  // Icosahedron is non-indexed; weld vertices so displacement stays watertight and normals smooth.
  const ico = new THREE.IcosahedronGeometry(1, 28);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Large facets (ridged) + medium noise; flattened bottom so the stone sits on the soil.
    // Seiryu stone: broad planar faces and sharp ridges, only fine surface roughness on top.
    const ridged = 1 - Math.abs(noise.noise3(v.x * 1.1, v.y * 1.1, v.z * 1.1));
    const facets = Math.round(noise.noise3(v.x * 0.8 + 5, v.y * 0.8, v.z * 0.8) * 3) / 3;
    const r = 0.84 + ridged * 0.2 + facets * 0.06 + noise.fbm3(v.x * 6, v.y * 6, v.z * 6, 3) * 0.025;
    v.multiplyScalar(r);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.15;
    p.setXYZ(i, v.x * size[0], v.y * size[1], v.z * size[2]);
  }
  g.computeVertexNormals();
  return g;
}

function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, tubular = 64, radial = 10): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const noise = new SimplexNoise(tubular + radial);
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c);
      const knot = 1 + noise.noise2(u * 14, j * 0.7) * 0.18;
      v.multiplyScalar(r * knot).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function createHardscape(terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hardscape';
  group.add(createSubstrate(terrain));

  // Iwagumi: main stone right of center, supporting stones stepping down.
  const stones: { x: number; z: number; size: [number, number, number]; rotY: number; tilt: number }[] = [
    { x: 0.075, z: -0.035, size: [0.045, 0.085, 0.038], rotY: 0.4, tilt: -0.12 },
    { x: 0.14, z: 0.01, size: [0.03, 0.045, 0.028], rotY: 1.3, tilt: -0.2 },
    { x: 0.02, z: 0.02, size: [0.026, 0.03, 0.022], rotY: -0.6, tilt: 0.15 },
    { x: 0.2, z: -0.07, size: [0.028, 0.055, 0.03], rotY: 2.1, tilt: -0.1 },
    { x: -0.06, z: 0.06, size: [0.014, 0.012, 0.012], rotY: 0.2, tilt: 0 },
  ];
  stones.forEach((s, i) => {
    const rock = new THREE.Mesh(createRockGeometry(11 + i * 17, s.size), createRockMaterial(i));
    const ground = terrain.height(s.x, s.z);
    rock.position.set(s.x, ground + s.size[1] * 0.25, s.z);
    rock.rotation.set(0, s.rotY, s.tilt);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
    terrain.addObstacle({ x: s.x, z: s.z, radius: Math.max(s.size[0], s.size[2]) * 0.95, top: ground + s.size[1] });
  });

  // Driftwood on the left, rising towards the back.
  const wood = createWoodMaterial();
  const trunkBase = new THREE.Vector3(-0.2, terrain.height(-0.2, 0.04) - 0.004, 0.04);
  const trunk = new THREE.CatmullRomCurve3([
    trunkBase,
    new THREE.Vector3(-0.17, 0.08, 0.0),
    new THREE.Vector3(-0.13, 0.15, -0.05),
    new THREE.Vector3(-0.09, 0.23, -0.08),
    new THREE.Vector3(-0.03, 0.27, -0.1),
  ]);
  const branches = [
    { curve: trunk, r0: 0.011, r1: 0.003 },
    {
      curve: new THREE.CatmullRomCurve3([
        trunk.getPointAt(0.45),
        new THREE.Vector3(-0.19, 0.2, -0.07),
        new THREE.Vector3(-0.23, 0.26, -0.1),
      ]),
      r0: 0.005,
      r1: 0.0015,
    },
    {
      curve: new THREE.CatmullRomCurve3([
        trunk.getPointAt(0.25),
        new THREE.Vector3(-0.1, 0.09, 0.03),
        new THREE.Vector3(-0.05, 0.1, 0.05),
      ]),
      r0: 0.004,
      r1: 0.0012,
    },
    {
      curve: new THREE.CatmullRomCurve3([
        trunkBase.clone().add(new THREE.Vector3(0.005, 0.005, 0)),
        new THREE.Vector3(-0.24, 0.05, 0.02),
        new THREE.Vector3(-0.27, 0.06, -0.02),
      ]),
      r0: 0.006,
      r1: 0.002,
    },
  ];
  for (const b of branches) {
    const m = new THREE.Mesh(taperedTube(b.curve, b.r0, b.r1), wood);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  terrain.addObstacle({ x: trunkBase.x, z: trunkBase.z, radius: 0.016, top: trunkBase.y + 0.02 });

  return group;
}
