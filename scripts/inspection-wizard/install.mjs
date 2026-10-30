import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(file,'utf8');
function patch(file,before,after){const source=read(file);if(source.includes(after))return;assert.equal(source.split(before).length,2,'Inspection wizard anchor: '+file+' '+before.slice(0,60));fs.writeFileSync(file,source.replace(before,()=>after));}
const dir='scripts/inspection-wizard/', lib='lib/owner-op-cloud/', ui='source/src/modules/dot/';
for(const [from,to] of [['sync.js',lib+'inspectionSync.js'],['syncState.js',lib+'inspectionSyncState.js'],['readiness.js',ui+'inspectionReadiness.js'],['InspectionWizard.jsx',ui+'InspectionWizard.jsx'],['wizard.css',ui+'inspectionWizard.css']])fs.copyFileSync(dir+from,to);
const api='source/src/modules/logbook/public-api.js';
if(!read(api).includes('export { validateLogForSigning }'))fs.appendFileSync(api,"\nexport { validateLogForSigning } from './signing.js';\n");
const locks=JSON.parse(read('module-locks.v1.json'));locks.files[api]=createHash('sha256').update(read(api)).digest('hex');fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
patch(lib+'accountCoreV110455.js',"'gpsTrip']);","'gpsTrip','dotPreparationReturn']);");
const sync=lib+'accountSyncV110455.js';
patch(sync,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {sameSyncState,retainSyncNavigation} from './inspectionSyncState.js';");
patch(sync,"export function syncAccount({initial=false,choices=null,scope='all'}={}){","export function syncAccount({initial=false,choices=null,scope='all',fresh=false}={}){");
patch(sync,' if(active){',` if(active && fresh){
  requestRecordPriority();
  return active.then(()=>syncAccount({initial,choices,scope,fresh:true}));
 }
 if(active){`);
let source=read(sync);
source=source.replaceAll('!same(window.__rrAccountState?.()||local.state,local.live||local.state)','!sameSyncState(window.__rrAccountState?.()||local.state,local.live||local.state)');
source=source.replace('!same(row?.state,local.savedState)','!sameSyncState(row?.state,local.savedState)');
fs.writeFileSync(sync,source);
patch(sync,'   await db.app_snapshots.put({key:APP_STATE_KEY,state:next.state,updated_at:now});','   next.state=retainSyncNavigation(next.state,window.__rrAccountState?.());\n   await db.app_snapshots.put({key:APP_STATE_KEY,state:next.state,updated_at:now});');
patch(sync,' window.dispatchEvent(new CustomEvent(APPLY_EVENT,{detail:next.state}));',' next.state=retainSyncNavigation(next.state,window.__rrAccountState?.());\n window.dispatchEvent(new CustomEvent(APPLY_EVENT,{detail:next.state}));');
const app='source/src/app/App.jsx';
patch(app,"view:status === 'D' ? 'driveMode' : (base.view === 'driveMode' ? 'day' : base.view),","view:status === 'ON' && /\\bDOT Inspection\\b/i.test([reason,...reasons].join(' ')) ? 'dot' : status === 'D' ? 'driveMode' : (base.view === 'driveMode' ? 'day' : base.view),");
patch(app,"<DotMode state={state} onBack={()=>setState(s=>returnWorkspace(s,'dot','day'))} />",`<DotMode state={state} onBack={()=>setState(s=>({...returnWorkspace(s,'dot','day'),dotPreparationReturn:false}))} onReview={({view='day',day,tab='log'})=>setState(s=>({...s,view,activeDay:day||s.activeDay,sheet:null,dotPreparationReturn:true,roadGuardTabRequest:{tab,at:Date.now()}}))} />`);
patch(app,'  const updateBanner = (\n    <UpdateBanner',`  const updateBanner = (<>
    {state.dotPreparationReturn && state.view!=='dot' ? <button className="inspection-return" onClick={()=>setState(s=>({...s,view:'dot',sheet:null,dotPreparationReturn:false}))}>Return to DOT preparation</button> : null}
    <UpdateBanner`);
patch(app,'      onDismiss={dismissAppUpdate}\n    />\n  );','      onDismiss={dismissAppUpdate}\n    />\n  </>);');
const dot=ui+'DotMode.jsx';
patch(dot,"import { createCurrentInspectionShare } from '../../../../lib/owner-op-cloud/inspectionShare.js';","import InspectionWizard from './InspectionWizard.jsx';");
patch(dot,'export default function DotMode({ state, onBack }) {','export default function DotMode({ state, onBack, onReview }) {');
patch(dot,"const [stage, setStage] = useState('home');","const [stage, setStage] = useState('prepare');");
patch(dot,'  function guardedBack() {',"  function guardedBack() {\n    if(stage==='prepare'){onBack?.();return;}");
patch(dot,"    if (stage !== 'home') {\n      setStage('home');","    if (stage !== 'home') {\n      setStage('prepare');");
source=read(dot);
const start=source.indexOf('  async function emailOfficer() {'),end=source.indexOf('  function copyShortSummary()',start);
if(start>=0){assert.ok(end>start);source=source.slice(0,start)+"  function emailOfficer() {setStage('prepare');}\n\n"+source.slice(end);}
source=source.replace("const title = stage === 'home' ?", "const title = stage === 'prepare' ? 'Prepare DOT inspection' : stage === 'home' ?");
if(!source.includes('<InspectionWizard '))source=source.replace('      <Header title={title} onBack={guardedBack} right="" />','      <Header title={title} onBack={guardedBack} right="" />\n      <div hidden={stage!==\'prepare\'}><InspectionWizard state={state} onReview={onReview} onLocalPreview={beginInspection} onExports={()=>setStage(\'home\')} /></div>');
source=source.replace('<input type="email" autoComplete="email" inputMode="email" value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email" aria-label="Officer email" />','');
source=source.replace('<button className="primary dot-html-share-primary" disabled={officerEmailBusyV11028 || !validOfficerEmailV11028(officerEmail)} onClick={emailOfficer}>{officerEmailBusyV11028 ? \'Preparing secure link…\' : \'Email Logs to Officer\'}</button>','<button className="primary dot-html-share-primary" onClick={emailOfficer}>Prepare officer email</button>');
source=source.replace('The officer can enter an email address. Road Ready creates a private 8-day inspection link and opens an email already addressed to that officer.','Review your records with the preparation wizard, then enter the officer email.');
const from=source.indexOf('          <section className="dot-officer-email-v11028"'),to=source.indexOf('          <div className="dot-officer-summary">',from);
if(from>=0){assert.ok(to>from);source=source.slice(0,from)+'          <button type="button" onClick={guardedBack}>Back to DOT preparation</button>\n\n'+source.slice(to);}
fs.writeFileSync(dot,source);
console.log('PASS — DOT preparation wizard, fresh synchronization and navigation-preserving receive installed');
