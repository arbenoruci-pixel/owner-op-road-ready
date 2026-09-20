import {evidenceFor} from './input.js';
// Decoded symbols cross-check printed candidates; they never replace digits.
export function bolBarcodeChecks(pages,fields) {
  const candidates=fields.bolNumber?.candidates||[],checks=[];
  for(const page of pages)for(const observation of page.observations||[]){
    if(observation.source!=='barcode-code128'||!observation.sourceImageId)continue;
    for(const line of observation.lines||[]){
      if(!/^\d{6,20}$/.test(line.text)||!line.box||line.box.y>.4)continue;
      const confirmed=fields.bolNumber?.correction;
      const matches=confirmed?fields.bolNumber.value===line.text:candidates.some(c=>c.value===line.text&&c.evidence.some(e=>e.pageId===page.id));
      checks.push({id:'bol_barcode_comparison',fields:['bolNumber'],status:matches?'passed':'needs_review',
        value:line.text,message:matches?(confirmed?'Barcode matches the confirmed BOL number.':'Barcode matches a printed-number candidate. Check any remaining OCR conflict.'):'Barcode differs from the BOL reading. Confirm the number on the source.',
        evidence:evidenceFor(page,observation,line,0,line.text.length)});
    }
  }
  return checks;
}

// An exact checksum-validated barcode can corroborate weak OCR of an explicit
// BOL label on the same page. It never supplies missing digits or defeats a
// conflicting reading, and it never invents recognizer confidence.
export function corroborateBolReference(pages,field){
  if(!field||field.status==='confirmed'||!field.candidates.length
    ||field.issues.some(issue=>!['weak_recognition','layout_needs_review','label_needs_review'].includes(issue)))return field;
  const values=new Set(field.candidates.map(c=>c.value));
  if(values.size!==1||values.has(null))return field;
  const checks=bolBarcodeChecks(pages,{bolNumber:field}),value=field.candidates[0].value;
  if(!checks.length||checks.some(c=>c.status!=='passed'||c.value!==value))return field;
  const labeled=field.candidates.some(c=>c.evidence.some(e=>!e.matchIssue&&checks.some(check=>check.evidence.pageId===e.pageId)));
  if(!labeled)return field;
  return {...field,status:'supported',value,issues:[],corroboration:{method:'barcode_code128',evidence:checks.map(c=>c.evidence)}};
}
