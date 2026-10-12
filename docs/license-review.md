# License review (2026-10-12)

This review covers repository images, models and shaders, and the main third-party libraries included in the published JavaScript. It does not cover assets added in the future.

## Assets

| Asset | Finding |
|---|---|
| `assets-src/shrimp/Neocaridina_heteropoda_female.png` | Photograph by Pedro Doria Meunier. The [source page](https://commons.wikimedia.org/wiki/File:Neocaridina_heteropoda_female.png) records the author's worldwide public-domain dedication and unconditional permission where such a dedication is not legally possible, except conditions required by law. The source SHA-1 matches the local file. |
| `public/assets/shrimp/cherry-side.png` / `docs/assets/shrimp/cherry-side.png` | Texture generated from that photograph by `tools/shrimp-profile/extract.mjs`. No modification or redistribution restrictions were found in the original photograph's permission statement. |
| `src/entities/shrimp/cherryProfile.json` / procedural shrimp | Uses the outline extracted from that photograph and this project's geometry code. |
| Rocks, driftwood, substrate and environment lighting | Generated procedurally. Environment lighting uses three.js `RoomEnvironment`, without external HDR photographs. |
| `docs/images/overview.png` | Its content and addition history indicate an app screenshot. The original capture record is unavailable. The unresolved shader permission below may also affect this image. |
| `public/assets/shrimp/cherry.glb` | Not currently present. The glTF loading feature remains, but no external model is bundled. |

## Unresolved permission: caustic shader

The comment on `causticPattern` in `src/materials/water.ts` identifies joltz0r / Dave_Hoskins as its source. The repository contains neither the original license nor explicit permission for that implementation.

A related candidate source is [Tileable Water Caustic](https://www.shadertoy.com/view/MdlXz8). That page and Shadertoy's terms could not be retrieved during this review, so the author's license could not be verified. This code cannot currently be confirmed as MIT-licensed. Establishing its distribution conditions requires checking the original permission and adding any required notices or conditions, or replacing it with an implementation whose provenance is clear. The caustic implementation has been left unchanged at the user's request.

## Published license notices

three.js and lil-gui use MIT licenses, as does meshoptimizer, the glTF compression decoder. The MaterialX noise code in three.js includes an Apache-2.0 disclaimer. The Vite modulepreload polyfill is also accompanied by Vite's MIT notice.

Their full license texts, copyright notices and the shrimp photograph's provenance are collected in `public/THIRD-PARTY-LICENSES.txt`. Vite copies this file to `docs/THIRD-PARTY-LICENSES.txt` during builds. The project's own MIT license is included too.

Development tools such as TypeScript, Playwright and pngjs are not included in the published app bundle. If redistributing the development environment or `node_modules`, retain each package's bundled license notices.
