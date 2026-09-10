import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after) {
 const source=read(file);if(source.includes(after))return;
 assert.equal(source.split(before).length-1,1,'Wizard 110.3.17 anchor: '+file);
 fs.writeFileSync(file,source.replace(before,after));
}
fs.copyFileSync('scripts/v110317/historicalStatusTailV110317.js','source/src/core/timeline/historicalStatusTailV110317.js');
const raw='source/src/core/compliance/rawRodsChecks.js';
const lockPath='module-locks.v1.json',locks=JSON.parse(read(lockPath));
const hash=()=>crypto.createHash('sha256').update(read(raw)).digest('hex');
const previousHash='07785bc8e4e1f2c62d58370bfd7b64007de7d0b59ccd30fa12a7f5fd5fbd5d73';
if(!read(raw).includes('historicalStatusTailV110317'))assert.equal(hash(),previousHash,'Reviewed raw coverage baseline');
patch(raw,"import { knownMidnightCarry } from '../timeline/knownMidnightCarry.js';","import { knownMidnightCarry } from '../timeline/knownMidnightCarry.js';\nimport { historicalStatusTailV110317 } from '../timeline/historicalStatusTailV110317.js';");
patch(raw,'extendCurrentStatusTailV1036(rawCompleted, {','extendCurrentStatusTailV1036(historicalStatusTailV110317(rawCompleted, !!day && day < today), {');
locks.files[raw]=hash();locks.release='110.3.17';fs.writeFileSync(lockPath,JSON.stringify(locks,null,2)+'\n');
const VERSION='110.3.17',BUILD='v110317-wizard-midnight-coverage';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.17 Wizard midnight coverage',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Wizard, Sign and DOT Check recognize the existing past-day OFF, SB and ON continuation to midnight.','Saved manual event boundaries and signatures remain intact.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.16');assert.equal(meta.build,'v110316-insert-touch-and-midnight');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — Wizard 110.3.17: past-day open status coverage matches Log');
