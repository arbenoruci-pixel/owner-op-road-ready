import fs from 'node:fs';import assert from 'node:assert/strict';
const own='source/src/modules/owneros/',home='source/src/modules/home/';
for(const [a,b]of [['core.js','manualLoadCore.js'],['runtime.js','manualLoadRuntime.js'],['ManualLoadForm.jsx','ManualLoadForm.jsx'],['ManualDocument.jsx','ManualDocument.jsx'],['LoadControls.jsx','LoadControls.jsx'],['manual.css','manualLoads.css']])fs.copyFileSync('scripts/manual-loads/'+a,own+b);
fs.copyFileSync('scripts/manual-loads/ActiveFolderCard.jsx',home+'ActiveFolderCard.jsx');
function patch(path,a,b){let s=fs.readFileSync(path,'utf8');if(s.includes(b))return;assert.equal(s.split(a).length,2,'Manual folder anchor: '+a.slice(0,100));fs.writeFileSync(path,s.replace(a,()=>b));}
const folder=own+'SmartLoadFolders.jsx',dash=home+'DriverDashboard.jsx';
patch(folder,"'use client';",`'use client';
import ManualLoadForm from './ManualLoadForm.jsx';
import ManualDocument from './ManualDocument.jsx';
import LoadControls from './LoadControls.jsx';
import './manualLoads.css';`);
patch(folder," const [selected,setSelected]", " const [creating,setCreating]=useState(false),[manual,setManual]=useState(null);\n const [selected,setSelected]");
patch(folder," if(advanced)return",` const savedLoad=folder&&!folder.shipment?(businessStore.loads||[]).find(l=>l.id===folder.source.id):null;
 if(creating)return <ManualLoadForm onClose={()=>setCreating(false)} onSaved={load=>{setCreating(false);setSelected('load:'+load.loadNo);setRevision(v=>v+1);}}/>;
 if(manual)return <ManualDocument state={state} target={manual.target} type={manual.type} onClose={()=>{setManual(null);setRevision(v=>v+1);}}/>;
 if(advanced)return`);
patch(folder,'   <div className="rr-smart-checklist">',`   {savedLoad?<><LoadControls load={savedLoad} onChange={()=>setRevision(v=>v+1)}/><section className="rr-manual-type-actions" aria-label="Add documents manually">{[['rate_confirmation','Ratecon'],['bol','Pickup BOL'],['pod','POD'],['fuel_receipt','Fuel receipt']].map(([type,label])=><button type="button" key={type} onClick={()=>setManual({type,target:{id:savedLoad.id,loadNo:savedLoad.loadNo||savedLoad.canonicalLoadNo,broker:savedLoad.broker}})}>+ {label} manually</button>)}</section></>:null}
   <div className="rr-smart-checklist">`);
patch(folder,'   <h2>Load folders</h2>','   <h2>Load folders</h2><button type="button" className="rr-smart-add" onClick={()=>setCreating(true)}>+ New load manually</button>');
patch(dash,"'use client';",`'use client';
import ActiveFolderCard,{openActiveFolder} from './ActiveFolderCard.jsx';
import ManualLoadForm from '../owneros/ManualLoadForm.jsx';
import '../owneros/manualLoads.css';`);
patch(dash,' const [missionOpen,setMissionOpen]', ' const [creatingManual,setCreatingManual]=useState(false);\n const [missionOpen,setMissionOpen]');
patch(dash,' if(missionOpen)return',` if(creatingManual)return <ManualLoadForm onClose={()=>setCreatingManual(false)} onSaved={load=>{setCreatingManual(false);requestLoadFolder(load.loadNo);goSection('load_documents');}}/>;
 if(missionOpen)return`);
patch(dash,'  {savedScan?<aside',`  <ActiveFolderCard store={businessStore} state={state} onOpen={()=>goSection('load_documents')} onCreate={()=>setCreatingManual(true)}/>
  {savedScan?<aside`);
patch(dash,'onActive:()=>setMissionOpen(true)','onActive:()=>openActiveFolder(businessStore,state,()=>goSection(\'load_documents\'),()=>setCreatingManual(true))');
console.log('PASS manual folder creation, explicit filing and Home active access installed');
