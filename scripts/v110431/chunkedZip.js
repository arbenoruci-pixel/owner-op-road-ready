export const CHUNK_BYTES=1024*1024;
const enc=new TextEncoder(),dec=new TextDecoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export function checkAbort(signal){if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');}
export async function inspectBlob(blob,{signal,onChunk=()=>{}}={}){
 let crc=0xffffffff;const hashes=[];
 for(let offset=0;offset<blob.size;offset+=CHUNK_BYTES){
  checkAbort(signal);const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK_BYTES).arrayBuffer());
  for(const n of bytes)crc=crcTable[(crc^n)&255]^(crc>>>8);
  hashes.push(await sha256(bytes));onChunk(Math.min(offset+bytes.length,blob.size),blob.size);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 checkAbort(signal);return {crc:(crc^0xffffffff)>>>0,hashes,size:blob.size};
}
export class ChunkedZip {
 constructor(){this.entries=[];this.parts=[];this.offset=0;}
 add(path,blob,info){
  const name=enc.encode(path),size=blob.size,offset=this.offset;
  if(this.entries.length>=65535||offset+30+name.length+size>0xffffffff)throw new Error('This backup exceeds the ZIP size limit. Export documents by week instead.');
  const header=new Uint8Array(30),v=new DataView(header.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);
  v.setUint32(14,info.crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);
  this.parts.push(header,name,blob);this.entries.push({name,size,offset,crc:info.crc});this.offset+=30+name.length+size;
 }
 async text(path,text,options){const blob=new Blob([text],{type:'text/plain'});this.add(path,blob,await inspectBlob(blob,options));}
 file(filename){
  const directory=[];
  for(const row of this.entries){const header=new Uint8Array(46),v=new DataView(header.buffer);
   v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);
   v.setUint32(16,row.crc,true);v.setUint32(20,row.size,true);v.setUint32(24,row.size,true);v.setUint16(28,row.name.length,true);v.setUint32(42,row.offset,true);directory.push(header,row.name);
  }
  const size=directory.reduce((n,part)=>n+part.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
  if(this.offset+size+22>0xffffffff)throw new Error('This backup exceeds the ZIP size limit.');
  v.setUint32(0,0x06054b50,true);v.setUint16(8,this.entries.length,true);v.setUint16(10,this.entries.length,true);v.setUint32(12,size,true);v.setUint32(16,this.offset,true);
  return new File([...this.parts,...directory,end],filename,{type:'application/zip'});
 }
}
export async function readStoredZip(file){
 const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());let at=-1;
 for(let i=tail.length-22;i>=0;i--){const v=new DataView(tail.buffer,tail.byteOffset+i);if(v.getUint32(0,true)===0x06054b50&&i+22+v.getUint16(20,true)===tail.length){at=i;break;}}
 if(at<0)throw new Error('This ZIP is incomplete. Save it again before importing.');
 const end=new DataView(tail.buffer,tail.byteOffset+at),count=end.getUint16(10,true),size=end.getUint32(12,true),offset=end.getUint32(16,true);
 if(end.getUint16(4,true)||end.getUint16(6,true)||count!==end.getUint16(8,true)||size>16*1024*1024||offset+size!==file.size-tail.length+at)throw new Error('Unsupported or incomplete Road Ready ZIP.');
 const rows=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),files=new Map();let pos=0;
 for(let i=0;i<count;i++){
  if(pos+46>rows.length)throw new Error('ZIP file index is incomplete.');
  const v=new DataView(rows.buffer,rows.byteOffset+pos),nameSize=v.getUint16(28,true),length=46+nameSize+v.getUint16(30,true)+v.getUint16(32,true);
  if(v.getUint32(0,true)!==0x02014b50||pos+length>rows.length||(v.getUint16(8,true)&1)||v.getUint16(10,true)!==0||v.getUint32(20,true)!==v.getUint32(24,true))throw new Error('Choose the original ZIP exported by Road Ready.');
  const path=dec.decode(rows.subarray(pos+46,pos+46+nameSize)),start=v.getUint32(42,true),bytes=v.getUint32(24,true),crc=v.getUint32(16,true);
  if(files.has(path)||path.startsWith('/')||path.split('/').includes('..')||start+30>offset)throw new Error('Invalid ZIP file entry.');
  const local=new Uint8Array(await file.slice(start,start+30).arrayBuffer()),l=new DataView(local.buffer);
  if(l.getUint32(0,true)!==0x04034b50||l.getUint16(8,true)!==0||l.getUint32(14,true)!==crc||l.getUint32(22,true)!==bytes)throw new Error('ZIP file header is damaged.');
  const dataStart=start+30+l.getUint16(26,true)+l.getUint16(28,true);
  if(dataStart+bytes>offset)throw new Error('ZIP document is incomplete.');
  const localName=await file.slice(start+30,start+30+l.getUint16(26,true)).text();if(localName!==path)throw new Error('ZIP file names do not match.');
  files.set(path,{blob:file.slice(dataStart,dataStart+bytes),crc,size:bytes});pos+=length;
 }
 if(pos!==rows.length)throw new Error('ZIP file index contains unexpected data.');
 return files;
}
