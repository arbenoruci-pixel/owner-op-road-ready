// Matching views never replace source text or its evidence offsets.
import {rateConfirmationProfile} from './rateConfirmation.js';
import {deliveryEvidence,receiverStampEvidence,fuelReceiptEvidence} from './typeEvidence.js';
const leadingMarks=/^[\s|~'"‘’“”*_\[\]{}<>•=.,:;–—-]+/;
const view=line=>line.text.replace(leadingMarks,'');
const matches=(line,pattern)=>pattern.test(line.text)||pattern.test(view(line));
// Confusable letters affect only the BOL matching view. Raw proof stays exact,
// and all shipping structure signals are still required on the same page.
const bolView=line=>view(line).replace(/\b(bill[ \t]+of[ \t]+)[I1]ading\b/gi,'$1lading').replace(/\b((?:this|original)[ \t]+)bil[ \t]+of[ \t]+lading\b/gi,'$1bill of lading');
function clippedShippingLabel(line){
  // A crop can remove the first printed letter at the page's left edge.
  // This matching view is classification-only: never repair source or values.
  if(!line.box||line.box.x>.015||line.box.y>.45)return '';
  return view(line).replace(/^ROM(?=\s*:)/i,'FROM').replace(/^ARRIER(?=\s*:)/i,'CARRIER');
}
function oneEditApart(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>=b.length)i++;
    if(b.length>=a.length)j++;
  }
  return edits+a.length-i+b.length-j===1;
}
function damagedBolModifier(line,profile){
  if(profile.id!=='bol')return false;
  // Recover one edit or a clipped leading edge of a known form modifier.
  // BILL OF LADING, the rest of the title and independent party signals must
  // still match. Never discard arbitrary words or repair identifier digits.
  const parts=/^([A-Z]+)([ \t]+(?:STRAIGHT[ \t]+)?BILL[ \t]+OF[ \t]+LADING\b.*)$/i.exec(view(line));
  return !!parts&&['ALTERNATE','UNIFORM','STRAIGHT'].some(modifier=>
    (oneEditApart(parts[1].toUpperCase(),modifier)||parts[1].length>=4&&modifier.endsWith(parts[1].toUpperCase()))&&profile.heading.test(modifier+parts[2]));
}
function noisyTitle(line,profile){
  if(profile.id==='packing_list'){
    // One damaged letter in a whole title is recoverable only with the
    // profile's independent shipping and item-table signals below.
    const title=view(line).trim().toUpperCase();
    return ['PACKING SLIP','PACKING LIST'].some(known=>oneEditApart(title,known));
  }
  if(damagedBolModifier(line,profile))return true;
  if(profile.id!=='bol'||!line.box||line.box.y>=.2||line.box.height<.015||line.confidence===null||line.confidence>=.8)return false;
  const text=view(line),prefix=/^([A-Za-z0-9]{1,2})[ \t]+/.exec(text);
  // Tiny low-confidence fragments beside a large header may be scan noise.
  // Grammatical/negative prefixes still carry meaning and cannot be discarded.
  return !!prefix&&!/^(?:no|do|to|of|by|in|on|an|as|at|if|is|or|be|we|my)$/i.test(prefix[1])&&profile.heading.test(text.slice(prefix[0].length));
}

// Every vote retains the original lines, including OCR noise and punctuation.
export function profileEvidence(lines,profile,{lineIndices}={}){
  if(profile.deliveryBase){
    const shipping=profileEvidence(lines,profile.deliveryBase,{lineIndices});
    const explicit=deliveryEvidence(lines);
    // Never assemble a stamp from different OCR images in the pooled pass.
    const stamp=!explicit&&!lineIndices?receiverStampEvidence(lines):null;
    const delivery=explicit||stamp;
    if(shipping&&delivery){
      const support=[...new Set([...shipping.lines,...delivery])];
      return {method:!stamp&&shipping.method==='heading'&&support.every(line=>line.confidence==null||line.confidence>=.8)?'heading':'delivery_evidence',lines:support};
    }
  }
  if(profile.id==='fuel_receipt'){
    const support=fuelReceiptEvidence(lines);
    if(support)return {method:support.every(line=>line.confidence==null||line.confidence>=.8)?'fuel_transaction':'weak_fuel_transaction',lines:support};
  }
  for(const variant of profile.variants||[]){
    if(variant.sameObservation&&lineIndices)continue;
    // Sertifi also stamps signed primary/continuation pages. Their explicit
    // RateCon heading owns the page; the stamp is supporting content only.
    if(variant.method==='sertifi_signature'&&lines.some(line=>matches(line,rateConfirmationProfile.heading)))continue;
    const support=profileEvidence(lines,{...profile,...variant,variants:null,structuralSignals:null},{lineIndices});
    if(support)return {...support,method:variant.method||support.method};
  }
  const title=lines.find((line,index)=>(line.box?line.box.y<(profile.headingMaxY??.3):(lineIndices?.get(line)??index)<20)&&(matches(line,profile.heading)||noisyTitle(line,profile)));
  const signals=title?profile.signals.map(pattern=>lines.find(line=>(!profile.distinctSignals||line!==title&&view(line).toLowerCase()!==view(title).toLowerCase())&&
    (profile.minSignalConfidence==null||line.confidence==null||line.confidence>=profile.minSignalConfidence)&&matches(line,pattern))):[];
  if(title&&signals.every(Boolean)){
    // OCR table borders do not weaken an intact packing-form label. Keep
    // lexical repairs and uncertain titles reviewable, and preserve raw proof.
    const exact=profile.heading.test(title.text)&&signals.every((line,i)=>profile.signals[i].test(line.text)||
      profile.id==='packing_list'&&profile.signals[i].test(line.text.replace(/^[ \t|\[\]]+/,'')));
    const weakPackingTitle=profile.id==='packing_list'&&title.confidence!=null&&title.confidence<.8;
    return {method:exact&&!weakPackingTitle?'heading':'noisy_heading',lines:[...new Set([title,...signals])]};
  }
  if(profile.structuralSignals){
    const structure=[];
    for(const pattern of profile.structuralSignals){
      const line=lines.find(line=>matches(line,pattern)||profile.id==='bol'&&(pattern.test(bolView(line))||!lineIndices&&pattern.test(clippedShippingLabel(line))));
      if(!line)return null;
      structure.push(line);
    }
    return {method:profile.id==='bol'?'shipping_structure':'field_structure',lines:[...new Set(structure)]};
  }
  return null;
}
