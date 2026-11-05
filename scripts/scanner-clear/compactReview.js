import {confirmPageField} from '../../../../packages/smart-reader-core/src/recovery.js';

const primary={
  bol:['bolNumber','documentDate','poNumber'],pod:['bolNumber','deliveryDate','documentDate'],
  rate_confirmation:['loadNumber','pickupDate','deliveryDate','totalRate'],delivery_order:['loadNumber','date','poNumber'],delivery_receipt:['loadNumber','bolNumber','deliveryDate','date'],load_tender:['loadNumber','date'],
  fuel_receipt:['date','receiptNumber','total','gallons'],receipt:['date','receiptNumber','total'],
  unloading_receipt:['receiptDate','receiptNumber','total'],invoice:['invoiceNumber','invoiceDate','total'],packing_list:['packingSlipNumber','poNumber','date'],
};
export function keyReadingFields(group){
  if(primary[group?.kind])return primary[group.kind].filter(key=>group.fields?.[key]);
  const fields=group?.fields||{};
  const identity=['receiptNumber','invoiceNumber','loadNumber','bolNumber','poNumber','licenseNumber','policyNumber','vin','unitNumber','documentReference'].filter(key=>fields[key]).slice(0,2);
  const dates=['date','documentDate','expirationDate','effectiveDate'].filter(key=>fields[key]);
  const required=Object.entries(fields).filter(([,field])=>field.required).map(([key])=>key);
  return [...new Set([...identity,...dates,...(fields.total?['total']:[]),...required,...Object.keys(fields)])].slice(0,4);
}
export function pageProposals(result,group,pageId){
  const allowed=keyReadingFields(group),seen=new Set();
  return (result.aiExtraction?.candidates||[]).filter(c=>{
    if(c.groupId!==group.id||c.provenance?.providerImage?.pageId!==pageId||!allowed.includes(c.field)||group.fields[c.field].status==='confirmed'||seen.has(c.field))return false;
    if((result.aiExtraction?.candidates||[]).some(other=>other.groupId===c.groupId&&other.field===c.field&&other.rawValue!==c.rawValue))return false;
    seen.add(c.field);return true;
  });
}
// One explicit source review confirms a small batch atomically. A stale page,
// stale revision, unknown field or invalid value rejects the entire batch.
export function confirmReadingBatch(result,{documentId,groupId,pageId,sourceImageId,expectedRevision,values,userConfirmed}){
  const group=result.documents.find(g=>g.id===groupId);
  if(result.documentId!==documentId||result.reviewRevision!==expectedRevision||userConfirmed!==true||!group)throw new Error('The document changed. Check the current page again.');
  if(sourceImageId!==`${documentId}:${pageId}:original`||!group.pageIds.includes(pageId))throw new Error('Open the original page first.');
  const proposals=pageProposals(result,group,pageId),keys=Object.keys(values||{});
  if(!keys.length||keys.length>4||keys.some(key=>!proposals.some(c=>c.field===key&&c.provenance.providerImage.sourceImageId===sourceImageId&&/^[a-f0-9]{64}$/.test(c.provenance.providerImage.imageHash||''))))throw new Error('Check the current reading first.');
  let next=result;
  for(const key of keys){
    if(group.fields[key].status==='confirmed')throw new Error('A confirmed value changed. Open it again.');
    next=confirmPageField(next,{documentId,groupId,field:key,pageId,sourceImageId,expectedRevision:next.reviewRevision,rawValue:values[key],userConfirmed:true});
  }
  return next;
}
