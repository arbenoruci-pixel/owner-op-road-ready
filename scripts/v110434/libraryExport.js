// Include recovered source copies in Documents + Logbook without exporting queues or snapshots.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=n=>`${String(Math.floor((n||0)/60)).padStart(2,'0')}:${String((n||0)%60).padStart(2,'0')}`;
export async function exportLibrarySources(zip,db,signal){
 if(!db.sync_meta)return 0;
 const rows=await db.sync_meta.where('key').startsWith('document-library:').toArray();let count=0;
 for(const row of rows){
  const a=row.value;if(!a?.id||!Array.isArray(a.logbook))continue;
  const path='Imported-Logbooks/'+String(a.id).replace(/[^a-zA-Z0-9._-]/g,'-');count+=a.logbook.length;
  const source={id:a.id,logbook:a.logbook,logbookLinks:a.logbookLinks||[],cases:a.cases||[],sourceNote:a.sourceNote||''};
  await zip.text(path+'/Sources.json',JSON.stringify(source,null,2),{signal});
  const days=a.logbook.map(d=>`<section><h2>${esc(d.day)} · ${esc(d.driverName||d.driverId)}</h2><p>Imported source copy · ${esc(d.certifyStatus||'Certification details unavailable')}</p><table><tr><th>Duty</th><th>Time</th><th>Location / note</th></tr>${(d.events||[]).map(e=>`<tr><td>${esc(e.status)}</td><td>${clock(e.startMin)}–${clock(e.endMin)}</td><td>${esc(e.location)}<br>${esc(e.note)}</td></tr>`).join('')}</table></section>`).join('');
  await zip.text(path+'/Logbook.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Imported logbook sources</title><style>body{font:16px system-ui;margin:20px;color:#172439}section{overflow:auto;margin:28px 0}td,th{border:1px solid #ccd5df;padding:8px;text-align:left}table{border-collapse:collapse;width:100%}@media print{section{break-before:page}}</style><h1>Road Ready — imported logbook sources</h1><p>Preserved source copies. These do not replace or certify current logbooks.</p><p>${esc(a.sourceNote)}</p>${days}</html>`,{signal});
 }
 return count;
}
