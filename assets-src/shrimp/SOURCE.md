# Reference photo

`Neocaridina_heteropoda_female.png`

- Source: https://commons.wikimedia.org/wiki/File:Neocaridina_heteropoda_female.png
- Author: Pedro Doria Meunier
- License: Public domain
- Verified: 2026-10-12. The source page records the author's worldwide public-domain dedication and fallback permission to use the work for any purpose without conditions (except those required by law).
- Original SHA-1: `2f39786f8764c0f5d294c48a3bbf346f4a9688e2` (matches the local file).

Used by `tools/shrimp-profile/extract.mjs` to derive:

- `src/entities/shrimp/cherryProfile.json` — lateral body profile (centerline + height along the body)
- `public/assets/shrimp/cherry-side.png` — side texture unrolled into (s, t) space

Re-run after changing the ROI / thresholds:

```sh
node tools/shrimp-profile/extract.mjs --debug /tmp/profile-debug
```
