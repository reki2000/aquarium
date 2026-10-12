import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TANK, type QualitySettings } from '../config';
import { causticLightColor } from '../materials/water';

export interface Lighting {
  top: THREE.SpotLight;
  room: THREE.HemisphereLight;
}

export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGPURenderer, quality: QualitySettings): Lighting {
  // Bright room reflections for glass and wet surfaces.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.background = new THREE.Color(0xe8eee9);

  // Aquarium LED: a wide warm-white spot above the tank projecting animated caustics.
  const top = new THREE.SpotLight(0xfff4e4, 6.5, 0, 0.52, 0.6, 1.2);
  top.position.set(0, TANK.height + 0.42, 0.02);
  top.target.position.set(0, 0, 0);
  top.castShadow = true;
  top.shadow.mapSize.setScalar(quality.shadowMapSize);
  top.shadow.camera.near = 0.2;
  top.shadow.camera.far = 1.2;
  top.shadow.bias = -0.0004;
  top.shadow.normalBias = 0.0006;
  top.shadow.radius = 3;
  // SpotLightNode calls colorNode(lightProjectionUV) and multiplies the light color by it.
  (top as unknown as { colorNode: unknown }).colorNode = causticLightColor;
  scene.add(top, top.target);

  const room = new THREE.HemisphereLight(0xfff8ed, 0xc0ab8b, 1.1);
  scene.add(room);

  return { top, room };
}
