// Download a Sketchfab model's glTF archive and unpack it under incoming/<name>/.
// Usage: node scripts/fetch-sketchfab.mjs <uid> <name>
// Token: $SKETCHFAB_TOKEN or ~/.config/sketchfab-token (Sketchfab → Settings → Password & API).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [uid, name] = process.argv.slice(2);
if (!uid || !name) {
  console.error('usage: node scripts/fetch-sketchfab.mjs <uid> <name>');
  process.exit(2);
}
let token = process.env.SKETCHFAB_TOKEN;
if (!token) {
  try {
    token = readFileSync(join(homedir(), '.config', 'sketchfab-token'), 'utf8').trim();
  } catch {
    console.error('No token: set SKETCHFAB_TOKEN or write it to ~/.config/sketchfab-token');
    process.exit(2);
  }
}

const meta = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}`)).json();
console.log(`${meta.name} — ${meta.user?.username} — ${meta.license?.label}`);

const res = await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, { headers: { Authorization: `Token ${token}` } });
if (!res.ok) {
  console.error(`download endpoint: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const links = await res.json();
const gltf = links.gltf ?? links.glb;
if (!gltf?.url) {
  console.error(`no glTF archive offered: ${Object.keys(links).join(', ')}`);
  process.exit(1);
}

const outDir = join('incoming', name);
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, 'archive.zip');
writeFileSync(zipPath, Buffer.from(await (await fetch(gltf.url)).arrayBuffer()));
execFileSync('unzip', ['-o', '-q', zipPath, '-d', outDir]);
// Keep license/attribution next to the asset.
writeFileSync(
  join(outDir, 'SOURCE.md'),
  `# ${meta.name}\n\n- Source: ${meta.viewerUrl}\n- Author: ${meta.user?.displayName} (${meta.user?.profileUrl})\n- License: ${meta.license?.label} (${meta.license?.url ?? ''})\n`,
);
console.log(`saved to ${outDir} (${(gltf.size / 1e6).toFixed(1)} MB)`);
