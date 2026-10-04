// Importable evidence archive. It never supplies live duty events or signatures.
export const FORMAT='road-ready-load-library';
export const text=v=>String(v??'').trim();
export const list=v=>Array.isArray(v)?v:[];
export const copy=v=>JSON.parse(JSON.stringify(v));
export const ref=v=>text(v).toUpperCase();
export const loadRef=v=>ref(v?.load_no||v?.loadNo||v?.canonicalLoadNo);
export const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const safeRef=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(v);
const str=(v,n=1600)=>typeof v==='string'&&v.length<=n;
export const LOAD_FIELDS=['broker','origin','destination','gross','pickupDate','deliveryDate','documentTransferDays','documentWorkflowStage','operationalStatus','serviceOutcome','notes','aliases'];
export function validateManifest(p){
 if(p?.format!==FORMAT||p.version!==1||!str(p.id,100)||!/^[a-zA-Z0-9._-]+$/.test(p.id))throw Error('Choose a Road Ready load library ZIP.');
 for(const [name,max] of [['loads',2000],['documents',5000],['logbook',5000],['logbookLinks',20000],['cases',1000]])if(!Array.isArray(p[name])||p[name].length>max)throw Error('Invalid '+name+' list.');
 const loads=new Set(),ids=new Set(),paths=new Set(),sourceIds=new Set();let bytes=0;
 for(const l of p.loads){
  if(!safeRef(l.loadNo)||loads.has(l.loadNo))throw Error('Duplicate or invalid load identity.');loads.add(l.loadNo);
  for(const k of ['broker','origin','destination','notes'])if(l[k]!==undefined&&!str(l[k],4000))throw Error('Invalid load details.');
  if(l.gross!==undefined&&(!Number.isFinite(l.gross)||l.gross<0))throw Error('Invalid load amount.');
  for(const k of ['pickupDate','deliveryDate'])if(l[k]&&!day(l[k]))throw Error('Invalid load date.');
  if(!Array.isArray(l.documentTransferDays)||l.documentTransferDays.some(d=>!day(d)))throw Error('Invalid service dates.');
  if(l.operationalStatus!=='closed'||!['delivered','tonu','cancelled','completed_per_owner'].includes(l.serviceOutcome))throw Error('Historical loads require an explicit closure outcome.');
  if(!str(l.closureAuthority,2000)||!l.closureAuthority)throw Error('Load closure needs its source.');
  if(!Array.isArray(l.aliases)||l.aliases.some(a=>!safeRef(a)))throw Error('Invalid load reference.');
 }
 for(const d of p.documents){
  if(!/^[a-f0-9]{64}$/.test(d.sha256||'')||d.id!=='library-'+d.sha256||ids.has(d.id))throw Error('Invalid or duplicate original identity.');ids.add(d.id);
  if(!str(d.path,500)||!d.path||d.path.startsWith('/')||d.path.includes('\\')||d.path.split('/').some(v=>!v||v==='.'||v==='..')||paths.has(d.path))throw Error('Invalid original path.');paths.add(d.path);
  if(!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>80*1024*1024)throw Error('An original exceeds the supported file size.');bytes+=d.bytes;
  if(!str(d.name,500)||!str(d.type,80)||!/^[a-z][a-z0-9_]*$/.test(d.type)||!str(d.mime,100)||!/^(application\/(pdf|octet-stream)|text\/(plain|csv)|image\/(png|jpeg|webp|gif|tiff|bmp|heic|heif|avif))$/.test(d.mime)||!Array.isArray(d.sourceClientIds)||d.sourceClientIds.some(id=>!str(id,200)||!id))throw Error('Invalid original details.');
  for(const id of new Set(d.sourceClientIds)){if(sourceIds.has(id))throw Error('A saved source identity refers to multiple originals.');sourceIds.add(id);}
  if(d.loadNo&&!loads.has(d.loadNo))throw Error('A document names an unknown load.');
  if(d.date&&!day(d.date))throw Error('Invalid document date.');
  if(!Array.isArray(d.components)||d.components.length>200||d.components.some(c=>!str(c.kind,80)||!Array.isArray(c.pages)||c.pages.some(n=>!Number.isInteger(n)||n<1||n>10000)||!c.fields||typeof c.fields!=='object'))throw Error('Invalid document page roles.');
 }
 if(bytes>768*1024*1024)throw Error('Choose a smaller library package.');
 const logs=new Set();for(const l of p.logbook){if(!day(l.day)||!str(l.driverId,200)||!l.driverId||!str(l.driverName,200)||!Array.isArray(l.events)||l.events.length>3000)throw Error('Invalid saved logbook day.');const key=l.driverId+'|'+l.day;if(logs.has(key))throw Error('Duplicate saved driver day.');logs.add(key);for(const e of l.events)if(!['D','ON','OFF','SB'].includes(e.status)||!Number.isFinite(e.startMin)||!Number.isFinite(e.endMin)||e.startMin<0||e.endMin>1440||e.endMin<e.startMin)throw Error('Invalid saved duty interval.');}
 for(const l of p.logbookLinks)if(!loads.has(l.loadNo)||!logs.has(l.driverId+'|'+l.day)||!['exact_reference','source_date_review'].includes(l.basis))throw Error('Invalid load/logbook relationship.');
 const cases=new Set();for(const c of p.cases){if(!str(c.id,200)||!c.id||cases.has(c.id)||!day(c.date)||!str(c.title,500)||!Array.isArray(c.documentIds)||c.documentIds.some(id=>!ids.has(id))||c.loadNo&&!loads.has(c.loadNo))throw Error('Invalid inspection folder.');cases.add(c.id);}
 return p;
}
export function loadPatch(l){const out={};for(const k of LOAD_FIELDS)if(l[k]!==undefined)out[k]=copy(l[k]);return out;}
export function makeImportReview(current,rows,p){
 validateManifest(p);const differences=[];const matches={};const rowOwners=new Map();
 for(const l of p.loads){const found=list(current.loads).filter(x=>loadRef(x)===l.loadNo);if(found.length>1)throw Error('Load '+l.loadNo+' has duplicate saved identities. Resolve those before import.');const saved=found[0];if(saved?.broker&&l.broker&&ref(saved.broker)!==ref(l.broker)&&!ref(saved.broker).includes(ref(l.broker))&&!ref(l.broker).includes(ref(saved.broker)))throw Error('Load '+l.loadNo+' belongs to a different saved broker. Review its identity first.');if(saved)for(const [field,value] of Object.entries(loadPatch(l)))if(canonical(saved[field])!==canonical(value))differences.push({key:'load:'+l.loadNo+':'+field,label:'Load '+l.loadNo,field,saved:saved[field]??null,incoming:value});}
 for(const d of p.documents){
  const exact=rows.filter(r=>r.sha256===d.sha256||d.sourceClientIds.includes(r.client_document_id)||r.client_document_id===d.id);
  if(exact.some(r=>r.sha256&&r.sha256!==d.sha256))throw Error('A saved document identity has a different original.');
  for(const r of exact){if(rowOwners.has(r.local_id)&&rowOwners.get(r.local_id)!==d.id)throw Error('A saved document matches multiple originals.');rowOwners.set(r.local_id,d.id);}
  matches[d.id]=exact.map(r=>r.local_id);
  for(const r of exact){const values={loadNo:loadRef(r),type:r.document_type||r.type||'other'};for(const field of ['loadNo','type'])if(values[field]!==d[field])differences.push({key:d.id+':'+r.local_id+':'+field,label:d.name,field,saved:values[field],incoming:d[field]});}
 }
 const already=list(current.documentLibraryHistory).some(h=>h.id===p.id);
 return {id:p.id,manifestToken:canonical(p),snapshotToken:canonical({current,rows}),matches,differences:already?[]:differences,already,newLoads:p.loads.filter(l=>!list(current.loads).some(s=>loadRef(s)===l.loadNo)).length,newDocuments:p.documents.filter(d=>!matches[d.id].length).length};
}
export function mergeLibraryLoads(current,p){
 const next=copy(current);next.loads=list(next.loads);const audit=[];
 for(const l of p.loads){const old=next.loads.find(x=>loadRef(x)===l.loadNo);const patch={...loadPatch(l),documentLibrarySource:p.id,closureAuthority:l.closureAuthority,sourceDateNote:l.sourceDateNote||'',updatedAt:Date.now()};
  if(old){audit.push({loadNo:l.loadNo,before:copy(old),after:patch});Object.assign(old,patch);if(!['paid','submitted','invoiced'].includes(old.status))old.status='archived';old.active=false;}
  else next.loads.push({...patch,id:'archive-'+l.loadNo,loadNo:l.loadNo,canonicalLoadNo:l.loadNo,status:'archived',active:false,source:'document_library',createdAt:Date.now()});
 }
 return {next,audit};
}
export function closeArchivedGuides(state,store){
 const closed=new Map(list(store.loads).filter(l=>l.operationalStatus==='closed'&&l.documentLibrarySource).map(l=>[loadRef(l),l]));if(!closed.size)return state;
 let changed=false;const guides={...state.loadGuidesById};const closedIds=new Set();
 for(const [id,g] of Object.entries(guides)){const l=closed.get(ref(g.loadNo||g.canonicalLoadNo||g.fields?.loadNo));if(!l)continue;closedIds.add(id);if(g.status==='active'||!g.excludedFromActiveLoad){guides[id]={...g,status:'completed',excludedFromActiveLoad:true,archiveClosure:{source:l.documentLibrarySource,outcome:l.serviceOutcome,authority:l.closureAuthority}};changed=true;}}
 const routeLegsByDay={...state.routeLegsByDay};for(const [d,legs]of Object.entries(routeLegsByDay)){routeLegsByDay[d]=list(legs).map(l=>{if((closed.has(loadRef(l))||closedIds.has(l.guideId))&&['open','active','planned','in_transit'].includes(l.status)){changed=true;return {...l,status:'completed',archiveClosure:true};}return l;});}
 const clearActive=closedIds.has(state.activeLoadGuideId);const clearInfo=closed.has(loadRef(state.loadInfo))||closedIds.has(state.loadInfo?.guideId);
 if(!changed&&!clearActive&&!clearInfo)return state;
 return {...state,loadGuidesById:guides,routeLegsByDay,activeLoadGuideId:clearActive?'':state.activeLoadGuideId,loadInfo:clearInfo?{...state.loadInfo,loadNo:'',shippingDocs:'',guideId:'',sourceEventId:'',sourceEventDay:'',archiveClosure:true}:state.loadInfo};
}
