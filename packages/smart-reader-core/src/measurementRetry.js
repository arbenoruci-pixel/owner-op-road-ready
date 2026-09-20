import {fieldsForProfile} from './engine.js';
import {passObservation} from './ocrRetry.js';
import {bolMeasurementFields} from './bolMeasurements.js';

// Retry only unresolved numbers. A missing LB/KG unit alone cannot be fixed
// by repeatedly reading the same pixels. At most two small, labeled rows.
export function planBolMeasurementRegions(passes){
  const full=passes.filter(p=>p.scope!=='region'&&p.imageSize&&p.sourceImageFile);
  if(!full.length)return [];
  const observations=full.map(passObservation),fields=fieldsForProfile([{id:'measurement',number:1,observations}],'bol');
  const plans=[];
  for(const key of ['weight','netWeight','tareWeight']){
    const values=new Set(fields[key].candidates.filter(c=>c.numericValue!=null).map(c=>c.numericValue));
    if(values.size===1)continue;
    const choices=[];
    for(let i=0;i<full.length;i++)for(const line of observations[i].lines){
      const b=line.box;if(!b||b.y<.45||b.height>.035||!bolMeasurementFields[key].rightLabel.test(line.text))continue;
      const row=observations[i].lines.filter(l=>l!==line&&l.box&&/^\s*\d/.test(l.text)
        &&l.box.x>=b.x+b.width-.003&&l.box.x-b.x-b.width<.3&&l.box.height<=b.height*1.75
        &&Math.abs(l.box.y+l.box.height/2-b.y-b.height/2)<=Math.min(l.box.height,b.height)*.55);
      if(!row.length)continue;
      const size=full[i].imageSize,left=Math.max(0,Math.floor((b.x-.008)*size.width));
      const top=Math.max(0,Math.floor((Math.min(b.y,...row.map(l=>l.box.y))-b.height*.3)*size.height));
      const right=Math.min(size.width,Math.ceil((Math.max(b.x+b.width,...row.map(l=>l.box.x+l.box.width))+.012)*size.width));
      const bottom=Math.min(size.height,Math.ceil((Math.max(b.y+b.height,...row.map(l=>l.box.y+l.box.height))+b.height*.3)*size.height));
      const region={left,top,width:right-left,height:bottom-top};
      if(region.width*region.height>size.width*size.height*.04)continue;
      choices.push({sourcePassId:full[i].id,field:key,region,characterHeight:b.height*size.height,original:full[i].id?.endsWith('source-page')});
    }
    choices.sort((a,b)=>Number(b.original)-Number(a.original));
    if(choices[0])plans.push(choices[0]);if(plans.length===2)break;
  }
  return plans;
}
