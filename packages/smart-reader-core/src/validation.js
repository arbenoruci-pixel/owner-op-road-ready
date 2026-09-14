import {normalizeValue} from './profiles.js';

const amountKeys=['subtotal','tax','total'];
const mismatch='invoice_arithmetic_mismatch';

export function validateInvoice(fields) {
  // Remove only this check's previous verdict. OCR conflicts and missing values
  // remain unresolved; confirmed corrections keep their original source audit.
  for(const key of amountKeys){
    const field=fields[key];
    if(!field.issues.includes(mismatch))continue;
    field.issues=field.issues.filter(issue=>issue!==mismatch);
    const values=[...new Set(field.candidates.filter(c=>c.value!==null).map(c=>c.value))];
    field.value=field.issues.length?null:field.correction?.value??(values.length===1?values[0]:null);
    field.status=field.issues.length?'needs_review':field.correction?'confirmed':field.value!==null?'supported':'missing';
  }
  const amounts=amountKeys.map(key=>fields[key]);
  let status='not_checked';
  if(amounts.every(field=>field.value!==null)){
    const [subtotal,tax,total]=amounts.map(field=>normalizeValue('amount',field.value).minorUnits);
    status=subtotal+tax===total?'passed':'needs_review';
    if(status==='needs_review')for(const field of amounts){
      field.status='needs_review';field.issues.push(mismatch);field.value=null;
    }
  }
  return [{id:'invoice_arithmetic',status,fields:[...amountKeys]}];
}

export function validateUnloadingReceipt(fields){
  const keys=['amount','fee','total'],issue='receipt_arithmetic_mismatch';
  const values=keys.map(key=>{
    const field=fields[key];
    if(field.issues.includes(issue)){
      field.issues=field.issues.filter(item=>item!==issue);
      const candidates=[...new Set(field.candidates.map(c=>c.value).filter(value=>value!==null))];
      field.value=field.issues.length?null:field.correction?.value??(candidates.length===1?candidates[0]:null);
      field.status=field.issues.length?'needs_review':field.correction?'confirmed':field.value!==null?'supported':'missing';
    }
    if(field.value!==null)return normalizeValue('amount',field.value).minorUnits;
    // Geometry can require confirmation while the three observed numbers can
    // still be compared. Do not conceal weak or conflicting recognition.
    if(field.issues.some(item=>item!=='layout_needs_review'))return null;
    const candidates=[...new Set(field.candidates.map(c=>c.value).filter(value=>value!==null))];
    return candidates.length===1?normalizeValue('amount',candidates[0]).minorUnits:null;
  });
  const status=values.every(value=>value!==null)?values[0]+values[1]===values[2]?'passed':'needs_review':'not_checked';
  if(status==='needs_review')for(const key of keys){fields[key].issues.push(issue);fields[key].value=null;fields[key].status='needs_review';}
  return [{id:'receipt_arithmetic',status,fields:keys}];
}
