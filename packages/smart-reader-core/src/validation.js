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
