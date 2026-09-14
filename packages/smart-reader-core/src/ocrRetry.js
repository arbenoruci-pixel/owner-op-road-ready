import {readDocument} from './engine.js';
import {textObservation} from './input.js';
import {PROFILES,normalizeValue} from './profiles.js';
import {separateWordColumns} from './wordLayout.js';
import {fieldMatches} from './layout.js';

function passObservation(pass,index){
  const id=String(index),size=pass.imageSize;
  if(!size||![size.width,size.height].every(n=>Number.isFinite(n)&&n>0)||!pass.lines?.length)return textObservation(pass.text||'',{id});
  return {id,sourceImageId:'coverage-'+id,lines:separateWordColumns(pass.lines,pass.words,size).map(line=>{
    const {left,top,width,height}=line,valid=[left,top,width,height].every(Number.isFinite)&&left>=0&&top>=0&&width>0&&height>0&&left+width<=size.width&&top+height<=size.height;
    return {text:String(line.text||''),confidence:Number.isFinite(line.confidence)&&line.confidence>=0&&line.confidence<=100?line.confidence/100:null,
      ...(valid?{box:{x:left/size.width,y:top/size.height,width:width/size.width,height:height/size.height}}:{})};
  })};
}

export function needsReadingRetry(passes){
  if(!passes.length)return true;
  const observations=passes.map(passObservation);
  const doc=readDocument({documentId:'coverage',pages:[{id:'page',observations}]}).documents[0];
  return doc.kind==='unknown'||Object.values(doc.fields).some(f=>f.required&&!f.candidates.some(c=>c.value!==null));
}

export function hasReadableBolReference(passes){
  const spec=PROFILES.find(p=>p.id==='bol').fields.bolNumber;
  return passes.some((pass,i)=>fieldMatches(passObservation(pass,i).lines,spec).some(match=>
    !match.issue&&normalizeValue('identifier',match.line.text.slice(match.start,match.end)).value!==null));
}

// A damaged label can suggest a reread region, never an accepted value.
// Only a small header line on the same image is eligible; no page-wide retry.
export function planBolIdentifierRegion(words,size){
  if(!Array.isArray(words)||words.length>100000||!size||![size.width,size.height].every(n=>Number.isFinite(n)&&n>0))return null;
  const valid=words.filter(w=>typeof w.text==='string'&&[w.left,w.top,w.width,w.height].every(Number.isFinite)&&w.left>=0&&w.top>=0&&w.width>0&&w.height>0&&w.left+w.width<=size.width&&w.top+w.height<=size.height);
  for(const label of valid){
    if(label.top>size.height*.35||! /^(?:BOL|B\/?L|BAL)(?:[.:;]|NO\b|$)/i.test(label.text))continue;
    const neighbors=valid.filter(w=>w!==label&&w.left>=label.left&&w.left+w.width<=label.left+size.width*.38&&w.height<=label.height*2&&Math.abs(w.top-label.top)<=label.height*.7);
    // An explicit B/L number label is sufficient to inspect missing pixels.
    // A damaged bare label still needs numeric support to avoid broad guesses.
    const labelEnd=label.left+label.width;
    const explicit=/^(?:BOL|B\/L)(?:[.:;]|$)/i.test(label.text)&&
      neighbors.some(w=>/^(?:NO\.?|NUMBER|#)[:;]?$/.test(w.text.toUpperCase())&&w.left-labelEnd<=label.height*2);
    if(!explicit&&!neighbors.some(w=>/\d{3}/.test(w.text)))continue;
    const context=valid.filter(w=>w.left<label.left&&label.left-w.left-w.width<size.width*.25&&Math.abs(w.top-label.top)<=label.height*.7).map(w=>w.text).join(' ');
    if(/\b(?:previous|prior|old|attach|copy|reference|revised)\b/i.test(context))continue;
    // Include space after an empty or truncated value; neighboring field labels
    // bound that space. No missing digits are manufactured or joined here.
    const numberLabel=explicit?neighbors.find(w=>/^(?:NO\.?|NUMBER|#)[:;]?$/.test(w.text.toUpperCase())&&w.left-labelEnd<=label.height*2):null;
    const fieldStart=numberLabel?numberLabel.left+numberLabel.width:labelEnd;
    const nextLabel=neighbors.filter(w=>w.left>fieldStart&&/^(?:DATE|PAGE|PO|PRO|SEAL|TRAILER|CARRIER|SHIPPER|CONSIGNEE)[:#.]?$/i.test(w.text)).map(w=>w.left);
    const limit=Math.min(size.width,label.left+size.width*.38,...nextLabel);
    const right=Math.min(limit,Math.max(labelEnd,...neighbors.filter(w=>w.left<limit).map(w=>w.left+w.width),...(explicit?[fieldStart+label.height*20]:[])));
    const top=Math.min(label.top,...neighbors.map(w=>w.top)),bottom=Math.max(label.top+label.height,...neighbors.map(w=>w.top+w.height));
    const pad=Math.max(8,Math.round(label.height*.55)),left=Math.max(0,Math.floor(label.left-pad)),y=Math.max(0,Math.floor(top-pad));
    const box={left,top:y,width:Math.min(size.width,Math.ceil(right+pad))-left,height:Math.min(size.height,Math.ceil(bottom+pad))-y};
    if(box.width*box.height<=size.width*size.height*.06)return box;
  }
  return null;
}
