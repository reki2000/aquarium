// Dev helper: verify the three.js TSL / WebGPU symbols this project relies on exist.
import * as T from 'three/tsl';
import * as W from 'three/webgpu';

const tsl = 'Fn uniform time positionWorld cameraPosition mx_worley_noise_float mx_fractal_noise_float mx_cell_noise_float mx_noise_float bumpMap normalView mrt output velocity pass screenUV builtinAOContext fog rangeFogFactor densityFogFactor directionToColor colorToDirection normalWorld positionLocal instanceIndex hash smoothstep select Loop positionView attribute emissive diffuseColor vertexColor convertToTexture instancedArray'.split(' ');
const classes = 'MeshSSSNodeMaterial PointsNodeMaterial SpriteNodeMaterial MeshPhysicalNodeMaterial MeshStandardNodeMaterial RenderPipeline SpotLight WebGPURenderer'.split(' ');

const missing = [...tsl.filter((n) => !(n in T)), ...classes.filter((n) => !(n in W))];
console.log(missing.length ? `missing: ${missing.join(' ')}` : 'all symbols present');
