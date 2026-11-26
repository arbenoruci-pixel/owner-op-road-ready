// Local-only DOT pack. Encrypted metadata and exact original bytes; never cache financial or HOS data.
const enc=new TextEncoder(),dec=new TextDecoder();
const rounds=600000;
function pinCheck(pin){if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin)||/^(\d)\1+$/.test(pin))throw Error('Choose a non-repeating 6–12 digit PIN');}
async function key(pin,salt){pinCheck(pin);const base=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:rounds,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
const aad=(scope)=>enc.encode('roadready-dot-v1:'+scope);
export async function sealDotPack(scope,pin,docs){
 if(!scope||!Array.isArray(docs)||docs.length!==6||new Set(docs.map(d=>d.id)).size!==6)throw Error('Select six distinct road originals');
 const payload=enc.encode(JSON.stringify({v:1,createdAt:new Date().toISOString(),docs}));
 if(payload.length>32*1024*1024)throw Error('DOT pack exceeds local size limit');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),k=await key(pin,salt);
 return {v:1,salt,iv,cipher:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(scope)},k,payload)};
}
export async function openDotPack(scope,pin,pack){
 if(pack?.v!==1)throw Error('No valid offline pack');const k=await key(pin,pack.salt);
 const value=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:pack.iv,additionalData:aad(scope)},k,pack.cipher)));
 if(value.v!==1||value.docs?.length!==6)throw Error('Invalid pack');return value;
}
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('rr-operator-dot-private-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function dotStore(scope,action,value){
 const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('packs',action==='get'?'readonly':'readwrite'),s=tx.objectStore('packs');const r=action==='get'?s.get(scope):action==='delete'?s.delete(scope):s.put(value,scope);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Cache interrupted'));})}finally{db.close()}
}
export function base64Bytes(bytes){let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(out);}
