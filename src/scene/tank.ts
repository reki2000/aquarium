import * as THREE from 'three/webgpu';
import { TANK } from '../config';
import { createGlassEdgeMaterial, createGlassMaterial, createWaterSurfaceMaterial } from '../materials/water';

/** Rimless 60cm tank on a cabinet in a dim room. */
export function createTank(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tank';
  const { width: W, depth: D, height: H, glass: G, waterLevel } = TANK;

  const glass = createGlassMaterial();
  const edge = createGlassEdgeMaterial();
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z. Faces pointing along the pane's thin axis are edges.
  const pane = (w: number, h: number, d: number, x: number, y: number, z: number, thinAxis: 'x' | 'y' | 'z') => {
    const mats = [edge, edge, edge, edge, edge, edge];
    const axisIndex = { x: 0, y: 2, z: 4 }[thinAxis];
    mats[axisIndex] = glass;
    mats[axisIndex + 1] = glass;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, y, z);
    m.renderOrder = 2;
    group.add(m);
  };
  pane(W + 2 * G, H, G, 0, H / 2, D / 2 + G / 2, 'z');
  pane(W + 2 * G, H, G, 0, H / 2, -D / 2 - G / 2, 'z');
  pane(G, H, D, W / 2 + G / 2, H / 2, 0, 'x');
  pane(G, H, D, -W / 2 - G / 2, H / 2, 0, 'x');

  // Black backscreen film on the outside of the back pane: hides the room and makes the water read deep.
  const backscreen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardNodeMaterial({ color: 0x020303, roughness: 0.9 }));
  backscreen.position.set(0, H / 2, -D / 2 - G - 0.0005);
  group.add(backscreen);

  // Black silicone beads in the vertical corners.
  const silicone = new THREE.MeshPhysicalNodeMaterial({ color: 0x050607, roughness: 0.35, clearcoat: 0.6 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bead = new THREE.Mesh(new THREE.BoxGeometry(0.004, H - 0.004, 0.004), silicone);
      bead.position.set(sx * (W / 2 - 0.0015), H / 2, sz * (D / 2 - 0.0015));
      bead.rotation.y = Math.PI / 4;
      group.add(bead);
    }
  }

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1), createWaterSurfaceMaterial());
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = waterLevel;
  surface.renderOrder = 3;
  group.add(surface);

  // Bottom pane + cabinet.
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * G, G, D + 2 * G), new THREE.MeshStandardNodeMaterial({ color: 0x0b0d0d, roughness: 0.2 }));
  bottom.position.y = -G / 2;
  group.add(bottom);
  const cabinetMat = new THREE.MeshStandardNodeMaterial({ color: 0x14100d, roughness: 0.55 });
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.7, D + 0.06), cabinetMat);
  cabinet.position.set(0, -G - 0.35, 0);
  cabinet.receiveShadow = true;
  group.add(cabinet);

  // Room: back wall + floor, both dark and matte so the lit tank dominates.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardNodeMaterial({ color: 0x2a2d31, roughness: 0.95 }));
  wall.position.set(0, 0.6, -D / 2 - 0.25);
  wall.receiveShadow = true;
  group.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardNodeMaterial({ color: 0x1c1712, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -G - 0.7;
  group.add(floor);

  // Slim LED fixture hanging above the tank.
  const fixture = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.012, 0.08), new THREE.MeshStandardNodeMaterial({ color: 0x1b1d20, roughness: 0.35, metalness: 0.8 }));
  fixture.add(housing);
  const diffuser = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.04, 0.06),
    new THREE.MeshStandardNodeMaterial({ color: 0x000000, emissive: 0xf4f7ff, emissiveIntensity: 6 }),
  );
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = -0.0061;
  fixture.add(diffuser);
  fixture.position.set(0, H + 0.18, 0);
  group.add(fixture);

  return group;
}
