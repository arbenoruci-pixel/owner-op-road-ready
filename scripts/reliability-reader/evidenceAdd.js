export async function addOriginal(file,input){
 const f=validateFiling(input);if(!file?.size)throw Error('Choose a non-empty file.');if(file.size>50*1024*1024)throw Error('Choose a file under 50 MB.');
 if(!/^image\//.test(file.type)&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))throw Error('Choose a photo or PDF.');
 const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
 const types={fuel:'fuel_receipt',repair:'maintenance',tolls:'toll_receipt',expense:'other_expense',settlement:'carrier_settlement'},type=types[f.category]||f.category;
 const hash=await sha256Original(file),rows=await db.documents_local.toArray();
 const existing=rows.find(row=>row.sha256===hash&&row.type===type&&String(row.load_no||'').toUpperCase()===String(f.loadNo||'').toUpperCase()&&String(row.evidenceFilingV1?.unit||row.unit||'')===String(f.unit||''));
 if(existing){announce();return {doc:existing,existing:true};}
 const saved=await saveDocument({file,type,title:file.name,metadata:{loadNo:f.loadNo,unit:f.unit},extracted:{type,loadNo:f.loadNo,date:f.date,unit:f.unit},classification:{selectedType:type,method:'driver_add'}},{db,waitFor:promise=>Dexie.waitFor(promise)});
 const at=new Date().toISOString(),doc={...saved.localDocument,reviewStatus:'needs_review',captureOnly:true,evidenceFilingV1:{...f,updatedAt:at},evidenceFilingHistoryV1:[{at,action:'original_added',after:f}]};
 await db.documents_local.put(doc);announce();return {doc,existing:saved.reused};
}
