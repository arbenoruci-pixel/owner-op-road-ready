import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
// Historic materializers repeatedly copy test fixtures from old releases. Their
// behavioral assertions stay intact; release-label checks compare independent
// app, service-worker and manifest stamps before every legacy verification.
export function syncLegacyReleaseAssertions(path){
 const paths=['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'];
 if(!paths.includes(path))return;
 const app=read('source/src/core/update/appUpdate.js'),sw=read('public/sw.js');
 const marker=(source,name)=>{const matches=[...source.matchAll(new RegExp(`const ${name}\\s*=\\s*['"]([^'"]+)['"]`,'g'))];assert.equal(matches.length,1,'Unique release marker '+name);return matches[0][1];};
 const version=marker(app,'FALLBACK_APP_VERSION');
 assert.equal(marker(sw,'OWNER_OP_SW_VERSION'),version);
 const build=marker(app,'FALLBACK_APP_BUILD');assert.equal(marker(sw,'OWNER_OP_SW_BUILD'),build);
 assert.match(version,/^\d+\.\d+\.\d+$/);assert.match(build,/^[\w.-]+$/);
 for(const file of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(read(file));assert.equal(meta.version,version,file);assert.equal(meta.build,build,file);assert.equal(meta.force,false,file);
 }
 const source=read(path);
 const next=source.replace(/(assert\.equal\(meta\.version,\s*)['"]\d+\.\d+\.\d+['"](?=\))/,(_,prefix)=>prefix+"'"+version+"'")
  .replace(/(assert\.equal\(meta\.build,\s*)['"]v[^'"]+['"](?=\))/,(_,prefix)=>prefix+"'"+build+"'")
  .replace(/(assert\.equal\(JSON\.parse\(read\('public\/app-version\.json'\)\)\.version,\s*)['"]\d+\.\d+\.\d+['"](?=\))/,(_,prefix)=>prefix+"'"+version+"'");
 fs.writeFileSync(path,next);
}
