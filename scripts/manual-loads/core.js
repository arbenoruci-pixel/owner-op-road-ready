const text=v=>String(v??'').trim();
export const loadKey=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
export const closedLoad=l=>/^(delivered|completed|complete|closed|archived|invoiced|paid|cancelled|canceled|tonu|deleted|removed|superseded)$/i.test(text(l?.operationalStatus||l?.status));
export function exactLoad(store,id,no){
 const rows=(store.loads||[]).filter(l=>loadKey(l.canonicalLoadNo||l.loadNo)===loadKey(no));
 if(rows.length!==1||rows[0].id!==id||rows[0].deleted||rows[0].deletedAt)throw Error('This load changed. Reopen its folder before saving.');
 return rows[0];
}
export function createManualLoad(store,values,id,now=Date.now()){
 const loadNo=text(values.loadNo).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9 ._/-]{0,79}$/.test(loadNo)||!loadKey(loadNo))throw Error('Enter the broker load number.');
 if((store.loads||[]).some(l=>loadKey(l.canonicalLoadNo||l.loadNo)===loadKey(loadNo)))throw Error('This load already exists. Open its folder from Loads.');
 const amount=text(values.gross).replace(/[$,\s]/g,'');
 if(amount&&(!/^\d+(\.\d{1,2})?$/.test(amount)||!Number.isFinite(Number(amount))))throw Error('Enter a valid rate with up to two decimal places.');
 const row={id,loadNo,canonicalLoadNo:loadNo,broker:text(values.broker),origin:text(values.origin),destination:text(values.destination),gross:amount?Number(amount):'',pickupDate:text(values.pickupDate),deliveryDate:text(values.deliveryDate),status:'booked',manualActive:true,source:'driver_manual_folder',createdAt:now,updatedAt:now};
 return {...store,loads:[row,...(store.loads||[]).map(l=>l.manualActive?{...l,manualActive:false}:l)],updatedAt:now};
}
export function setManualActive(store,id,no,now=Date.now()){
 const row=exactLoad(store,id,no);if(closedLoad(row))throw Error('This load is already closed. Choose an open load.');
 return {...store,loads:store.loads.map(l=>l.id===id?{...l,manualActive:true,updatedAt:now}:l.manualActive?{...l,manualActive:false}:l),updatedAt:now};
}
export function markManualDelivered(store,id,no,day,now=Date.now()){
 exactLoad(store,id,no);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw Error('Choose the actual delivery date.');
 return {...store,loads:store.loads.map(l=>l.id===id?{...l,status:'delivered',operationalStatus:'delivered',actualDeliveryDate:day,completedDate:day,manualActive:false,completionSource:'driver_manual',updatedAt:now}:l),updatedAt:now};
}
export function activeFolderLoad(loads,current){
 const open=(loads||[]).filter(l=>!l.deleted&&!l.deletedAt&&!closedLoad(l));
 const selected=open.filter(l=>l.manualActive);
 if(selected.length===1)return selected[0];
 if(selected.length>1)return null;
 const matched=current?.identity==='load'?open.filter(l=>loadKey(l.loadNo||l.canonicalLoadNo)===loadKey(current.loadNo)):[];
 return matched.length===1?matched[0]:open.length===1?open[0]:null;
}
export function assertManualOriginal(store,{id,loadNo,type,day,signed,sha256}){
 exactLoad(store,id,loadNo);
 if(!['rate_confirmation','bol','pod','fuel_receipt','other'].includes(type))throw Error('Choose a document type.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Choose the document date.');
 if(type==='pod'&&!signed)throw Error('Check the receiver signature before saving this as POD.');
 if((store.documents||[]).some(d=>d.sha256===sha256))throw Error('This original is already saved. Open it from Documents instead of adding a duplicate.');
}
