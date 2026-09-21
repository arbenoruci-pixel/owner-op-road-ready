// Geometric proposals keep the exact source line. A shipping block is a
// bounded heuristic, so below-label proposals always require human review.
import {inlineFieldRange} from './inline.js';
import {isolatedMeasurementMatch} from './measurementDetails.js';
const STREET_ADDRESS=/^(?:[|{}\s]*)(?:P\.?\s*O\.?\s+BOX\s+\d+[A-Z]?\b|\d+[A-Z]?(?:[-/]\d+)?\s+(?:\S+\s+){0,8}(?:ROAD|STREET|AVENUE|BOULEVARD|DRIVE|LANE|COURT|CIRCLE|TERRACE|PLACE|PARKWAY|HIGHWAY|WAY|TRAIL|LOOP|PIKE|PLAZA|SQUARE|RD|ST|AVE|BLVD|DR|LN|CT|CIR|TER|PL|PKWY|HWY|TRL|PLZ|SQ)\b)/i;
const ADDRESS_TAIL=/^[\s.,]*(?:\d+[A-Z]?(?:[-/]\d+)?\b[\s.,]*)?(?:(?:NORTH|SOUTH|EAST|WEST|N|S|E|W|NE|NW|SE|SW)\b[\s.,]*)?(?:(?:(?:SUITE|STE|APARTMENT|APT|UNIT|BUILDING|BLDG|FLOOR|FL|ROOM|RM)\.?\s*#?\s*|#\s*)[A-Z0-9-]+\b[\s.,]*)?(?:(?:[A-Z][A-Z.'-]*[,\s]+){0,5}[A-Z]{2}\s+\d{5}(?:-\d{4})?[\s.,]*)?(?:(?:C\/O|CARE\s+OF)\s+\S.*)?[\s|{}]*$/i;
const isRule=(line,label)=>!/[\p{L}\p{N}]/u.test(line.text)||(line.box&&label.box&&line.box.height<label.box.height*.4&&line.confidence!==null&&(line.confidence<.5||line.confidence<.8&&(line.text.match(/[\p{L}\p{N}]/gu)||[]).length<=1));
// A tall OCR box can overlap both NET and TOTAL. It is not evidence for
// either row; keep the short, centered value on the label's own baseline.
const measurementRow=(a,b)=>b.height<=a.height*1.75&&a.height<=b.height*1.75
  &&Math.abs(a.y+a.height/2-b.y-b.height/2)<=Math.min(a.height,b.height)*.55;
const valueRange=line=>/^[\s|{}]*([^\r\n]*?)[\s|{}]*$/d.exec(line.text)?.indices[1];
const isStreetAddress=value=>{
  const address=STREET_ADDRESS.exec(value);
  // Suppress only complete address shapes; trailing company words remain evidence.
  return !!address&&ADDRESS_TAIL.test(value.slice(address[0].length));
};
export function fieldMatches(lines,spec){
  const detail=isolatedMeasurementMatch(lines,spec);if(detail)return [detail];
  const matches=[];
  const signatures=lines.filter(line=>line.box?.y>.4&&/^(?:(?:SHIPPER|CARRIER)\s+SIGNATURE\b|FREIGHT\s+COUNTED\b|TRAILER\s+LOADED\b)/i.test(line.text.trim()));
  const shortForm=lines.some(line=>line.box?.y<.3&&/^\s*(?:UNIFORM\s+)?STRAIGHT\s+BILL\s+OF\s+LADING\s*[-–—:]\s*SHORT\s+FORM\s*$/i.test(line.text));
  const certification=shortForm?lines.find(line=>line.box?.y>.4&&/^\s*SHIPPER[’'S]*\s+CERTIFICATION\s*:/i.test(line.text)):null;
  for(const line of lines){
    if(spec.excludePattern?.test(line.text))continue;
    if(line.box&&spec.maxY!=null&&line.box.y>spec.maxY)continue;
    if(spec.kind==='party'&&line.box&&signatures.some(anchor=>line.box.y>=anchor.box.y-.015&&line.box.y<=anchor.box.y+.09))continue;
    if(spec.kind==='party'&&line.box&&certification&&line.box.y>=certification.box.y)continue;
    const blockLabel=spec.blockLabel?.test(line.text),rightLabel=spec.rightLabel?.test(line.text);
    const inline=blockLabel||rightLabel?null:inlineFieldRange(line,spec);
    if(inline){
      const value=line.text.slice(inline.start,inline.end);
      if(spec.kind==='party'&&isStreetAddress(value))continue;
      if(spec.kind!=='identifier'||!/^[\s.#:|]*$/.test(value))matches.push({line,...inline});
      continue;
    }
    const noisy=line.box&&line.box.y<.4&&spec.noisyPattern?.exec(line.text);
    if(noisy){matches.push({line,start:noisy.indices[1][0],end:noisy.indices[1][1],issue:'label_needs_review'});continue;}
    if(rightLabel&&line.box){
      const label=line.box,side=label.x+label.width/2<.5?0:.5;
      const right=lines.filter(candidate=>{const box=candidate.box;return candidate!==line&&box&&!isRule(candidate,line)&&box.x>=label.x+label.width-.003&&box.x-(label.x+label.width)<=.3&&box.x>=side&&box.x+box.width<=side+.5&&Math.min(box.y+box.height,label.y+label.height)-Math.max(box.y,label.y)>=Math.min(box.height,label.height)*.5;}).sort((a,b)=>a.box.x-b.box.x);
      const eligible=spec.measurementRow?right.filter(candidate=>measurementRow(label,candidate.box)):right;
      // A separate unit cell belongs only to its unique numeric cell on this
      // label's baseline. Two numeric cells or competing units stay unresolved.
      if(spec.kind==='shipping_weight'&&eligible.length===2){
        const numbers=eligible.filter(candidate=>/^\s*\d[\d,.]*\s*$/.test(candidate.text));
        const units=eligible.filter(candidate=>/^\s*(?:LB|LBS|KG|KGS|IBS)\s*$/i.test(candidate.text));
        if(numbers.length===1&&units.length===1&&numbers[0]===eligible[0]){
          const number=numbers[0],unit=units[0],gap=unit.box.x-number.box.x-number.box.width;
          if(gap>=-.003&&gap<=.08){
            const range=valueRange(number),tail=valueRange(unit),strong=[line,number,unit].every(item=>item.confidence!==null&&item.confidence>=.8);
            matches.push({line:number,start:range[0],end:range[1],labelLine:line,joinedValue:number.text.slice(...range)+' '+unit.text.slice(...tail),
              continuation:{line:unit,start:tail[0],end:tail[1]},continuationKind:'weight_unit',extraLabelLines:[unit],
              supportMethod:'aligned_measurement_row',...(!strong?{issue:'layout_needs_review'}:{})});
            continue;
          }
        }
      }
      const first=eligible[0];
      if(first){const range=valueRange(first);if(range&&range[1]>range[0]&&!(spec.kind==='party'&&isStreetAddress(first.text))){const token=spec.valuePattern?.exec(first.text.slice(range[0],range[1]));
        if(spec.kind==='shipping_weight'&&/^(?:COMMODITY\s+DESCRIPTION|DESCRIPTION|QTY|QUANTITY|UNIT\s+WEIGHT|TOTAL\s+WEIGHT|NET\s+WEIGHT|TARE\s+WEIGHT)\s*$/i.test(first.text.trim()))continue;
        const receiptRow=spec.receiptRow&&right.length===1&&measurementRow(label,first.box);
        const supportedRow=(spec.measurementRow&&eligible.length===1||receiptRow)&&line.confidence>=.8&&first.confidence>=.8;
        matches.push({line:first,start:range[0],end:token?range[0]+token[0].length:range[1],labelLine:line,
          ...(supportedRow?{supportMethod:receiptRow?'aligned_receipt_row':'aligned_measurement_row',...(receiptRow?{issue:'layout_needs_review'}:{})}
            :{issue:right.length>1&&spec.kind==='party'?'ambiguous_party_row':spec.receiptRow&&right.length>1?'ambiguous_receipt_row':'layout_needs_review'})});}continue;}
    }
    if(!blockLabel||!line.box)continue;
    const label=line.box,center=label.x+label.width/2;if(label.width>.4||Math.abs(center-.5)<.06)continue;
    const left=center<.5?0:.5,right=center<.5?.5:1;
    const below=lines.filter(candidate=>{const box=candidate.box;return candidate!==line&&box&&candidate.text.trim()&&!isRule(candidate,line)&&box.x>=left&&box.x+box.width<=right&&box.x<=label.x+label.width+.025&&box.y>=label.y+label.height*.6&&box.y<=label.y+label.height+.035;}).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    const first=below[0];if(!first)continue;
    if(below.some(other=>other!==first&&Math.abs(other.box.y-first.box.y)<Math.min(other.box.height,first.box.height)*.5))continue;
    if(isStreetAddress(first.text)||/^(?:[|{}\s]*)(?:SHIP\s*(?:FROM|TO)|SHIPPER|CONSIGNEE|CARRIER|TRAILER|SEAL)\b/i.test(first.text))continue;
    const value=/^[\s|{}]*([^\r\n]*?)[\s|{}]*$/d.exec(first.text);if(value?.[1])matches.push({line:first,start:value.indices[1][0],end:value.indices[1][1],labelLine:line,issue:'layout_needs_review'});
  }
  return matches;
}
