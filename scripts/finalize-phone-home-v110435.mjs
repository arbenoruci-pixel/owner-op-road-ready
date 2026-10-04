import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Phone home anchor changed: '+p+' / '+b.slice(0,80));fs.writeFileSync(p,s.replace(b,a));}
fs.copyFileSync('scripts/v110435/AdaptiveHome.jsx','source/src/modules/home/AdaptiveHomeV1038.jsx');
for(const name of ['PhoneHomeTools','ImportDocumentsScreen'])fs.copyFileSync('scripts/v110435/'+name+'.jsx','source/src/modules/home/'+name+'V110435.jsx');
fs.copyFileSync('scripts/v110435/phone-home.css','source/src/phone-home-v110435.css');
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"import AdaptiveHomeV1038", "import '../../phone-home-v110435.css';\nimport {AppIcon} from './PhoneHomeToolsV110435.jsx';\nimport ImportDocumentsScreen from './ImportDocumentsScreenV110435.jsx';\nimport AdaptiveHomeV1038");
patch(home,"  const ownerOsSectionsV102 =", "  if(businessSection==='import_documents')return <ImportDocumentsScreen onBack={()=>setBusinessSection('')} onBackup={onOpenBackup}/>;\n\n  const ownerOsSectionsV102 =");
patch(home,'className="screen command-home-screen"','className="screen command-home-screen phone-home-v435"');
patch(home,"{modeLabel(operatorProfile.mode)} · App v110.4.34", "{operatorProfile.companyName || operatorProfile.carrierName || 'Your workspace'}");
patch(home,'<button type="button" className="command-scan-btn" onClick={() => { setScanPreferredType(\'auto\'); setScanOpen(true); }}><Icon name="scan" size={19} /><span>Scan</span></button>','<button type="button" className="phone-settings" onClick={()=>setSetupOpen(true)} aria-label="Settings"><AppIcon name="settings"/></button>');
const exportEntry='      <button type="button" className="rr-export-entry" onClick={onOpenBackup}><span><b>Export & Backup</b><small>Documents · Logbook · Loads · Everything</small></span><span aria-hidden="true">↗</span></button>\n';
fs.writeFileSync(home,read(home).replace(exportEntry,''));
patch(home,'        onOpenSection={setBusinessSection}','        onOpenBackup={onOpenBackup}\n        onOpenDrive={()=>onOpenDrive?onOpenDrive():onOpenStatus?.()}\n        onOpenSection={setBusinessSection}');
let h=read(home);const start=h.indexOf('      {logbookEnabled ? (\n        <nav className="command-bottom-nav"');
if(start!==-1){const end=h.indexOf('\n    </section>',start);if(end===-1)throw Error('Missing home footer boundary');h=h.slice(0,start)+'      <footer className="phone-home-footer">v110.4.35</footer>'+h.slice(end);fs.writeFileSync(home,h);}
else if(!h.includes('phone-home-footer'))throw Error('Missing old navigation boundary');
const day='source/src/modules/logbook/DayLogScreen.jsx';
const dayBaseline='7e97caea74baa25c2453cfdad5765539cbbd9f18fc7ab2bb9524d235106739dc';
const dayReviewed='b8603f5a8b5bb9f857c4eb19783c455b44f9496d9d5fef2861aa35d68c567634';
const dayHash=()=>createHash('sha256').update(read(day)).digest('hex');
if(![dayBaseline,dayReviewed].includes(dayHash()))throw Error('Unexpected day-screen baseline before reviewed visual-only patch');
patch(day,'screen active graph-first-screen logbook-ui-v110 ${','screen active graph-first-screen logbook-ui-v110 phone-day-v435 ${');
patch(day,'Home terminal time: {tz.label} ({tz.timeZone} · {tz.shortLabel})','Home terminal · {tz.shortLabel} · {tz.timeZone}');
if(dayHash()!==dayReviewed)throw Error('Day-screen visual patch does not match reviewed output');
const events='source/src/modules/logbook/EventList.jsx';
patch(events,'Today stays clean. Events appear as you create them.','No entries for this driver and day. Saved logbook copies are in Documents.');
for(const p of ['scripts/browser-ratecon-one-way-v11029.mjs','scripts/browser-persistent-guide-v110311.mjs','scripts/browser-saved-scan-recovery-v110312.mjs'])fs.writeFileSync(p,read(p).replaceAll(".adaptive-no-load-v1038",".phone-app-grid").replaceAll('/Ready for the next Rate Con/','/Smart Scan/'));
// Scope only visual chrome. No profile, duty, signature, payment or document migration.
const VERSION='110.4.35',BUILD='v110435-phone-home';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.35 Phone home',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['A compact home with one icon for each everyday tool.','Direct import entry with clear document versus device-backup guidance.','Compact logbook controls without changing recorded duty data.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.34'","'"+VERSION+"'").replaceAll("'v110434-smart-load-library'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));if(![dayBaseline,dayReviewed].includes(locks.files[day]))throw Error('Unexpected day-screen lock');locks.files[day]=dayReviewed;locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.35 compact phone home and direct import navigation');

await import('./finalize-import-broker-review-v110436.mjs');
