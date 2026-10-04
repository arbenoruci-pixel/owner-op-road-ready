import {DOT_DOCUMENT_REQUIREMENTS,normalizeWallet} from '../../core/wallet/dotWallet.js';
export const WALLET_FORMAT='road-ready-wallet-documents';
export const MAX_WALLET_BYTES=30*1024*1024;
const fields=new Set(['number','state','unit','plate','vin','trailer','carrier','policyNo','mcNumber','usdotNumber','year','quarter','loadNo','bolNo','inspectionDate','expiresOn','expiresMonth','notes']);
const clone=x=>JSON.parse(JSON.stringify(x));
export const walletFingerprint=wallet=>JSON.stringify(normalizeWallet(wallet));
function date(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
export async function validateWalletImport(raw){
 if(raw?.format!==WALLET_FORMAT||raw.version!==1||!Array.isArray(raw.documents)||!raw.documents.length||raw.documents.length>30)throw Error('Choose a Road Ready Wallet documents file.');
 const ids=new Set(),documents=[];let total=0;
 for(const row of raw.documents){
  const req=DOT_DOCUMENT_REQUIREMENTS.find(x=>x.id===row.id);if(!req||ids.has(row.id))throw Error('Unknown or repeated wallet document.');ids.add(row.id);
  const clean={};for(const [k,v]of Object.entries(row.fields||{})){if(!fields.has(k)||typeof v!=='string'||v.length>4000)throw Error('Invalid wallet document details.');if(['expiresOn','inspectionDate'].includes(k)&&v&&!date(v))throw Error('Invalid document date.');if(k==='expiresMonth'&&v&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))throw Error('Invalid expiration month.');clean[k]=v;}
  const o=row.original;if(!o||!['application/pdf','image/jpeg','image/png'].includes(o.type)||typeof o.base64!=='string'||o.base64.length>MAX_WALLET_BYTES*1.4||o.base64.length%4||/[^A-Za-z0-9+/=]/.test(o.base64)||typeof o.name!=='string'||o.name.length>220)throw Error('Invalid wallet original.');
  const bytes=Uint8Array.from(atob(o.base64),c=>c.charCodeAt(0));total+=bytes.length;if(!bytes.length||bytes.length!==o.size||total>MAX_WALLET_BYTES)throw Error('Wallet originals are incomplete or too large.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==o.sha256)throw Error('A wallet original is damaged. Download the file again.');
  const header=String.fromCharCode(...bytes.slice(0,5));if(o.type==='application/pdf'&&header!=='%PDF-'||o.type==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216)||o.type==='image/png'&&!(bytes[0]===137&&header.slice(1,4)==='PNG'))throw Error('The original does not match its file type.');
  documents.push({id:row.id,title:req.title,doc:{...clean,present:true,attachmentDataUrl:`data:${o.type};base64,${o.base64}`,attachmentName:o.name,attachmentType:o.type,attachmentSize:o.size,sourceSha256:hash}});
 }
 const identity={};for(const k of ['driverName','carrier','unit','vin'])identity[k]=String(raw.identity?.[k]||'').slice(0,160);
 return {identity,documents,notes:Array.isArray(raw.notes)?raw.notes.filter(x=>typeof x==='string').map(x=>x.slice(0,2000)).slice(0,8):[]};
}
export function mergeWalletImport(wallet,review,expected,token){
 if(walletFingerprint(wallet)!==expected)throw Error('Wallet changed after preview. Choose the file again to review the latest documents.');
 const next=normalizeWallet(clone(wallet||{})),now=Date.now();
 for(const {id,doc}of review.documents){
  const old=next.documents[id];let previous=old?.previousVersions||[];
  if(old?.attachmentDataUrl&&old.attachmentDataUrl!==doc.attachmentDataUrl){const {previousVersions,...saved}=old;if(!previous.some(x=>x.attachmentDataUrl===saved.attachmentDataUrl))previous=[...previous,saved];}
  next.documents[id]={...doc,previousVersions:previous,updatedAt:now,attachedAt:now};
 }
 next.lastReviewedAt=now;next.lastImport={token,count:review.documents.length,at:now};return next;
}
