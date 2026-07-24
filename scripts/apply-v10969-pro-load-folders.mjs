import fs from 'node:fs';

const VERSION = '109.6.9';
const BUILD = 'v10969-pro-load-folders';
const SCREEN = 'source/src/modules/owneros/OwnerOperatorOSV102.jsx';
const CSS = 'source/src/road-ready-2026.css';

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }
function replaceRequired(source,before,after,label){
  if(source.includes(after)) return source;
  if(!source.includes(before)) throw new Error(`v109.6.9 missing ${label}`);
  return source.replace(before,after);
}

write('source/src/modules/owneros/loadFolderEngineV10969.js', String.raw`export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '109.6.9';

function text(value=''){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function upper(value=''){ return text(value).toUpperCase(); }
function num(value=0){ const n=Number(value); return Number.isFinite(n)?n:0; }
function date(value=''){ return text(value).slice(0,10); }
function unique(values=[]){ return [...new Set(values.filter(Boolean))]; }
function docType(doc={}){ return text(doc.document_type || doc.type || doc.classification?.selectedType || doc.extracted?.type || doc.metadata?.relationType).toLowerCase(); }
function docLoad(doc={}){ return upper(doc.load_no || doc.loadNo || doc.canonicalLoadNo || doc.extracted?.canonicalLoadNo || doc.extracted?.loadNo || doc.metadata?.loadNo); }
function docDay(doc={}){ return date(doc.vaultDate || doc.document_date || doc.documentDate || doc.extracted?.documentDate || doc.extracted?.date || doc.created_at); }
function docStop(doc={}){ return num(doc.stopSequence || doc.stop_sequence || doc.extracted?.stopSequence || doc.metadata?.stopSequence); }
function place(city='',state=''){ return [text(city),upper(state).slice(0,2)].filter(Boolean).join(', '); }

function loadEvents(state={},loadNo=''){
  const target=upper(loadNo);
  return Object.entries(state.eventsByDay||{}).flatMap(([day,events])=>(events||[]).filter(event=>{
    const refs=[event.loadNo,event.shippingDocs,event.orderNo,event.pickedUpLoadNo,event.deliveredLoadNo].map(upper);
    return refs.includes(target);
  }).map(event=>({...event,day})));
}
function loadRouteLegs(state={},loadNo=''){
  const target=upper(loadNo);
  return Object.entries(state.routeLegsByDay||{}).flatMap(([day,legs])=>(legs||[]).filter(leg=>upper(leg.loadNo||leg.orderNo||leg.shippingDocs)===target).map(leg=>({...leg,day})));
}
function deliveryStops(load={},legs=[]){
  const fromLoad=(load.stops||[]).filter(stop=>stop.type==='delivery');
  if(fromLoad.length) return fromLoad.map((stop,index)=>({
    sequence:num(stop.deliverySequence||stop.stopSequence||stop.sequence||index+1),
    company:text(stop.company||stop.facility||stop.name),
    city:text(stop.city||stop.deliveryCity), state:upper(stop.state||stop.deliveryState).slice(0,2),
    address:text(stop.address), appointment:text(stop.appointment||stop.time),
  })).sort((a,b)=>a.sequence-b.sequence);
  return legs.filter(leg=>num(leg.stopSequence)>1 && text(leg.stopCompany)!=='Discount Tire Elgin — Empty Return').map((leg,index)=>({
    sequence:num(leg.stopSequence||index+1), company:text(leg.stopCompany), city:text(leg.toCity), state:upper(leg.toState).slice(0,2), address:text(leg.stopAddress), appointment:text(leg.appointment),
  })).sort((a,b)=>a.sequence-b.sequence);
}
function mileageEvidence(state={},days=[]){
  const manual=state.manualMilesByDay||state.dailyMilesByDay||{};
  return days.some(day=>num(manual[day])>0 || num(manual[day]?.total)>0 || (manual[day]?.segments||[]).length>0);
}
function fuelRowsForLoad(businessStore={},loadNo='',days=[]){
  const target=upper(loadNo);
  return (businessStore.fuel||[]).filter(row=>{
    const linked=upper(row.loadNo)===target;
    const onDay=days.includes(date(row.date));
    return linked || (!row.loadNo && onDay);
  });
}
function expenseRowsForLoad(businessStore={},loadNo='',days=[]){
  const target=upper(loadNo);
  return (businessStore.expenses||[]).filter(row=>upper(row.loadNo)===target || (!row.loadNo && days.includes(date(row.date))));
}

export function buildLoadFoldersV10969({loads=[],documents=[],state={},businessStore={}}={}){
  const loadMap=new Map();
  for(const load of loads||[]){ const no=upper(load.loadNo||load.canonicalLoadNo); if(no) loadMap.set(no,{...load,loadNo:no}); }
  for(const doc of documents||[]){ const no=docLoad(doc); if(no && !loadMap.has(no)) loadMap.set(no,{id:`load_${no}`,loadNo:no,status:'needs_review'}); }
  for(const [day,legs] of Object.entries(state.routeLegsByDay||{})) for(const leg of legs||[]){ const no=upper(leg.loadNo||leg.orderNo||leg.shippingDocs); if(no && !loadMap.has(no)) loadMap.set(no,{id:`load_${no}`,loadNo:no,status:'tracked'}); }

  return [...loadMap.values()].map(load=>{
    const loadNo=upper(load.loadNo);
    const docs=(documents||[]).filter(doc=>docLoad(doc)===loadNo);
    const events=loadEvents(state,loadNo);
    const legs=loadRouteLegs(state,loadNo);
    const stops=deliveryStops(load,legs);
    const days=unique([...events.map(e=>e.day),...legs.map(l=>l.day),...docs.map(docDay)]).sort();
    const rateCons=docs.filter(doc=>['rate_confirmation','load_tender'].includes(docType(doc)));
    const bols=docs.filter(doc=>docType(doc)==='bol');
    const pods=docs.filter(doc=>['pod','delivery_receipt'].includes(docType(doc)));
    const fuelDocs=docs.filter(doc=>docType(doc)==='fuel_receipt');
    const tollDocs=docs.filter(doc=>['toll_parking_receipt','toll_receipt'].includes(docType(doc)));
    const fuelRows=fuelRowsForLoad(businessStore,loadNo,days);
    const expenses=expenseRowsForLoad(businessStore,loadNo,days);
    const podByStop=new Map();
    pods.forEach(doc=>{ const seq=docStop(doc); if(seq) podByStop.set(seq,doc); });
    const unassignedPods=pods.filter(doc=>!docStop(doc));
    const missingStops=stops.filter(stop=>!podByStop.has(stop.sequence));
    const podComplete=stops.length ? pods.length>=stops.length && missingStops.length<=unassignedPods.length : pods.length>0;
    const logbookComplete=events.length>0;
    const milesComplete=mileageEvidence(state,days);
    const fuelActivity=fuelRows.length>0;
    const fuelComplete=!fuelActivity || fuelDocs.length>0 || fuelRows.every(row=>row.receiptAttached===true);
    const required=[
      {id:'rate',label:'Rate Confirmation',complete:rateCons.length>0,required:true,detail:rateCons.length?`${rateCons.length} saved`:'Required to define the load'},
      {id:'bol',label:'Bill of Lading',complete:bols.length>0,required:true,detail:bols.length?`${bols.length} saved`:'Pickup paperwork missing'},
      {id:'pod',label:'Proof of Delivery',complete:podComplete,required:true,detail:stops.length?`${pods.length} of ${stops.length} stops`:`${pods.length} saved`},
      {id:'logbook',label:'Supporting Logbook',complete:logbookComplete,required:true,detail:logbookComplete?`${days.length} linked day${days.length===1?'':'s'}`:'No exact load events linked'},
      {id:'miles',label:'Daily Driving Miles',complete:milesComplete,required:true,detail:milesComplete?'Mileage saved':'Add total miles for load days'},
      {id:'fuel',label:'Fuel Receipt',complete:fuelComplete,required:fuelActivity,optional:!fuelActivity,detail:fuelActivity?(fuelComplete?'Fuel evidence attached':'Fuel transaction found — receipt missing'):'No fuel activity detected'},
    ];
    const completeCount=required.filter(item=>item.complete).length;
    const requiredCount=required.filter(item=>item.required).length;
    const requiredComplete=required.filter(item=>item.required&&item.complete).length;
    const percent=Math.round((completeCount/required.length)*100);
    const missing=required.filter(item=>item.required&&!item.complete);
    const origin=text(load.origin)||place(legs[0]?.fromCity,legs[0]?.fromState);
    const destination=text(load.destination)||place(legs.at(-1)?.toCity,legs.at(-1)?.toState);
    const title=[origin,destination].filter(Boolean).join(' → ') || `Load ${loadNo}`;
    return {
      id:load.id||`load_${loadNo}`,loadNo,title,origin,destination,broker:text(load.broker),status:missing.length?'needs_attention':'complete',
      percent,missing,checklist:required,documents:docs,events,legs,stops,pods,bols,rateCons,fuelDocs,fuelRows,expenses,days,
      missingStops,unassignedPods,requiredCount,requiredComplete,
      counts:{documents:docs.length,stops:stops.length,pods:pods.length,bols:bols.length,rateCons:rateCons.length,fuel:fuelDocs.length},
    };
  }).sort((a,b)=>{
    if(a.status!==b.status) return a.status==='needs_attention'?-1:1;
    return (b.days.at(-1)||'').localeCompare(a.days.at(-1)||'') || b.loadNo.localeCompare(a.loadNo);
  });
}
`);

let screen=read(SCREEN);
screen=replaceRequired(screen,
  "import { buildAuditPacketPdfV102, buildBillingPacketPdfV102, buildInvoicePdfV102 } from './ownerOpsPdfV102.js';",
  "import { buildAuditPacketPdfV102, buildBillingPacketPdfV102, buildInvoicePdfV102 } from './ownerOpsPdfV102.js';\nimport { buildLoadFoldersV10969 } from './loadFolderEngineV10969.js';",
  'load folder engine import');
screen=replaceRequired(screen,
  "  const [docType, setDocType] = useState('');\n  const [selectedLoadNo, setSelectedLoadNo] = useState(activeLoadNo(state));",
  "  const [docType, setDocType] = useState('');\n  const [folderQuery, setFolderQuery] = useState('');\n  const [openFolderNo, setOpenFolderNo] = useState('');\n  const [selectedLoadNo, setSelectedLoadNo] = useState(activeLoadNo(state));",
  'folder states');
screen=replaceRequired(screen,
  "  const docTypes = useMemo(()=>[...new Set(documents.map(vaultDocumentTypeV102).filter(Boolean))].sort(),[documents]);\n  const invoices = ownerStore.invoices || [];",
  "  const docTypes = useMemo(()=>[...new Set(documents.map(vaultDocumentTypeV102).filter(Boolean))].sort(),[documents]);\n  const loadFoldersV10969 = useMemo(()=>buildLoadFoldersV10969({ loads,documents,state,businessStore }),[loads,documents,state,businessStore]);\n  const filteredFoldersV10969 = useMemo(()=>{ const q=text(folderQuery).toLowerCase(); return !q?loadFoldersV10969:loadFoldersV10969.filter(folder=>[folder.loadNo,folder.title,folder.broker,...folder.days].join(' ').toLowerCase().includes(q)); },[loadFoldersV10969,folderQuery]);\n  const openFolderV10969 = loadFoldersV10969.find(folder=>folder.loadNo===openFolderNo) || null;\n  const invoices = ownerStore.invoices || [];",
  'folder derived data');

const documentsPattern=/        \{tab==='documents' && <>[\s\S]*?        <\/\>}\n\n        \{tab==='billing'/;
const documentsReplacement=String.raw`        {tab==='documents' && <>
          {!openFolderV10969 ? <>
            <SectionHead eyebrow="Load folders" title={`${loadFoldersV10969.length} organized load folder${loadFoldersV10969.length===1?'':'s'}`} action={onScan} actionLabel="+ Add document" />
            <div className="load-folder-summary-v10969">
              <div><b>{loadFoldersV10969.filter(folder=>folder.status==='complete').length}</b><span>Complete</span></div>
              <div className="attention"><b>{loadFoldersV10969.filter(folder=>folder.status==='needs_attention').length}</b><span>Need attention</span></div>
              <div><b>{documents.length}</b><span>Original files</span></div>
            </div>
            <div className="load-folder-search-v10969"><input value={folderQuery} onChange={event=>setFolderQuery(event.target.value)} placeholder="Search load, route, broker or date…"/></div>
            {loadingDocs?<div className="owner-os-loading-v102">Building smart load folders…</div>:filteredFoldersV10969.length?<div className="load-folder-grid-v10969">{filteredFoldersV10969.map(folder=><button type="button" className={`load-folder-card-v10969 ${folder.status}`} key={folder.loadNo} onClick={()=>setOpenFolderNo(folder.loadNo)}>
              <header><div><span>LOAD FOLDER</span><b>Load {folder.loadNo}</b></div><i>{folder.status==='complete'?'✓':'!'}</i></header>
              <h3>{folder.title}</h3>
              <p>{folder.broker || 'Broker not confirmed'}{folder.days.length?` · ${folder.days[0]}${folder.days.length>1?`–${folder.days.at(-1)}`:''}`:''}</p>
              <div className="load-folder-progress-v10969"><span><i style={{width:`${folder.percent}%`}}/></span><b>{folder.percent}%</b></div>
              <div className="load-folder-counts-v10969"><span>{folder.counts.stops} stops</span><span>{folder.counts.bols} BOL</span><span className={folder.counts.pods<folder.counts.stops?'missing':''}>{folder.counts.pods}/{folder.counts.stops||folder.counts.pods} POD</span><span>{folder.counts.documents} files</span></div>
              {folder.missing.length?<footer><b>{folder.missing.length} item{folder.missing.length===1?'':'s'} missing</b><em>{folder.missing.slice(0,2).map(item=>item.label).join(' · ')}</em></footer>:<footer className="ready"><b>Load complete</b><em>Documents and evidence are organized</em></footer>}
            </button>)}</div>:<Empty title="No load folders yet" detail="Scan a Rate Confirmation to create a load folder. BOLs, PODs, logbook days and receipts will organize automatically." action={onScan} actionLabel="Scan Rate Confirmation"/>}
          </> : <section className="load-folder-detail-v10969">
            <button type="button" className="load-folder-back-v10969" onClick={()=>setOpenFolderNo('')}>‹ All load folders</button>
            <header className={`load-folder-detail-head-v10969 ${openFolderV10969.status}`}><div><span>LOAD {openFolderV10969.loadNo}</span><h2>{openFolderV10969.title}</h2><p>{openFolderV10969.broker || 'Broker not confirmed'}</p></div><strong>{openFolderV10969.percent}%<small>{openFolderV10969.status==='complete'?'COMPLETE':'READY SCORE'}</small></strong></header>
            {openFolderV10969.missing.length?<div className="load-folder-alert-v10969"><i>!</i><div><b>{openFolderV10969.missing.length} item{openFolderV10969.missing.length===1?'':'s'} need attention</b><span>{openFolderV10969.missing.map(item=>item.label).join(' · ')}</span></div><button type="button" onClick={onScan}>Add</button></div>:<div className="load-folder-complete-v10969"><i>✓</i><div><b>This load is complete</b><span>Required documents, logbook evidence and mileage are present.</span></div></div>}
            <div className="load-folder-checklist-v10969">{openFolderV10969.checklist.map(item=><article key={item.id} className={item.complete?'done':item.required?'missing':'optional'}><i>{item.complete?'✓':item.required?'!':'○'}</i><div><b>{item.label}</b><span>{item.detail}</span></div>{!item.complete&&item.required?<button type="button" onClick={item.id==='logbook'?onOpenLog:onScan}>{item.id==='logbook'?'Open':'Add'}</button>:null}</article>)}</div>
            {openFolderV10969.stops.length?<><SectionHead eyebrow="Delivery proof" title={`${openFolderV10969.pods.length} of ${openFolderV10969.stops.length} PODs matched`} /><div className="load-folder-stops-v10969">{openFolderV10969.stops.map(stop=>{ const matched=openFolderV10969.pods.find(doc=>Number(doc.stopSequence||doc.stop_sequence||doc.extracted?.stopSequence||0)===Number(stop.sequence)); return <article key={stop.sequence} className={matched?'done':'missing'}><i>{matched?'✓':'!'}</i><div><span>STOP {stop.sequence}</span><b>{stop.company||[stop.city,stop.state].filter(Boolean).join(', ')||`Delivery stop ${stop.sequence}`}</b><em>{[stop.city,stop.state].filter(Boolean).join(', ')}{stop.appointment?` · ${stop.appointment}`:''}</em></div>{matched?<button type="button" onClick={()=>openVaultDocumentV102(matched)}>Open POD</button>:<button type="button" onClick={onScan}>Add POD</button>}</article>; })}</div></>:null}
            <SectionHead eyebrow="Folder documents" title={`${openFolderV10969.documents.length} original file${openFolderV10969.documents.length===1?'':'s'}`} action={onScan} actionLabel="+ Add" />
            <div className="load-folder-docs-v10969">{openFolderV10969.documents.map(document=><article key={document.local_id||document.id}><div className="owner-os-doc-icon-v102">{vaultDocumentTypeV102(document).slice(0,3).toUpperCase()}</div><div><span>{vaultDocumentLabelV102(document)}</span><b>{document.title||document.original_file_name}</b><em>{dateLabel(document.vaultDate||document.documentDate||document.created_at)}</em></div><button type="button" onClick={()=>openVaultDocumentV102(document)}>Open</button></article>)}</div>
            <div className="load-folder-actions-v10969"><button type="button" onClick={onOpenLog}>Open supporting logbook</button><button type="button" onClick={onScan}>Scan / add document</button><button type="button" className="primary" disabled={openFolderV10969.status!=='complete'} onClick={()=>{ setSelectedLoadNo(openFolderV10969.loadNo); setTab('billing'); }}>Continue to billing</button></div>
          </section>}
        </>}

        {tab==='billing'`;
if(!screen.includes('load-folder-summary-v10969')){
  if(!documentsPattern.test(screen)) throw new Error('v109.6.9 documents block not found');
  screen=screen.replace(documentsPattern,documentsReplacement);
}
write(SCREEN,screen);

let css=read(CSS);
if(!css.includes('.load-folder-grid-v10969')) css += String.raw`

/* v109.6.9 Professional smart load folders */
.load-folder-summary-v10969{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0 18px}.load-folder-summary-v10969>div{background:#fff;border:1px solid #d8e1ec;border-radius:18px;padding:16px 12px;display:flex;flex-direction:column;gap:4px}.load-folder-summary-v10969 b{font-size:25px;color:#10213d}.load-folder-summary-v10969 span{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#738097}.load-folder-summary-v10969 .attention{background:#fff4f2;border-color:#ffc9c1}.load-folder-summary-v10969 .attention b{color:#c43127}.load-folder-search-v10969{margin-bottom:16px}.load-folder-search-v10969 input{width:100%;box-sizing:border-box;border:1px solid #cad6e5;border-radius:18px;background:#fff;padding:17px 18px;font-size:16px;font-weight:750;color:#10213d}.load-folder-grid-v10969{display:grid;gap:14px}.load-folder-card-v10969{width:100%;text-align:left;border:1px solid #d6e0ec;border-radius:24px;background:#fff;padding:18px;box-shadow:0 10px 24px rgba(16,33,61,.06);color:#10213d}.load-folder-card-v10969.needs_attention{border-color:#ffc5bd;background:linear-gradient(145deg,#fff 65%,#fff2f0)}.load-folder-card-v10969.complete{border-color:#b8e8cf;background:linear-gradient(145deg,#fff 65%,#effcf5)}.load-folder-card-v10969 header{display:flex;align-items:center;justify-content:space-between}.load-folder-card-v10969 header div{display:flex;flex-direction:column}.load-folder-card-v10969 header span{font-size:10px;letter-spacing:.16em;font-weight:950;color:#75839a}.load-folder-card-v10969 header b{font-size:22px}.load-folder-card-v10969 header i{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-style:normal;font-weight:950;background:#dcf8e9;color:#087848}.load-folder-card-v10969.needs_attention header i{background:#ffe2de;color:#c52f25}.load-folder-card-v10969 h3{font-size:17px;margin:14px 0 5px}.load-folder-card-v10969 p{margin:0;color:#6e7c93;font-weight:700;font-size:13px}.load-folder-progress-v10969{display:flex;align-items:center;gap:12px;margin:16px 0 12px}.load-folder-progress-v10969>span{height:8px;border-radius:99px;background:#e7edf4;overflow:hidden;flex:1}.load-folder-progress-v10969>span i{display:block;height:100%;background:#2e68e8;border-radius:99px}.load-folder-card-v10969.complete .load-folder-progress-v10969>span i{background:#19a866}.load-folder-progress-v10969>b{font-size:13px}.load-folder-counts-v10969{display:flex;gap:7px;flex-wrap:wrap}.load-folder-counts-v10969 span{background:#f1f5fa;border-radius:999px;padding:7px 9px;font-size:11px;font-weight:850;color:#53627a}.load-folder-counts-v10969 span.missing{background:#ffe4e0;color:#b82d24}.load-folder-card-v10969 footer{margin-top:14px;padding-top:14px;border-top:1px solid #e4eaf1;display:flex;flex-direction:column;gap:3px}.load-folder-card-v10969 footer b{color:#bf3027;font-size:13px}.load-folder-card-v10969 footer em{font-style:normal;color:#7c879a;font-size:12px}.load-folder-card-v10969 footer.ready b{color:#087848}.load-folder-back-v10969{border:0;background:transparent;color:#285cc7;font-weight:900;font-size:15px;padding:4px 0 14px}.load-folder-detail-head-v10969{border-radius:25px;padding:22px;background:#13294b;color:#fff;display:flex;justify-content:space-between;gap:15px}.load-folder-detail-head-v10969.complete{background:#0b593b}.load-folder-detail-head-v10969 span{font-size:11px;letter-spacing:.16em;font-weight:950;color:#75a3ff}.load-folder-detail-head-v10969.complete span{color:#82e7b6}.load-folder-detail-head-v10969 h2{font-size:22px;line-height:1.2;margin:7px 0}.load-folder-detail-head-v10969 p{margin:0;color:#becae0;font-weight:700}.load-folder-detail-head-v10969 strong{font-size:31px;white-space:nowrap;text-align:right}.load-folder-detail-head-v10969 strong small{display:block;font-size:9px;letter-spacing:.12em}.load-folder-alert-v10969,.load-folder-complete-v10969{display:flex;align-items:center;gap:12px;margin:14px 0;padding:15px;border-radius:19px;background:#fff1ef;border:1px solid #ffc8c1;color:#9c251e}.load-folder-alert-v10969>i,.load-folder-complete-v10969>i{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:#d83c31;color:#fff;font-style:normal;font-weight:950}.load-folder-alert-v10969>div,.load-folder-complete-v10969>div{display:flex;flex-direction:column;gap:3px;flex:1}.load-folder-alert-v10969 span,.load-folder-complete-v10969 span{font-size:12px;font-weight:700}.load-folder-alert-v10969 button{border:0;border-radius:12px;background:#d83c31;color:#fff;padding:10px 14px;font-weight:900}.load-folder-complete-v10969{background:#edfbf4;border-color:#bde8d1;color:#087848}.load-folder-complete-v10969>i{background:#16a164}.load-folder-checklist-v10969{display:grid;gap:10px;margin:16px 0 22px}.load-folder-checklist-v10969 article{display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid #dce4ee;border-radius:18px}.load-folder-checklist-v10969 article.missing{background:#fff8f7;border-color:#ffc8c1}.load-folder-checklist-v10969 article.optional{background:#f5f7fa}.load-folder-checklist-v10969 article>i{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#ddf7e9;color:#087848;font-style:normal;font-weight:950}.load-folder-checklist-v10969 article.missing>i{background:#ffe1dc;color:#c42c23}.load-folder-checklist-v10969 article.optional>i{background:#e8edf3;color:#77859a}.load-folder-checklist-v10969 article>div{flex:1;display:flex;flex-direction:column;gap:3px}.load-folder-checklist-v10969 article b{font-size:15px}.load-folder-checklist-v10969 article span{font-size:12px;color:#748198;font-weight:700}.load-folder-checklist-v10969 article button{border:1px solid #bcd0f5;border-radius:12px;background:#fff;color:#285cc7;padding:9px 12px;font-weight:900}.load-folder-stops-v10969{display:grid;gap:10px;margin:12px 0 22px}.load-folder-stops-v10969 article{display:flex;align-items:center;gap:12px;border-radius:18px;padding:14px;background:#fff;border:1px solid #dce4ee}.load-folder-stops-v10969 article.missing{border-color:#ffc8c1;background:#fff8f7}.load-folder-stops-v10969 article>i{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:#def7ea;color:#087848;font-style:normal;font-weight:950}.load-folder-stops-v10969 article.missing>i{background:#ffe0dc;color:#c42d24}.load-folder-stops-v10969 article>div{flex:1;display:flex;flex-direction:column}.load-folder-stops-v10969 article span{font-size:9px;letter-spacing:.13em;color:#78869b;font-weight:950}.load-folder-stops-v10969 article b{font-size:14px}.load-folder-stops-v10969 article em{font-style:normal;font-size:11px;color:#77849a}.load-folder-stops-v10969 article button{border:1px solid #bdd0f4;border-radius:11px;background:#fff;color:#285cc7;padding:9px 11px;font-weight:900;font-size:12px}.load-folder-docs-v10969{display:grid;gap:10px}.load-folder-docs-v10969 article{display:flex;align-items:center;gap:11px;padding:12px;border-radius:17px;background:#fff;border:1px solid #dce4ee}.load-folder-docs-v10969 article>div:nth-child(2){flex:1;min-width:0;display:flex;flex-direction:column}.load-folder-docs-v10969 article span{font-size:9px;letter-spacing:.1em;color:#2c64d7;font-weight:950}.load-folder-docs-v10969 article b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.load-folder-docs-v10969 article em{font-style:normal;color:#78859a;font-size:11px}.load-folder-docs-v10969 article>button{border:1px solid #bfd0ee;border-radius:11px;background:#fff;color:#285cc7;padding:8px 11px;font-weight:900}.load-folder-actions-v10969{position:sticky;bottom:78px;z-index:4;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0 8px;padding:10px;background:rgba(246,249,252,.94);backdrop-filter:blur(14px);border:1px solid #d9e2ed;border-radius:19px}.load-folder-actions-v10969 button{border:1px solid #bccce3;border-radius:13px;background:#fff;color:#173258;padding:12px 8px;font-weight:900}.load-folder-actions-v10969 button.primary{grid-column:1/-1;background:#2e68e8;color:#fff;border-color:#2e68e8}.load-folder-actions-v10969 button:disabled{opacity:.45}@media(max-width:430px){.load-folder-detail-head-v10969{flex-direction:column}.load-folder-detail-head-v10969 strong{text-align:left}.load-folder-summary-v10969{gap:7px}.load-folder-summary-v10969>div{padding:13px 9px}.load-folder-counts-v10969 span{font-size:10px}.load-folder-actions-v10969{bottom:70px}}
`;
write(CSS,css);

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path)); data.version=VERSION; if(data.packages?.['']) data.packages[''].version=VERSION; write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt,updatedAt:releasedAt,label:'v109.6.9 Professional Load Folders',force:true,notes:['Replaces the flat document list with smart load folders.','Matches PODs to delivery stops and flags missing stop proof in red.','Combines Rate Confirmation, BOL, POD, Logbook, mileage, fuel and expense evidence per load.','Adds one-tap actions to add missing documents, open supporting logs and continue to billing.','Preserves original documents and keeps Logbook, HOS, Scanner and isolated readers unchanged.']},null,2)+'\n');
let sw=read('public/sw.js'); sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`); write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js'); update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`); write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.6.9 professional smart load folders applied');
