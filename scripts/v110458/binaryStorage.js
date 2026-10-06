// Browser-facing rows retain Blob/File values; IndexedDB stores their exact bytes.
// WebKit can reject Blob structured clones even after a successful download.
const TAG='__roadReadyStoredBinaryV110458';
const plain=value=>value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const stored=value=>plain(value)&&value[TAG]===1&&value.bytes instanceof ArrayBuffer;
export function containsBlob(value){
 if(value instanceof Blob)return true;
 if(stored(value))return false;
 if(Array.isArray(value))return value.some(containsBlob);
 if(plain(value))return Object.values(value).some(containsBlob);
 return false;
}
export async function packBinary(value){
 if(value instanceof Blob){
  const file=typeof File!=='undefined'&&value instanceof File;
  return {[TAG]:1,bytes:await value.arrayBuffer(),type:value.type,size:value.size,...(file?{name:value.name,lastModified:value.lastModified}:{})};
 }
 if(stored(value))return value;
 if(Array.isArray(value)){const out=[];for(const item of value)out.push(await packBinary(item));return out;}
 if(plain(value)){const out={};for(const [key,item]of Object.entries(value))Object.defineProperty(out,key,{value:await packBinary(item),enumerable:true,writable:true,configurable:true});return out;}
 return value;
}
export function unpackBinary(value){
 if(stored(value)){
  if(value.bytes.byteLength!==value.size)throw Error('A saved document has an invalid size. Its stored copy was kept.');
  return typeof value.name==='string'&&typeof File!=='undefined'?new File([value.bytes],value.name,{type:value.type,lastModified:value.lastModified}):new Blob([value.bytes],{type:value.type});
 }
 if(Array.isArray(value))return value.map(unpackBinary);
 if(plain(value)){const out={};for(const [key,item]of Object.entries(value))Object.defineProperty(out,key,{value:unpackBinary(item),enumerable:true,writable:true,configurable:true});return out;}
 return value;
}
export function installBinaryStorage(db,Dexie){
 const tables=new Set(['document_blobs','capture_asset_blobs','documents_local','account_receive_staging','sync_meta']);
 // Below Dexie's mutation cache/hooks, so public APIs continue to see originals.
 db.use({stack:'dbcore',name:'RoadReadyBinaryStorageV110458',level:-10,create:down=>({...down,table(name){
  const table=down.table(name);if(!tables.has(name))return table;
  return {...table,mutate(request){
   if(!request.values?.some(containsBlob))return table.mutate(request);
   // Only local byte conversion is awaited here. Network work never holds a transaction.
   return Dexie.waitFor(packBinary(request.values)).then(values=>table.mutate({...request,values}));
  }};
 }})});
 for(const table of db.tables)if(tables.has(table.name))table.hook('reading',unpackBinary);
}
