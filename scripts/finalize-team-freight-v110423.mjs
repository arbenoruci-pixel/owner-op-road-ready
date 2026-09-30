import './v110423/install.mjs';
import fs from 'node:fs';
const VERSION='110.4.23',BUILD='v110423-team-mileage-freight',stamp=new Date().toISOString();
const read=p=>fs.readFileSync(p,'utf8');
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.23 Team mileage and freight',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep daily driving miles separate for each team driver.','Share recorded pickup and delivery evidence across team forms.','Preserve the freight pickup city and stop completed loads after delivery day.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.22'","'"+VERSION+"'").replaceAll("'v110422-delivery-order-ai'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
