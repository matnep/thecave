// Copies three.js and the fonts from node_modules into public/vendor so they ship as static files
// (Cloudflare only uploads ./public). Runs automatically before `npm run dev` and `npm run deploy`.
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';

const OUT = 'public/vendor';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync('node_modules/three/build', `${OUT}/three/build`, { recursive: true, filter: (p) => !p.endsWith('.cjs') && !p.includes('webgpu') && !p.includes('tsl') });
cpSync('node_modules/three/examples/jsm', `${OUT}/three/examples/jsm`, { recursive: true });

for (const font of ['anton', 'vt323', 'ibm-plex-mono']) {
  const src = `node_modules/@fontsource/${font}`;
  const dst = `${OUT}/@fontsource/${font}`;
  mkdirSync(`${dst}/files`, { recursive: true });
  cpSync(`${src}/400.css`, `${dst}/400.css`);
  // only the files 400.css can reference
  for (const f of readdirSync(`${src}/files`)) if (f.includes('-400-normal.')) cpSync(`${src}/files/${f}`, `${dst}/files/${f}`);
}
console.log('vendor files copied to', OUT);
