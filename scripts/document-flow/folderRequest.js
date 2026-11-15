// One explicit folder target shared by Home, Files and the mounted load inbox.
export const FOLDER_REQUEST='road-ready-open-load-folder';
export function folderTarget(value){
 if(typeof value!=='string')return '';
 const v=value.trim();if(!v||v.length>180)return '';
 return /^(load|shipment):[^\r\n]+$/.test(v)?v:'load:'+v.toUpperCase();
}
export function requestLoadFolder(value,host=window){
 const id=folderTarget(value);if(!id)return '';
 try{host.sessionStorage.setItem(FOLDER_REQUEST,id);}catch{}
 host.dispatchEvent(new CustomEvent(FOLDER_REQUEST,{detail:id}));return id;
}
export function consumeLoadFolder(storage){try{const id=folderTarget(storage.getItem(FOLDER_REQUEST));storage.removeItem(FOLDER_REQUEST);return id;}catch{return '';}}
export function resolveFolderTarget(folders,target){
 const id=folderTarget(target),exact=folders.find(f=>f.id===id);if(exact)return exact;
 const key=id.replace(/^(load|shipment):/,'').replace(/[^A-Z0-9]/gi,'').toUpperCase();if(!key)return null;
 const matching=folders.filter(f=>[f.reference,...(f.source?.aliases||[]).filter(a=>a?.source!=='load_info').map(a=>typeof a==='string'?a:a?.value)].some(v=>String(v||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()===key));
 return matching.length===1?matching[0]:null;
}
