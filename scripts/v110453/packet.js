import {ChunkedZip,inspectBlob,checkAbort,sha256} from '../backup/chunkedZipV110431.js';
import {readTransferOriginal} from './transferStorageV110412.js';
import {CATEGORIES,PACKETS,csvCell,escapeHtml as h,safeName} from './evidenceWorkspaceCoreV110453.js';
async function original(row){
 if(row.kind==='document')return readTransferOriginal(row.source);
 if(row.kind==='wallet'){const value=row.source.attachmentDataUrl||row.source.dataUrl;if(!value?.startsWith('data:'))return null;return (await fetch(value)).blob();}
 return new Blob([JSON.stringify(row.source,null,2)],{type:'application/json'});
}
export async function preparePacket(rows,filters,{onProgress=()=>{},signal,readOriginal=original}={}){
 if(!rows.length)throw Error('No records match this packet.');
 if(filters.scenario==='load'&&!filters.loadNo?.trim())throw Error('Choose a load number.');
 const zip=new ChunkedZip(),records=[],files=new Map(),missing=[];
 for(let i=0;i<rows.length;i++){
  checkAbort(signal);const row=rows[i];onProgress(`Preparing ${i+1} of ${rows.length}`);
  let blob,path='',failure='',checks;
  try{blob=await readOriginal(row);if(!blob?.size)throw Error('Original unavailable');
   const expected=row.source.sha256||row.source.sourceSha256;if(expected&&await sha256(await blob.arrayBuffer())!==expected)throw Error('Original checksum does not match the saved source');
   checks=await inspectBlob(blob,{signal});
   const contentKey=checks.size+':'+checks.hashes.join(':');path=files.get(contentKey)||'';
   if(!path){path='Originals/'+String(files.size+1).padStart(4,'0')+'-'+safeName(row.name)+(row.kind==='log'?'.json':'');zip.add(path,blob,checks);files.set(contentKey,path);}
  }catch(e){if(e.name==='AbortError')throw e;failure=e.message||'Original unavailable';missing.push({id:row.id,name:row.name,reason:failure});}
  records.push({id:row.id,name:row.name,category:CATEGORIES[row.category],date:row.date||'',loadNo:row.loadNo||'',unit:row.unit||'',merchant:row.merchant||'',amount:row.amount||'',notes:row.notes||'',filingStatus:row.review?'Unconfirmed':'Filed',path,bytes:blob?.size||0,sourceHash:row.source.sha256||row.source.sourceSha256||'',chunkSha256:checks?.hashes||[],error:failure,history:row.source.evidenceFilingHistoryV1||[]});
 }
 const createdAt=new Date().toISOString(),label=PACKETS[filters.scenario]||PACKETS.all;
 await zip.text('manifest.json',JSON.stringify({format:'road_ready_evidence_packet_v1',createdAt,filters,records,missing,originals:files.size,scope:'Selected saved evidence. Confirm the requested scope with the recipient. This packet does not establish tax deductibility or certify a logbook.'},null,2),{signal});
 const columns=['name','category','date','loadNo','unit','merchant','amount','filingStatus','path','error'];
 await zip.text('index.csv',[columns.map(csvCell).join(','),...records.map(r=>columns.map(k=>csvCell(r[k])).join(','))].join('\r\n'),{signal});
 const logRows=rows.filter(r=>r.kind==='log');
 if(logRows.length)await zip.text('Logbooks.html','<!doctype html><meta charset="utf-8"><title>Saved logbook records</title><style>body{font:15px system-ui;max-width:1000px;margin:30px auto;padding:20px}section{break-after:page}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}</style><h1>Saved logbook records</h1>'+logRows.map(r=>'<section><h2>'+h(r.name)+'</h2><p>'+h(r.source.certifyStatus||'Certification not recorded')+'</p><table><tr><th>Start minute</th><th>End minute</th><th>Status</th><th>Location</th><th>Activity / reference</th></tr>'+(r.source.events||[]).map(e=>'<tr>'+[e.startMin,e.endMin,e.status,[e.city,e.state].filter(Boolean).join(', '),[e.note,e.shippingDocs||e.loadNo].filter(Boolean).join(' · ')].map(v=>'<td>'+h(v)+'</td>').join('')+'</tr>').join('')+'</table><p>The accompanying JSON retains the saved form, signature and inspection.</p></section>').join(''),{signal});
 await zip.text('Start-here.html','<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+h(label)+'</title><style>body{font:16px system-ui;color:#172331;max-width:1100px;margin:30px auto;padding:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}small{color:#56606d}</style><h1>'+h(label)+'</h1><p>'+h(filters.from||'Any date')+' — '+h(filters.to||'Any date')+' · '+records.length+' records · '+files.size+' original files</p><p>'+missing.length+' unavailable originals · '+records.filter(r=>r.filingStatus==='Unconfirmed').length+' unconfirmed filings</p><p>Saved evidence for the selected scope. Amounts reflect document filing details. Review applicability with the recipient.</p>'+(logRows.length?'<p><a href="Logbooks.html">Read saved logbooks</a></p>':'')+'<table><thead><tr><th>Document</th><th>Filed under</th><th>Date</th><th>Load / unit</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>'+records.map(r=>'<tr><td>'+(r.path?'<a href="'+h(r.path)+'">'+h(r.name)+'</a>':h(r.name)+' · Unavailable')+'<br><small>'+h(r.filingStatus)+'</small></td><td>'+h(r.category)+'</td><td>'+h(r.date||'Undated')+'</td><td>'+h([r.loadNo,r.unit].filter(Boolean).join(' / '))+'</td><td>'+h(r.merchant)+'</td><td>'+h(r.amount)+'</td></tr>').join('')+'</tbody></table><p>manifest.json contains source identifiers, file checksums and filing history.</p>',{signal});
 checkAbort(signal);return {file:zip.file('Road-Ready-'+safeName(label)+'-'+createdAt.slice(0,10)+'.zip'),missing,records:records.length,originals:files.size};
}
