# Shrimp model specification (glTF replacement)

Place a model at `public/assets/shrimp/cherry.glb` to load it automatically at startup and replace the procedural shrimp. The status display will show `(gltf)`.
If the file is missing or fails to load, the app uses the procedural model.

## Format

| Item | Requirement |
|---|---|
| Format | Binary glTF 2.0 (`.glb`). Meshopt compression is supported (`gltf-transform meshopt`). |
| Orientation | **+Z points toward the head (forward), +Y points up, +X points left.** |
| Scale | Any scale. The model is normalized so its **Z bounding-box length is 22 mm**. If the bounding box includes long antennae, adjust `TARGET_BODY_LENGTH` to compensate. |
| Origin | Any origin. Loading centers X/Z and places the lowest point at y=0. |
| Rest pose | A natural standing pose with walking feet on the ground. |
| Polygon budget | Approximately 5k–20k triangles per shrimp, with about 14 shrimp visible together. |
| Materials | glTF PBR materials are used directly. For translucency, consider `KHR_materials_transmission`, `KHR_materials_volume` and `KHR_materials_clearcoat`. |

## Joint names (bones or nodes)

Animation looks for the following named nodes, which may be skinning bones or parents of rigid parts.
**Rotations are expressed in shrimp space (+Z forward / +Y up) and applied relative to each bone's rest pose**, so Blender bone roll and local axis orientation do not need to match.
Each joint's **pivot must be at its attachment point**.

Missing joints are ignored; a model without pleopods, for example, will still work.

| Name | Part | Parent | Motion |
|---|---|---|---|
| `body` | Cephalothorax | Root | Feeding tilt and gentle walking sway |
| `abdomen_1` … `abdomen_6` | Abdominal segments, front to back | `body` → `abdomen_{n-1}` | Breathing, swimming undulation and turning |
| `telson` | Telson and tail fan | `abdomen_6` | Swimming flexion |
| `antenna_{L,R}_1` … `_4` | Long antenna chains | `body` → previous segment | Exploratory sweeps, turning lag and backward streaming during swimming |
| `antennule_{L,R}_1` … `_2` | Short antennules | `body` → previous segment | Quick flicks |
| `leg_{1..5}_{L,R}_{1..3}` | Five pairs of thoracic legs, three modeled segments each (1 is the root) | `body` → previous segment | Pairs 1–2 search for food; pairs 3–5 walk |
| `pleopod_{1..5}_{L,R}` | Five pairs of abdominal swimmerets | `abdomen_{1..5}` | Gentle fanning and stronger swimming waves |

`L` means the shrimp's own left side (+X).

For foot-target IK on walking legs, optionally add `leg_{3..5}_{L,R}_tip` markers at the feet, parented to the third segment. The first and second joints then bend together to lift the foot while preserving its lateral position, move it forward, and extend it for contact. Models without these markers use the joint-angle animation fallback.

Cherry shrimp have five pairs (10) of thoracic legs. The first two pairs are modified for grasping food; the last three pairs are the main walking legs. Five pairs of abdominal swimmerets are separate from these legs. See [University of Florida's cherry shrimp description](https://ask.ifas.ufl.edu/publication/IN1301).

## Exporting from Blender (example)

1. Orient the model toward -Y (Blender forward), create bones with the names above, and skin the model; alternatively, parent rigid parts to empty objects.
2. Choose `File > Export > glTF 2.0`, select GLB format and enable +Y Up. Exported animations are not required.
3. Optionally optimize: `npx @gltf-transform/cli optimize in.glb public/assets/shrimp/cherry.glb --compress meshopt --texture-compress webp`.

## Model sources

- Sketchfab: search for `cherry shrimp`, `Neocaridina` or `shrimp rigged`. Check each model's license; CC BY requires attribution.
- CGTrader, TurboSquid and Fab: paid rigged models.
- Generative 3D tools such as Hunyuan3D, TRELLIS, Meshy and Tripo may provide a body base, but legs and antennae may need rebuilding.
