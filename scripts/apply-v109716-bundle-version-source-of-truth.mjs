import fs from 'node:fs';

const updatePath='source/src/core/update/appUpdate.js';
let src=fs.readFileSync(updatePath,'utf8');
const version='109.7.16';

src=src.replace(/const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/, `const FALLBACK_APP_VERSION = '${version}';`);
src=src.replace(/export const CURRENT_APP_VERSION\s*=\s*String\([\s\S]*?\)\.trim\(\)\s*\|\|\s*FALLBACK_APP_VERSION;/, `export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;`);
if(!src.includes(`const FALLBACK_APP_VERSION = '${version}';`)) throw new Error('Could not set bundled release version');
if(!src.includes('export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;')) throw new Error('Could not remove stale environment version override');
fs.writeFileSync(updatePath,src);

const now=new Date().toISOString();
fs.writeFileSync('public/app-version.json',JSON.stringify({
  version,
  build:'v109716-bundle-version-source-of-truth',
  releasedAt:now,
  updatedAt:now,
  label:'v109.7.16 Bundle Version Source of Truth',
  force:true,
  notes:[
    'The compiled app version now comes from the final release script instead of a stale Vercel environment value.',
    'The installed app header and remote release manifest must show the same version.',
    'The iPhone hard update bridge remains active and preserves logs and documents.'
  ]
},null,2)+'\n');
console.log('PASS — v109.7.16 bundled version source of truth applied last');
