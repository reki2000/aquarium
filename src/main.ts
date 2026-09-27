import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { QUALITY, SHRIMP_COUNT, TANK, type QualityTier } from './config';
import { underwaterFog, waterParams } from './materials/water';
import { Terrain } from './sim/terrain';
import { createTank } from './scene/tank';
import { createHardscape } from './scene/hardscape';
import { setupLighting } from './scene/lighting';
import { ShrimpColony } from './entities/shrimp/ShrimpColony';
import { shrimpLook } from './entities/shrimp/shrimpMaterials';
import { createSuspendedParticles } from './entities/particles';
import { createPipeline, postParams } from './post/pipeline';

const params = new URLSearchParams(location.search);
const tier = (params.get('quality') as QualityTier) ?? 'high';
const quality = QUALITY[tier] ?? QUALITY.high;
const status = document.getElementById('status')!;
const frozen = params.has('freeze');

async function main() {
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.get('backend') === 'webgl' });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  scene.fogNode = underwaterFog();

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.004, 20);
  camera.position.set(0.05, 0.2, 1.1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.14, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.06;
  controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.62;

  const terrain = new Terrain();
  scene.add(createTank());
  scene.add(createHardscape(terrain));
  const lighting = setupLighting(scene, renderer, quality);
  scene.add(createSuspendedParticles(quality.particles));

  const colony = new ShrimpColony(terrain);
  await colony.spawn(Number(params.get('shrimp') ?? SHRIMP_COUNT));
  scene.add(colony.group);

  // ?post=off renders the scene directly (debugging / very old GPUs).
  const pipeline = params.get('post') === 'off' ? null : createPipeline(renderer, scene, camera, quality);

  // --- Camera modes -----------------------------------------------------------
  const view = { mode: 'orbit' as 'orbit' | 'follow', follow: 0, autoFocus: true };
  const followOffset = new THREE.Vector3();
  const setMode = (mode: 'orbit' | 'follow') => {
    view.mode = mode;
    if (mode === 'follow') {
      const s = colony.shrimp[view.follow % colony.shrimp.length];
      if (!s) return;
      controls.target.copy(s.object.position);
      camera.position.copy(s.object.position).add(new THREE.Vector3(0.015, 0.05, 0.12));
    }
  };

  // --- Debug GUI ---------------------------------------------------------------
  const gui = new GUI({ title: 'Aqualium' });
  const camF = gui.addFolder('Camera');
  camF.add(view, 'mode', ['orbit', 'follow']).onChange(setMode);
  camF.add(view, 'follow', 0, Math.max(0, colony.shrimp.length - 1), 1).name('follow shrimp').onChange(() => setMode(view.mode));
  camF.add(view, 'autoFocus');
  camF.add(postParams.focusDistance, 'value', 0.02, 2).name('focus (m)').listen();
  camF.add(postParams.focalLength, 'value', 0.01, 0.5).name('focal range');
  camF.add(postParams.bokehScale, 'value', 0, 6).name('bokeh');
  const waterF = gui.addFolder('Water');
  waterF.add(waterParams.scatterDensity, 'value', 0, 8).name('turbidity');
  waterF.add(waterParams.absorption.value, 'x', 0, 6).name('absorb R');
  waterF.add(waterParams.absorption.value, 'y', 0, 3).name('absorb G');
  waterF.add(waterParams.absorption.value, 'z', 0, 3).name('absorb B');
  waterF.add(waterParams.causticStrength, 'value', 0, 1.5).name('caustics');
  waterF.add(waterParams.causticScale, 'value', 0.5, 8).name('caustic scale');
  waterF.add(waterParams.causticSpeed, 'value', 0, 2).name('caustic speed');
  const shrimpF = gui.addFolder('Shrimp');
  shrimpF.add(shrimpLook.clarity, 'value', 0, 1.3).name('clarity');
  shrimpF.add(shrimpLook.pigment, 'value', 0, 2).name('pigment');
  const lightF = gui.addFolder('Light');
  lightF.add(lighting.top, 'intensity', 0, 30).name('top LED');
  lightF.add(lighting.room, 'intensity', 0, 2).name('room');
  lightF.add(renderer, 'toneMappingExposure', 0.2, 3).name('exposure');
  lightF.add(postParams.aoStrength, 'value', 0, 1).name('AO');
  gui.close();

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  // --- Loop ---------------------------------------------------------------------------
  const clock = new THREE.Timer();
  let frames = 0;
  let fpsTime = 0;
  const debug = { frames: 0, ready: false };
  (window as unknown as { __aqualium: unknown }).__aqualium = { debug, colony, camera, controls, setMode, view };

  renderer.setAnimationLoop((timestamp) => {
    clock.update(timestamp);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    // ?freeze keeps the shrimp still (inspection / screenshots) while rendering continues.
    colony.update(frozen ? 0 : dt);

    if (view.mode === 'follow') {
      const s = colony.shrimp[view.follow % colony.shrimp.length];
      if (s) {
        followOffset.copy(camera.position).sub(controls.target);
        controls.target.lerp(s.object.position, Math.min(1, dt * 3));
        camera.position.copy(controls.target).add(followOffset);
      }
    }
    controls.update(dt);
    if (view.autoFocus) {
      postParams.focusDistance.value = camera.position.distanceTo(controls.target);
    }

    if (pipeline) pipeline.render();
    else renderer.render(scene, camera);

    frames++;
    debug.frames++;
    fpsTime += dt;
    if (fpsTime > 0.5) {
      status.textContent = `${backend} · ${tier} · ${(frames / fpsTime).toFixed(0)} fps · shrimp: ${colony.shrimp.length} (${colony.source}) · tank ${TANK.width * 100}cm`;
      frames = 0;
      fpsTime = 0;
      debug.ready = true;
    }
  });
}

main().catch((e) => {
  console.error(e);
  status.textContent = `Failed to start: ${e instanceof Error ? e.message : String(e)}`;
});
