import {selectRange} from './core.js';
const excluded=/^(app_snapshots|sync_meta|mutation_queue|account_receive_staging)$/;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const aborted=()=>Object.assign(Error('Export cancelled.'),{name:'AbortError'});
function check(signal){if(signal?.aborted)throw aborted();}
function label(name){return ({documents_local:'document records',document_blobs:'original files',capture_asset_blobs:'scanner files'})[name]||name.replaceAll('_',' ');}
function keyOf(table,row){
 const path=table.schema?.primKey?.keyPath;
 const read=key=>String(key).split('.').reduce((value,part)=>value?.[part],row);
 const key=Array.isArray(path)?path.map(read):path?read(path):undefined;
 if(key===undefined||Array.isArray(key)&&key.some(v=>v===undefined))throw Error('A saved record has no export identity: '+table.name);
 return key;
}
export function selectionMetadata(value){
 if(value instanceof Blob||value instanceof ArrayBuffer||ArrayBuffer.isView(value)||value?.__roadReadyStoredBinaryV110458===1)return null;
 if(Array.isArray(value))return value.map(selectionMetadata);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,selectionMetadata(item)]));
 return value;
}
// Storage can stop responding on a memory-constrained phone. Cancellation and
// inactivity deadlines settle the export even if an IndexedDB request stalls.
export function controlledRead(work,{signal,timeoutMs=30000,label='saved records'}={}){
 check(signal);
 return new Promise((resolve,reject)=>{
  let done=false,timer;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>finish(aborted());
  const touch=()=>{check(signal);if(done)throw Error('Export read already stopped.');clearTimeout(timer);timer=setTimeout(()=>finish(Error('Reading '+label+' stopped responding. Try again. Your saved records were not changed.')),timeoutMs);};
  signal?.addEventListener('abort',abort,{once:true});touch();
  Promise.resolve().then(()=>work(touch)).then(value=>finish(null,value),error=>finish(error));
 });
}
export function selectedRowDatabase(db,rows,{signal,readTimeoutMs=30000}={}){
 const originals=new Map(db.tables.map(table=>[table.name,table]));
 const tables=Object.entries(rows).map(([name,selected])=>({
  name,toCollection:()=>({offset:offset=>({limit:limit=>({toArray:async()=>{
   check(signal);const page=selected.slice(offset,offset+limit);
   if(name==='app_snapshots')return page;
   const table=originals.get(name);if(!page.length)return [];
   if(!table)throw Error('Selected storage is unavailable: '+name);
   const result=[];
   for(const meta of page){
    const row=await controlledRead(()=>table.get(keyOf(table,meta)),{signal,timeoutMs:readTimeoutMs,label:label(name)});
    if(row===undefined)throw Error('A selected record changed during export. Please try again.');
    result.push(row);
   }
   return result;
  }})})})
 }));
 return {tables,table:name=>({toArray:async()=>rows[name]||[]})};
}
export async function readRangeRows({db,state={},businessStore={},from,to,signal,onProgress=()=>{},metadataOnly=false,readTimeoutMs=30000}={}){
 check(signal);const rows={};
 for(const table of db.tables){
  if(excluded.test(table.name))continue;
  const total=await controlledRead(()=>table.count(),{signal,timeoutMs:readTimeoutMs,label:label(table.name)});
  rows[table.name]=[];let count=0;onProgress('Checking '+label(table.name)+' · 0 / '+total);
  // Bypass binary decoding hooks during selection. Retain metadata only and
  // release each raw row before the next cursor result is read.
  await controlledRead(touch=>table.toCollection().raw().each(row=>{
   touch();rows[table.name].push(selectionMetadata(row));count++;
   if(count%8===0||count===total)onProgress('Checking '+label(table.name)+' · '+count+' / '+total);
  }),{signal,timeoutMs:readTimeoutMs,label:label(table.name)});
  await pause();check(signal);
 }
 onProgress('Matching selected dates and linked documents…');await pause();check(signal);
 // Build the relationship closure once after the single metadata scan.
 const selected=selectRange(state,businessStore,rows,from,to);check(signal);
 if(metadataOnly)return selected;
 const selectedDb=selectedRowDatabase(db,selected.rows,{signal,readTimeoutMs}),full={};
 for(const table of selectedDb.tables){
  full[table.name]=[];
  for(let offset=0;;offset+=8){const page=await table.toCollection().offset(offset).limit(8).toArray();if(!page.length)break;full[table.name].push(...page);}
 }
 return {...selected,rows:full};
}
