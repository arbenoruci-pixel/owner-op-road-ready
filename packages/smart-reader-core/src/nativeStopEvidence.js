// A native-PDF stop association needs a complete bounded block, not a vote
// count from two representations of the same PDF. Other layouts stay proposals.
import {isDocumentParty} from './fieldGuards.js';
const street=/^\s*\d+[A-Z]?(?:[-/]\d+)?\s+\S/i;
const city=/^\s*[A-Z][A-Z .'-]*,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i;
const appointment=/^\s*APPOINTMENT\s*:?\s*\S/i;
const placeholder=/^\s*PICK\s*UP\s*$/i;
const numberedPick=/^\s*PICK(?:\s*UP)?\s*[:#]?\s*1\s*:?\s*$/i;
const numberedStop=/^\s*STOP\s*[:#]?\s*1\s*:?\s*$/i;
const endBlock=/\b(?:SIGNATURE|SIGNED|LATE\s+FEE|DETENTION|TONU|LAYOVER|INSURANCE|PAYMENT\s+TERMS|SEND\s+INVOICE|DOCUMENT\s+REF)\b|^\s*(?:ALL LOADS MUST\b|ATTENTION\s*:)/i;
const noise=/^(?:PICK|DELIVER|DROP|STOP|SHIPPER|CONSIGNEE|ADDRESS|LOCATION|CONTACT|PHONE|TEL|FAX|APPOINTMENT|CHECK\s*IN|INSTRUCTIONS|PLEASE|NOTE|HOURS)\b/i;
const positioned=line=>line?.box&&Number.isFinite(line.confidence)&&line.confidence>=.98;
const right=line=>line.box.x+line.box.width;
const bottom=line=>line.box.y+line.box.height;
const middle=line=>line.box.y+line.box.height/2;
const aligned=(a,b)=>Math.abs(a.box.x-b.box.x)<=.015;

function shape(section){
  const lines=[];
  for(const line of section.allLines||[]){
    if(endBlock.test(line.text))break;
    if(/[\p{L}\p{N}]/u.test(line.text))lines.push(line);
  }
  if(!positioned(section.line)||!lines.length||!lines.every(positioned))return null;
  // A missing or incomplete cell must not borrow its neighbour's address.
  const streets=lines.filter(l=>street.test(l.text)&&!appointment.test(l.text));
  const cities=lines.filter(l=>city.test(l.text));
  const times=lines.filter(l=>appointment.test(l.text));
  if(streets.length>1||cities.length!==1||times.length!==1)return null;
  const [address]=streets,[locality]=cities,[time]=times;
  if(address===locality||address===time||locality===time)return null;
  const anchor=address||locality;
  const annotations=lines.filter(l=>l.box.x>=time.box.x-.015&&l.box.y>=time.box.y-.003
    &&/^(?:Appt Notes?\s*:|Ref\s*(?:#.*)?$|#\s*PU\s*#\s*\S)/i.test(l.text.trim()));
  const remaining=lines.filter(l=>![address,locality,time,...annotations].includes(l));
  const placeholders=remaining.filter(l=>placeholder.test(l.text));
  const parties=remaining.filter(l=>!placeholder.test(l.text));
  if(placeholders.length>1||parties.length>1||placeholders.length&&parties.length)return null;
  if(placeholders.length&&section.kind!=='pickup')return null;
  const name=parties[0]||null;
  if(name&&(!isDocumentParty(name.text)||noise.test(name.text.trim())))return null;
  if(address&&(!aligned(address,locality)||locality.box.y<bottom(address)-.003||locality.box.y-bottom(address)>.03))return null;
  if(!address&&!name)return null;
  if(time.box.x<Math.max(right(anchor),right(locality))+.01||Math.abs(middle(time)-middle(anchor))>Math.max(time.box.height,anchor.box.height)*.55)return null;
  if(section.line.box.x>anchor.box.x+.015||anchor.box.y<bottom(section.line)-.003||anchor.box.y-bottom(section.line)>.07)return null;
  for(const line of remaining){
    if(!aligned(line,anchor)||line.box.y<bottom(section.line)-.003||bottom(line)>anchor.box.y+.003)return null;
  }
  if(lines.some(l=>l.box.y<section.line.box.y||section.nextMarker&&bottom(l)>section.nextMarker.box?.y))return null;
  return {address,locality,time,name,labels:[section.line,...remaining,address,locality,time,...annotations].filter(Boolean)};
}

export function nativeStopEvidence(observation,section,sections){
  if(observation.source!=='pdf-text-layer'||!observation.sourceImageId||sections.length!==2)return null;
  const [pick,drop]=sections;
  if(pick.kind!=='pickup'||drop.kind!=='delivery'||!positioned(pick.line)||!positioned(drop.line))return null;
  // Generic STOP is accepted only in the already-recognized single PICK 1 /
  // STOP 1 form. Additional stops, duplicate roles and side-by-side blocks fail.
  if(drop.rawKind==='stop'&&(!numberedPick.test(pick.line.text)||!numberedStop.test(drop.line.text)))return null;
  if(drop.line.box.y<=bottom(pick.line)+.02||Math.abs(pick.line.box.x-drop.line.box.x)>.02)return null;
  const a=shape(pick),b=shape(drop);
  if(!a||!b||bottom(a.locality)>=drop.line.box.y||!aligned(a.address||a.locality,b.address||b.locality))return null;
  const proof=section===pick?a:section===drop?b:null;
  return proof?{...proof,labels:[pick.line,drop.line,...proof.labels]}:null;
}
