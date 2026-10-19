import Dexie from 'dexie';
import {installBinaryStorage} from '../../../../lib/local-db/binaryStorageV110458.js';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {ChunkedZip,inspectBlob,readStoredZip,sha256} from '../backup/chunkedZipV110431.js';
import {readOriginalRow} from '../scan/originalStore.js';
import {RATE_PAGES,initialSample} from './fixtures.js';

export const SAMPLE_DATABASE='road-ready-review-sandbox-v1';
export function openSampleDatabase(){
  const db=new Dexie(SAMPLE_DATABASE);
  db.version(1).stores({documents_local:'&local_id,client_document_id,sha256',document_blobs:'&local_blob_id,client_document_id,sha256',sample_state:'&key'});
  installBinaryStorage(db,Dexie);
  return db;
}
export async function loadSample(db){return (await db.sample_state.get('sample'))?.value||initialSample();}
export async function saveSample(db,value,expected){
  await db.transaction('rw',db.sample_state,async()=>{
    const prior=(await db.sample_state.get('sample'))?.value||initialSample();
    if(expected&&JSON.stringify(prior)!==JSON.stringify(expected))throw Error('This sample changed in another tab. Reopen it before saving.');
    await db.sample_state.put({key:'sample',value});
  });
  return value;
}
export async function samplePdf(kind='rate_confirmation',loadNo='TEST-80173',unit='228'){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  const fixed=new Date('2026-10-01T00:00:00Z');pdf.setCreationDate(fixed);pdf.setModificationDate(fixed);pdf.setProducer('Road Ready synthetic review');
  const pages=kind==='rate_confirmation'?RATE_PAGES:[
    `${kind==='pod'?'SIGNED PROOF OF DELIVERY':kind==='bol'?'BILL OF LADING — UNSIGNED':kind.toUpperCase().replace(/_/g,' ')}\nSYNTHETIC SAMPLE — NO LIVE SHIPMENT\n${loadNo?'Load Number: '+loadNo:unit?'Scope: Vehicle evidence':'Scope: Company evidence'}\n${unit?'Unit: '+unit:'Vehicle scope: Company / fleet'}\nDocument Date: 2026-10-19\nCarrier: EXAMPLE CARRIER LLC\n${kind==='pod'?'Received by: Sample Receiver\nSignature: SAMPLE RECEIVER (test signature)\nDelivery completed: 2026-10-19 06:00':kind==='fuel'?'Vendor: Sample Fuel Station\nAddress: 100 Example St Chicago, IL 60601\nDiesel: 50.00 gallons\nTotal: $175.00\nPurchaser: EXAMPLE CARRIER LLC':'Original sample document for review'}\nPage 1 of 1`,
  ];
  for(const text of pages){const page=pdf.addPage([612,792]);page.drawText('ROAD READY / REVIEW SAMPLE',{x:42,y:752,size:10,font,color:rgb(.16,.42,.36)});text.replaceAll('—','-').split('\n').forEach((line,i)=>page.drawText(line,{x:42,y:716-i*25,size:i===0?16:10,font,color:rgb(.08,.12,.18)}));}
  return new File([await pdf.save()],`sample-${kind}-${loadNo||'company'}-${unit||'fleet'}.pdf`,{type:'application/pdf'});
}
export async function exportSample(db,sample){
  const documents=await db.documents_local.toArray(),blobs=await db.document_blobs.toArray(),zip=new ChunkedZip(),originals=[],filings=[];
  const paths=new Map();
  for(const row of blobs){if(!row.blob)continue;const hash=await sha256(await row.blob.arrayBuffer());if(row.sha256&&row.sha256.toLowerCase()!==hash)throw Error('A sample original differs from its recorded content hash.');if(paths.has(hash))continue;
    const path=`originals/${hash}.pdf`;zip.add(path,row.blob,await inspectBlob(row.blob));paths.set(hash,path);originals.push({sha256:hash,path,bytes:row.blob.size});}
  for(const row of documents){const original=await readOriginalRow(db,row.client_document_id,row.original_blob_id);if(!original?.blob)throw Error('A sample original is missing. Restore it before exporting.');const hash=await sha256(await original.blob.arrayBuffer());
    if(row.sha256&&row.sha256.toLowerCase()!==hash)throw Error('A sample filing refers to a different original content hash.');
    if(!paths.has(hash))throw Error('The original is not included in this sample export.');filings.push({...row,originalPath:paths.get(hash)});}
  const manifest={format:'road-ready-isolated-review-v1',sampleOnly:true,createdAt:new Date().toISOString(),originals,filings,loads:sample.loads,logbook:sample.logbook,business:sample.business};
  await zip.text('review-manifest.json',JSON.stringify(manifest,null,2));
  return {file:zip.file('Road-Ready-review-sample.zip'),manifest};
}
export async function checkSampleRestore(file){
  const entries=await readStoredZip(file),entry=entries.get('review-manifest.json');if(!entry)throw Error('Sample manifest is missing.');
  const manifest=JSON.parse(await entry.blob.text());if(manifest.format!=='road-ready-isolated-review-v1'||!manifest.sampleOnly)throw Error('This is not a sample review archive.');
  if(!Array.isArray(manifest.originals)||!Array.isArray(manifest.filings)||!Array.isArray(manifest.loads))throw Error('The sample manifest has an unsupported format.');
  if(new Set(manifest.originals.map(row=>row.sha256)).size!==manifest.originals.length||new Set(manifest.originals.map(row=>row.path)).size!==manifest.originals.length)throw Error('The sample manifest contains duplicate original identities.');
  if(manifest.filings.some(row=>!row.local_id)||new Set(manifest.filings.map(row=>row.local_id)).size!==manifest.filings.length)throw Error('The sample manifest contains invalid or duplicate filing identities.');
  // Restore into a new temporary database; neither the sample DB nor account DB is replaced.
  const db=new Dexie('road-ready-review-restore-'+crypto.randomUUID());db.version(1).stores({originals:'&sha256',filings:'&local_id',snapshot:'&key'});
  try{
    const originals=[];for(const item of manifest.originals){const original=entries.get(item.path)?.blob;if(!original||original.size!==item.bytes||await sha256(await original.arrayBuffer())!==item.sha256)throw Error('Sample original failed its content check.');originals.push({...item,content:await original.arrayBuffer()});}
    const paths=new Map(originals.map(row=>[row.path,row.sha256]));if(manifest.filings.some(row=>!paths.has(row.originalPath)))throw Error('A sample filing has no original.');
    if(manifest.filings.some(row=>row.sha256&&row.sha256.toLowerCase()!==paths.get(row.originalPath)))throw Error('A restored filing does not match its original content hash.');
    await db.transaction('rw',db.originals,db.filings,db.snapshot,async()=>{await db.originals.bulkPut(originals);await db.filings.bulkPut(manifest.filings);await db.snapshot.put({key:'manifest',value:manifest});});
    db.close();await db.open();
    const restored=await db.snapshot.get('manifest');if(JSON.stringify(restored.value)!==JSON.stringify(manifest))throw Error('Restored sample details differ.');
    if(await db.originals.count()!==manifest.originals.length||await db.filings.count()!==manifest.filings.length)throw Error('Restored sample record counts differ.');
    for(const row of await db.originals.toArray())if(await sha256(row.content)!==row.sha256)throw Error('Reopened sample bytes differ.');
    return {originals:await db.originals.count(),filings:await db.filings.count(),verified:true};
  }finally{db.close();await db.delete();}
}

