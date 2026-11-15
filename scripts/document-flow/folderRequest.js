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
