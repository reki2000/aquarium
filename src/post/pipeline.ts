import * as THREE from 'three/webgpu';
import {
  float, mix, mrt, normalView, output, packNormalToRGB, pass, sample, uniform, unpackRGBToNormal, velocity,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import type { QualitySettings } from '../config';

export const postParams = {
  focusDistance: uniform(0.62),
  focalLength: uniform(0.12),
  bokehScale: uniform(2.0),
  aoStrength: uniform(0.6),
};

/** Scene → GTAO → bloom → TRAA → DOF. Tone mapping + sRGB happen in the pipeline's output transform. */
export function createPipeline(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: QualitySettings) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: packNormalToRGB(normalView), velocity }));
  // 8-bit is plenty for packed normals and halves that attachment's bandwidth.
  scenePass.getTexture('normal').type = THREE.UnsignedByteType;

  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const packedNormal = scenePass.getTextureNode('normal');
  const normal = sample((uv: any) => unpackRGBToNormal(packedNormal.sample(uv)));
  const vel = scenePass.getTextureNode('velocity');

  let lit: any = color;
  if (q.ao) {
    const aoPass = ao(depth, normal, camera);
    aoPass.resolutionScale = 0.5;
    lit = color.mul(mix(float(1), aoPass.getTextureNode().r, postParams.aoStrength));
  }
  if (q.bloom) lit = lit.add(bloom(lit, 0.18, 0.35, 0.85));

  let out: any = traa(lit, depth, vel, camera);
  if (q.dof) out = dof(out, scenePass.getViewZNode(), postParams.focusDistance, postParams.focalLength, postParams.bokehScale);

  pipeline.outputNode = out;
  return pipeline;
}
