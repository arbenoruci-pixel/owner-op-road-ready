import {profileEvidence} from './classification.js';

const strong=line=>line.confidence!==null&&line.confidence>=.8;
const smallHeader=line=>line.box&&line.box.y<.2&&line.box.height<.03;

// A bare NO. is meaningful only inside this page's complete BOL structure
// and its own numbered/date header. Never substitute a PO, sales order,
// delivery number, another page's label, or an unlabelled digit string.
export function bolHeaderMatches(page,profile){
  const matches=[];
  const contexts=new Map(page.observations.map(observation=>[observation,profileEvidence(observation.lines,profile)]));
  const complete=observation=>contexts.get(observation)?.method==='shipping_structure'&&contexts.get(observation).lines.every(strong);
  if(!page.observations.some(complete))return matches;
  for(const observation of page.observations){
    const support=contexts.get(observation);
    for(const line of observation.lines){
      if(!smallHeader(line))continue;
      const number=/^\s*(?:NO\.?|NUMBER)\s*:\s*(\d{6,20})\s*$/id.exec(line.text);
      if(!number)continue;
      const nearby=observation.lines.filter(other=>other!==line&&smallHeader(other)&&strong(other)
        &&Math.abs(other.box.x-line.box.x)<.06&&other.box.y>=line.box.y+line.box.height*.7
        &&other.box.y-line.box.y<.07);
      const pageLabels=nearby.filter(other=>/^\s*PAGE\s*:\s*(?:\d+\s*(?:OF|\/)\s*\d+)?\s*$/i.test(other.text));
      const dateLabels=nearby.filter(other=>/^\s*DATE\s*:(?:\s*\d.*)?\s*$/i.test(other.text));
      if(pageLabels.length!==1||dateLabels.length!==1||pageLabels[0].box.y>=dateLabels[0].box.y)continue;
      matches.push({observation,line,start:number.indices[1][0],end:number.indices[1][1],
        supportMethod:complete(observation)?'numbered_bol_header':'partial_bol_header',
        ...(!complete(observation)||!strong(line)?{issue:'label_needs_review'}:{}),
        extraLabelLines:[...(complete(observation)?support.lines:[]),pageLabels[0],dateLabels[0]]});
    }
  }
  return matches;
}

// Route/car is an explicit equipment field in a truck BOL. Keep this alias
// confined to shipping structure and retain the printed label as evidence.
export function bolEquipmentMatches(page,profile){
  const matches=[];
  const contexts=new Map(page.observations.map(observation=>[observation,profileEvidence(observation.lines,profile)]));
  const strongContext=observation=>contexts.get(observation)?.method==='shipping_structure'&&contexts.get(observation).lines.every(strong);
  if(!page.observations.some(strongContext))return matches;
  for(const observation of page.observations){
    const complete=strongContext(observation);
    for(const line of observation.lines){
      const value=/^\s*ROUTE\s+CAR\s+(?:NO\.?|NUMBER|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{1,39})\s*[–—|]*\s*$/id.exec(line.text);
      if(!value)continue;
      matches.push({observation,line,start:value.indices[1][0],end:value.indices[1][1],supportMethod:'bol_equipment_label',
        ...(!complete||!strong(line)?{issue:'label_needs_review'}:{})});
    }
  }
  return matches;
}
