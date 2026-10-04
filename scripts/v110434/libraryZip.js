import {readStoredZip,sha256} from '../backup/chunkedZipV110431.js';
import {validateManifest} from './libraryCoreV110434.js';
// Package files are ZIP_STORED so iPhone can read each original independently.
export async function openLibraryZip(file,onProgress=()=>{}){
 if(file.size>800*1024*1024)throw Error('Choose a library ZIP smaller than 800 MB.');
 const entries=await readStoredZip(file);const entry=entries.get('RoadReady-Import.json');
 if(!entry||entry.size>16*1024*1024)throw Error('This ZIP has no Road Ready import index. Choose the prepared import package.');
 const manifest=validateManifest(JSON.parse(await entry.blob.text()));
 for(let i=0;i<manifest.documents.length;i++){const d=manifest.documents[i],e=entries.get(d.path);onProgress({phase:'Checking originals',done:i,total:manifest.documents.length});if(!e||e.size!==d.bytes||await sha256(await e.blob.arrayBuffer())!==d.sha256)throw Error('Original missing or damaged: '+d.name);await new Promise(r=>setTimeout(r,0));}
 return {manifest,entries,file};
}
