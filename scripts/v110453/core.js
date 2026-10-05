export const CATEGORIES={rate_confirmation:'Rate confirmation',bol:'Pickup BOL',pod:'Delivery POD',invoice:'Invoice',fuel:'Fuel',repair:'Repairs & maintenance',tolls:'Tolls & parking',expense:'Other expense',settlement:'Settlement',insurance:'Insurance',registration:'Registration',inspection:'Inspection',permit:'Permits & authority',driver:'Driver documents',logs:'Logbooks',other:'Other'};
export const PACKETS={all:'All records',load:'Load paperwork',tax:'Expenses & tax records',repair:'Truck maintenance',inspection:'Inspection & logs'};
const aliases={fuel_receipt:'fuel',maintenance:'repair',repair_invoice:'repair',annual_inspection:'inspection',other_expense:'expense',expense_receipt:'expense',lumper_receipt:'expense',toll_receipt:'tolls',toll_parking_receipt:'tolls',toll_statement:'tolls',carrier_settlement:'settlement',logbook_snapshot:'logs',miles_snapshot:'logs',supporting_packet:'other'};
export const text=v=>String(v??'').trim();
export const day=v=>{const s=text(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';};
export const idOf=d=>text(d.local_id||d.client_document_id||d.id);
export const categoryOf=d=>{const t=text(d.type||d.document_type||d.extracted?.type);return aliases[t]|| (CATEGORIES[t]?t:'other');};
export function filingOf(d){const f=d.evidenceFilingV1;return f?.version===1?f:{category:categoryOf(d),date:day(d.document_date||d.documentDate||d.extracted?.documentDate||d.extracted?.date),loadNo:text(d.load_no||d.loadNo||d.extracted?.loadNo),unit:'',merchant:text(d.extracted?.merchant||d.extracted?.vendor),amount:'',notes:'',confirmed:false};}
export function validateFiling(input){
 if(!CATEGORIES[input.category]||input.category==='logs')throw Error('Choose a document category.');
 if(input.date&&!day(input.date))throw Error('Choose a valid document date.');
 const amount=text(input.amount);if(amount&&!/^\d{1,9}(\.\d{1,2})?$/.test(amount))throw Error('Enter an amount with up to two decimal places.');
 return {version:1,category:input.category,date:day(input.date),amount,loadNo:text(input.loadNo).slice(0,100),unit:text(input.unit).slice(0,60),merchant:text(input.merchant).slice(0,180),notes:text(input.notes).slice(0,2000),confirmed:true};
}
export function catalog(documents,state={}){
 const rows=documents.map(d=>{const f=filingOf(d);return {id:'doc/'+idOf(d),kind:'document',name:text(d.original_file_name||d.title)||'Document',...f,review:!f.confirmed,source:d};});
 for(const [key,d] of Object.entries(state.dotWallet?.documents||{})){
  const cat=/inspection/.test(key)?'inspection':/insurance|mcs90/.test(key)?'insurance':/registration|irp/.test(key)?'registration':/license|medical/.test(key)?'driver':'permit';
  rows.push({id:'wallet/'+key,kind:'wallet',name:d.attachmentName||key.replaceAll('_',' '),category:cat,date:day(d.issuedOn||d.inspectionDate),unit:text(d.unit||d.trailer),loadNo:'',merchant:'',amount:'',notes:d.notes||'',review:!Boolean(d.attachmentDataUrl||d.dataUrl),source:d});
 }
 const active=state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
 const books={...(state.teamLogbooksByDriverId||{}),[active]:state};
 for(const [driverId,b]of Object.entries(books))for(const date of new Set([...Object.keys(b.eventsByDay||{}),...Object.keys(b.signatureByDay||{}),...Object.keys(b.formByDay||{})])){
  const name=state.teamDrivers?.find(d=>d.id===driverId)?.name||b.driverProfile?.name||driverId;
  const events=b.eventsByDay?.[date]||[],form=b.formByDay?.[date]||{},signature=b.signatureByDay?.[date]||null;
  rows.push({id:'log/'+driverId+'/'+date,kind:'log',name:name+' · '+date,category:'logs',date,unit:text(form.truck||b.driver?.truck||state.driver?.truck||b.truck||state.truck),loadNo:'',merchant:'',amount:'',review:false,notes:b.certifyStatus?.[date]||'',source:{day:date,driverId,driverName:name,events,form,signature,certifyStatus:b.certifyStatus?.[date]||'',inspection:b.inspectionByDay?.[date]||null,homeTimezone:b.homeTimezone||state.homeTimezone||''}});
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name));
}
export function filterRows(rows,{query='',category='',from='',to='',loadNo='',unit='',review=false,scenario='all',includeUndated=false}={}){
 const q=text(query).toLowerCase();
 const groups={tax:['fuel','repair','tolls','expense','invoice','settlement'],repair:['repair','inspection'],inspection:['logs','inspection','insurance','registration','permit','driver','bol','pod']};
 return rows.filter(r=>(!q||[r.name,r.loadNo,r.unit,r.merchant,r.notes,CATEGORIES[r.category]].join(' ').toLowerCase().includes(q))&&(!category||r.category===category)&&(!review||r.review)&&(!loadNo||r.loadNo.toUpperCase()===text(loadNo).toUpperCase())&&(!unit||r.unit.toUpperCase()===text(unit).toUpperCase())&&(!groups[scenario]||groups[scenario].includes(r.category))&&(!(from||to)||(!r.date?includeUndated:(!from||r.date>=from)&&(!to||r.date<=to))));
}
export const csvCell=v=>{let s=text(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export const escapeHtml=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeName=v=>text(v).replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,120)||'record';
