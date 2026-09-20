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
