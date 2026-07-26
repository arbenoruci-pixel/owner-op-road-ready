import fs from 'node:fs';
const VERSION='109.7.11';
const BUILD='v109711-weekly-load-folders';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,v)=>fs.writeFileSync(p,v);
for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.11 Weekly Load Folders',force:true,notes:['Documents opens with weekly folders before load cards.','Merges alias 178564 into Load 424590-1 without deleting original records.','Separates broker, Amazon Relay and legacy completion logic.','Deduplicates by hash, source ID, Outlook attachment ID, blob ID, filename and logical slot before counts.','Adds one-document-at-a-time identity review actions and cleanup migration status.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.11 weekly load folders release applied last');
