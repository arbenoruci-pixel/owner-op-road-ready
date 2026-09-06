import fs from 'node:fs';
const VERSION='110.0.0',BUILD='v110000-owner-op-private-cloud';
const wallet='source/src/modules/wallet/DigitalWalletScreen.jsx';
let src=fs.readFileSync(wallet,'utf8');
if(!src.includes("from '../cloud/CloudLaunchBar.jsx'"))src="import CloudLaunchBar from '../cloud/CloudLaunchBar.jsx';\n"+src;
if(!src.includes('<CloudLaunchBar state={state} />')){
 const anchor='<WalletOverview summary={summary} onEditDoc={setEditingDocId} />';
 if(!src.includes(anchor))throw new Error('Wallet cloud integration anchor missing');
 src=src.replace(anchor,'<CloudLaunchBar state={state} />\n      '+anchor);
}
fs.writeFileSync(wallet,src);
fs.writeFileSync('app/road-ready-client.jsx',"'use client';\nimport App from '../source/src/App.jsx';\nimport CloudBackupAgent from '../source/src/modules/cloud/CloudBackupAgent.jsx';\nexport default function RoadReadyClient(){return <><App/><CloudBackupAgent/></>;}\n");
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Private cloud wallet and inspection records'},null,2)+'\n');
const previous=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
fs.writeFileSync('public/app-version.json',JSON.stringify({...previous,version:VERSION,build:BUILD,label:'Private cloud wallet and inspection records',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),force:false,notes:['Private Owner Operator cloud schema and document storage.','Eight-day read-only officer package with expiring, revocable links.','Compressed immutable log archives, conflict checks, and local-data preservation.']},null,2)+'\n');
const update='source/src/core/update/appUpdate.js';let code=fs.readFileSync(update,'utf8');
code=code.replace(/const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');
fs.writeFileSync(update,code);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION);fs.writeFileSync(p,s);}
console.log('PASS — isolated Owner Operator cloud UI assembled; Tepiha files/settings untouched');
