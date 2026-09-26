# Reference photo

`Neocaridina_heteropoda_female.png`

- Source: https://commons.wikimedia.org/wiki/File:Neocaridina_heteropoda_female.png
- Author: Pedro Doria Meunier
- License: Public domain

Used by `tools/shrimp-profile/extract.mjs` to derive:

- `src/entities/shrimp/cherryProfile.json` — lateral body profile (centerline + height along the body)
- `public/assets/shrimp/cherry-side.png` — side texture unrolled into (s, t) space

Re-run after changing the ROI / thresholds:

```sh
node tools/shrimp-profile/extract.mjs --debug /tmp/profile-debug
```
