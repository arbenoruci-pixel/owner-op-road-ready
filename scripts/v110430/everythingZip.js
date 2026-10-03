// A standard, uncompressed ZIP keeps PDFs/photos usable in iPhone Files.
// Blob parts avoid an additional full-archive copy during packaging.
const encoder = new TextEncoder();
const textBytes = value => encoder.encode(value);
const json = value => textBytes(JSON.stringify(value, null, 2));
const safe = value => String(value || 'unassigned').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 100) || 'file';
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const crcTable = Uint32Array.from({length:256}, (_, n) => { for (let i=0;i<8;i++) n=(n&1)?0xedb88320^(n>>>1):n>>>1; return n>>>0; });
function crc32(bytes) { let crc=0xffffffff; for (const n of bytes) crc=crcTable[(crc^n)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function base64(value) { const raw=atob(value); return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
function extension(mime) { return ({'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/heic':'.heic','image/webp':'.webp','image/tiff':'.tiff'})[mime] || '.bin'; }

export function storeZip(entries, filename) {
  const parts=[], directory=[]; let offset=0;
  if(entries.length>65535) throw new Error('Too many files for one ZIP. Export smaller groups of documents.');
  for(const {path,bytes} of entries) {
    const name=textBytes(path), crc=crc32(bytes);
    if(bytes.length>0xffffffff || offset+30+name.length+bytes.length>0xffffffff) throw new Error('This ZIP is larger than 4 GB. Export smaller groups of documents.');
    const local=new Uint8Array(30), l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true); l.setUint16(12,33,true);
    l.setUint32(14,crc,true); l.setUint32(18,bytes.length,true); l.setUint32(22,bytes.length,true); l.setUint16(26,name.length,true);
    const central=new Uint8Array(46), c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true); c.setUint16(14,33,true);
    c.setUint32(16,crc,true); c.setUint32(20,bytes.length,true); c.setUint32(24,bytes.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true);
    parts.push(local,name,bytes); directory.push(central,name); offset+=local.length+name.length+bytes.length;
  }
  const directorySize=directory.reduce((sum,part)=>sum+part.length,0);
  if(offset+directorySize+22>0xffffffff) throw new Error('This ZIP is larger than 4 GB. Export smaller groups of documents.');
  const end=new Uint8Array(22), e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true); e.setUint32(12,directorySize,true); e.setUint32(16,offset,true);
  return new File([...parts,...directory,end],filename,{type:'application/zip'});
}

export async function buildEverythingZip(archive, {onProgress=()=>{}}={}) {
  const entries=[], manifest=[], seen=new Map(), docPaths=new Map();
  const payload=archive.payload||{}, review=archive.portableReview||{}, documents=payload.dexie?.documents_local||[];
  const byClient=new Map(documents.filter(d=>d.client_document_id).map(d=>[d.client_document_id,d]));
  const append=(path,bytes)=>entries.push({path,bytes});
  append('Road-Ready-Backup.roadready.json',textBytes(JSON.stringify(archive)));
  append('Review/ChatGPT-Review.json',json(review));
  append('Review/Loads.json',json(payload.businessStore?.loads||[]));
  async function addOriginal(bytes,mime,record={},source='') {
    if(!bytes.length) return;
    const sha=await digest(bytes), id=record.client_document_id||record.local_id||'';
    if(seen.has(sha)){if(id)docPaths.set(id,seen.get(sha));return;}
    let filename=safe(record.original_file_name||record.fileName||record.filename||record.title||'document');
    if(!/\.[a-z0-9]{2,5}$/i.test(filename))filename+=extension(mime);
    const load=safe(record.load_no||record.loadNo||record.extracted?.loadNo||'Unassigned');
    const path=`Documents/Load-${load}/${String(manifest.length+1).padStart(5,'0')}-${filename}`;
    append(path,bytes); seen.set(sha,path); if(id)docPaths.set(id,path);
    manifest.push({path,originalFileName:record.original_file_name||filename,clientDocumentId:id,source,mimeType:mime,size:bytes.length,sha256:sha});
    onProgress(`Preparing ZIP: ${manifest.length} original files…`);
  }
  async function walk(value,source,record={}) {
    if(typeof value==='string' && /^data:[^;,]+(?:;[^,]*)?,/i.test(value)) {
      const comma=value.indexOf(','), header=value.slice(0,comma), mime=header.slice(5).split(';')[0];
      if(!/^(image\/|application\/pdf)/i.test(mime))return;
      const bytes=/;base64/i.test(header)?base64(value.slice(comma+1)):textBytes(decodeURIComponent(value.slice(comma+1)));
      await addOriginal(bytes,mime,record,source); return;
    }
    if(!value||typeof value!=='object')return;
    if(value.__roadReadyBinary) {
      const bytes=base64(value.base64||'');
      if(bytes.length!==value.size || (value.sha256&&await digest(bytes)!==value.sha256))throw new Error('An original file failed verification. Your saved data is unchanged.');
      await addOriginal(bytes,value.mimeType||record.mime_type||'application/octet-stream',record,source); return;
    }
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)await walk(value[i],`${source}/${i}`,record);return;}
    const metadata={...record,...value,...(byClient.get(value.client_document_id)||{})};
    for(const [key,child] of Object.entries(value))await walk(child,`${source}/${key}`,metadata);
  }
  // Start with canonical blobs so the original filenames win over legacy copies.
  await walk(payload.dexie?.document_blobs||[],'document_blobs');
  await walk(payload.state,'state'); await walk(payload.businessStore,'businessStore');
  for(const [table,rows] of Object.entries(payload.dexie||{}))if(table!=='document_blobs')await walk(rows,table);
  for(const row of payload.localStorage||[]) {
    let value; try{value=JSON.parse(row.value);}catch{continue;}
    await walk(value,`localStorage/${row.key}`);
  }
  const missing=documents.filter(d=>!docPaths.has(d.client_document_id||d.local_id)).map(d=>({clientDocumentId:d.client_document_id||d.local_id,filename:d.original_file_name||'',loadNo:d.load_no||'',reason:'Original is unavailable on this device. Open or download it on the device where it was saved, then export again.'}));
  const logbook=review.logbook||[];
  const pages=logbook.map(day=>`<section><h2>${html(day.day)} · ${html(day.driverName||day.driverId)}</h2><p>${day.signed?'Saved signature on record':'No saved signature'} · ${html(day.certifyStatus)}</p><table><thead><tr><th>Status</th><th>Start</th><th>End</th><th>Location</th><th>Load</th><th>Notes</th></tr></thead><tbody>${(day.events||[]).map(event=>`<tr>${[event.status,clock(event.startMin),clock(event.endMin),event.location,event.loadNo,event.note].map(v=>`<td>${html(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('');
  append('Logbook/Logbook.html',textBytes(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Road Ready logbook</title><style>body{font:16px system-ui;margin:24px;color:#172439}section{margin:28px 0;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;text-align:left;padding:8px;vertical-align:top}h1{font-size:24px}@media print{section{break-before:page}}</style><h1>Road Ready — saved logbook</h1><p>Exported ${html(archive.createdAt)}. All driver records are included in the backup file. This readable copy lists saved events; it does not recalculate hours or certify logs.</p>${pages||'<p>No saved logbook days on this device.</p>'}</html>`));
  append('Logbook/Logbook.json',json(logbook));
  append('Documents/Manifest.json',json(manifest)); append('Documents/Unavailable-originals.json',json(missing));
  append('README.txt',textBytes(`Road Ready — Everything\n\n${manifest.length} original files included. ${missing.length} document records have no available original on this device.\n\nDocuments/: original PDFs and photos, plus a file index and any unavailable originals.\nLogbook/Logbook.html: open to read all saved driver logbook days.\nReview/ChatGPT-Review.json: upload for a readable review of logs and loads.\nRoad-Ready-Backup.roadready.json: full device backup, including signatures, inspections, loads, records and saved files.\n\nMOVE TO ANOTHER DEVICE\nTap this ZIP in Files to unzip it. In Road Ready, open Export & Backup > Import Everything and choose Road-Ready-Backup.roadready.json. Keep the current device backup before replacing its records.\n`));
  onProgress('Finishing your ZIP…');
  const file=storeZip(entries,`road-ready-everything-${String(archive.createdAt||new Date().toISOString()).slice(0,19).replace(/[:T]/g,'-')}.zip`);
  return {file,originals:manifest.length,missingOriginals:missing.length,logDays:logbook.length,loads:review.loads?.length||0};
}
function clock(minutes=0){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
