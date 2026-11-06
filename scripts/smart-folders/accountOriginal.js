// Read one exact account original on demand; never restore a workspace or edit logs.
const text=v=>String(v??'').trim();
const idOf=d=>text(d?.client_document_id||d?.clientDocumentId);
export function findAccountOriginal(records,clientId){
 const entries=Object.entries(records||{}),metadata=[],blobs=[];
 for(const [key,value]of entries){
  let parts;try{parts=JSON.parse(key);}catch{continue;}
  if(parts[0]==='table'&&parts[1]==='document_blobs'&&idOf(value)===clientId)blobs.push(value.blob||value.data);
  if(parts[0]==='table'&&parts[1]==='documents_local'&&idOf(value)===clientId)metadata.push(value);
  if(parts[0]==='business'&&parts[1]==='documents'&&idOf(value)===clientId)metadata.push(value);
  if(parts[0]==='business-array'&&parts[1]==='documents')metadata.push(...(Array.isArray(value)?value:[]).filter(d=>idOf(d)===clientId));
 }
 for(const d of metadata)if(d.dataUrl?.__rrAccountFile===1)blobs.push(d.dataUrl);
 const refs=blobs.filter(v=>v?.__rrAccountFile===1);
 const distinct=new Map(refs.map(r=>[JSON.stringify(r),r]));
 if(distinct.size>1)throw Error('This document has conflicting saved originals. Open it on the phone where it was saved.');
 return [...distinct.values()][0]||null;
}
export async function readAccountDocumentOriginal(clientId,{getSession,getWorkspace,readFile}){
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(clientId))return {signedIn:false,blob:null};
 const session=await getSession(),uid=session?.user?.id;if(!uid)return {signedIn:false,blob:null};
 const workspace=await getWorkspace(uid);
 if(workspace&&workspace.user_id!==uid)throw Error('This original belongs to a different account.');
 const file=findAccountOriginal(workspace?.payload?.records,clientId);
 if(!file)return {signedIn:true,blob:null};
 if(!Number.isInteger(file.size)||file.size<=0||file.size>50*1024*1024||!Array.isArray(file.chunks)||file.chunks.some(c=>!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isInteger(c.bytes)||c.bytes<=0))throw Error('The saved original is incomplete.');
 const check=async()=>{if((await getSession())?.user?.id!==uid)throw Error('Account changed. Reopen this document.');};
 await check();const blob=await readFile(file,{uid,check});await check();
 return {signedIn:true,blob};
}
