import {canonical,walletMetadata} from './core.js';
import {DOT_DOCUMENT_REQUIREMENTS} from '../../source/src/core/wallet/dotWallet.js';

export function captureInspectionWallet(state){
  return Object.entries(state.dotWallet?.documents||{}).sort(([a],[b])=>a.localeCompare(b)).flatMap(([key,doc])=>{
    const dataUrl=doc?.attachmentDataUrl||doc?.photoDataUrl;
    if(!dataUrl)return [];
    const title=DOT_DOCUMENT_REQUIREMENTS.find(r=>r.id===key)?.title||doc.title||key;
    return [{key,dataUrl,metadata:walletMetadata({...doc,title})}];
  });
}
export function assertWalletUnchanged(captured,state){
  const current=captureInspectionWallet(state);
  if(!Array.isArray(captured)||current.length!==captured.length||current.some((row,i)=>row.key!==captured[i].key||row.dataUrl!==captured[i].dataUrl||canonical(row.metadata)!==canonical(captured[i].metadata)))throw Error('Digital Wallet changed. Prepare the link again.');
}
export async function walletFileHash(row){
  if(typeof row.dataUrl!=='string'||!/^data:[^;,]*;base64,[A-Za-z0-9+/=\r\n]+$/.test(row.dataUrl))throw Error('Open Digital Wallet and check the saved file for '+row.metadata.title+'.');
  const raw=atob(row.dataUrl.slice(row.dataUrl.indexOf(',')+1));
  if(raw.length>10*1024*1024)throw Error(row.metadata.title+' exceeds 10 MB. Save a smaller copy in Digital Wallet.');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function assertWalletManifest(manifest,expected){
  const docs=(manifest.items||[]).filter(x=>x.kind==='wallet');
  if(docs.length!==expected.length||expected.some(row=>{
    const file=docs.find(x=>x.item_key==='wallet:'+row.key);
    return !file||file.sha256!==row.sha256||canonical(file.metadata)!==canonical(row.metadata);
  }))throw Error('Digital Wallet verification failed. Prepare the link again.');
}
