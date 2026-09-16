import {readDocument} from './engine.js';
import {passObservation} from './ocrRetry.js';

// At most two small, exact-image crops per page. Their results are additional
// evidence: they never suppress a conflicting full-page reading.
export function planPartyRegions(passes){
  const full=passes.filter(pass=>pass.scope!=='region');
  if(!full.length)return [];
  const result=readDocument({documentId:'party-coverage',pages:[{id:'page',observations:full.map(passObservation)}]});
  const choices=[];
  for(const group of result.documents)for(const field of Object.values(group.fields)){
    if(field.kind!=='party'||field.status!=='needs_review')continue;
    for(const candidate of field.candidates)for(const evidence of candidate.evidence){
      const index=Number(evidence.observationId),pass=full[index],box=evidence.box,size=pass?.imageSize;
      // Include the inline label so a reread remains attributable to its field.
      if(evidence.matchIssue||!box||!size||!pass.id||Math.max(size.width,size.height)>4000)continue;
      const padX=Math.max(8,Math.ceil(box.height*size.height*.55)),padY=Math.max(6,Math.ceil(box.height*size.height*.35));
      const left=Math.max(0,Math.floor(box.x*size.width)-padX),top=Math.max(0,Math.floor(box.y*size.height)-padY);
      const region={left,top,width:Math.min(size.width,Math.ceil((box.x+box.width)*size.width)+padX)-left,height:Math.min(size.height,Math.ceil((box.y+box.height)*size.height)+padY)-top};
      if(region.width*region.height>size.width*size.height*.06)continue;
      choices.push({sourcePassId:pass.id,fieldLabel:field.label,region,confidence:evidence.recognizerConfidence??1});
    }
  }
  const selected=[];
  for(const choice of choices.sort((a,b)=>a.confidence-b.confidence)){
    if(selected.some(item=>item.fieldLabel===choice.fieldLabel))continue;
    const {confidence,...plan}=choice;selected.push(plan);
    if(selected.length===2)break;
  }
  return selected;
}
