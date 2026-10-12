# Implementation plan

## Decisions (2026-09-26)

| Item | Decision |
|---|---|
| Main subject | Cherry shrimp (*Neocaridina davidi*) |
| Target | Desktop first: WebGPU with a WebGL2 fallback. Mobile support at the low quality tier is optional. |
| Purpose | Aquarium viewing with orbit and macro follow cameras |
| Shrimp model | A user-supplied GLB can replace the procedural model using [the model specification](shrimp-model-spec.md). |

## Technology

- three.js r186 `WebGPURenderer` and TSL; Vite aliases `three` to the WebGPU build.
- Vite, TypeScript and lil-gui.
- Procedural textures and geometry for the aquarium. The shrimp uses a texture derived from a public-domain reference photograph. Replaceable assets live in `public/assets/`.

## Rendering techniques

| Element | Technique | Location |
|---|---|---|
| Water color and turbidity | Beer–Lambert attenuation and scattering based on the camera ray's distance through the water box (`scene.fogNode`) | `src/materials/water.ts` |
| Caustics | Procedural TSL caustics on the top SpotLight's `colorNode`, with small RGB offsets for dispersion and shadows | `src/materials/water.ts`, `src/scene/lighting.ts` |
| Glass and water surface | Reflection overlays with additive light and slight attenuation, without transmission passes; green glass edges | `src/materials/water.ts`, `src/scene/tank.ts` |
| Soil, rocks and driftwood | Procedural TSL materials (Worley granules, stone and wood grain) and procedural geometry | `src/materials/hardscape.ts`, `src/scene/hardscape.ts` |
| Suspended particles | Instanced sprites drifting with TSL | `src/entities/particles.ts` |
| Shrimp | Segment shells lofted from a photographic side profile, with an unrolled (s, t) texture (`tools/shrimp-profile/`), rigid segment hierarchy, SSS materials, procedural animation and a behavior state machine | `src/entities/shrimp/` |
| Post-processing | GTAO → Bloom → TRAA → DOF, selected by quality tier | `src/post/pipeline.ts` |

## Phases

| # | Work | Status |
|---|---|---|
| 0 | Foundation: Vite, TypeScript, three.js WebGPU, GUI, quality tiers and screenshot verification | Complete |
| 1 | Tank and lighting: glass, underwater attenuation, water surface, caustics and post-processing | First version complete |
| 2 | Layout: soil, rocks and driftwood | First procedural version complete |
| 3 | Plants: willow moss, Anubias nana, stem plants and swaying shaders | Next |
| 4 | Shrimp appearance | Photo-derived segment lofts and unrolled texture complete; optional GLB replacement supported |
| 5 | Rig and animation: foot contact and walking on rocks | Basic foot-target IK implemented; walking on rocks remains pending |
| 6 | Behavior: food maps, molts and colony density | Basic state machine implemented |
| 7 | Finishing: bubbles, light shafts, underwater total internal reflection and an HDRI room | Pending |
| 8 | Optimization: merged shrimp draw calls, LOD and path-traced still images | Pending |

## Known issues

- Each procedural shrimp has approximately 80 meshes: roughly 1,100 draw calls for 14 shrimp, plus shadows. A future GLB model could use one SkinnedMesh.
- Headless Chromium with SwiftShader may omit WebGPU canvases from screenshots, so automated checks use `backend=webgl`.
- Shrimp cannot walk on rocks or driftwood, which currently act as obstacles. Integrating their surfaces into the terrain remains pending.
