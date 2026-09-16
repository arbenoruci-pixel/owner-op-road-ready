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
      if(candidate.value===null||evidence.matchIssue&&evidence.matchIssue!=='layout_needs_review'||!box||!size||!pass.id||Math.max(size.width,size.height)>4000)continue;
      const nearby=other=>other.pageId===evidence.pageId&&other.observationId===evidence.observationId&&other.sourceImageId===evidence.sourceImageId&&other.box
        &&Math.abs(other.box.y-box.y)<=Math.max(other.box.height,box.height)*3;
      const labels=(candidate.labelEvidence||[]).filter(nearby),continuations=(candidate.continuationEvidence||[]).filter(nearby);
      // Separate labels and names need one crop containing both. Never borrow
      // coordinates from another pass or a distant occurrence of this name.
      if(evidence.matchIssue&&!labels.length)continue;
      const sources=[evidence,...labels,...continuations],boxes=sources.map(source=>source.box);
      const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
      const right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
      const lineHeight=Math.max(...boxes.map(b=>b.height));
      if(bottom-y>.08)continue;
      const padX=Math.max(8,Math.ceil(lineHeight*size.height*.55)),padY=Math.max(6,Math.ceil(lineHeight*size.height*.35));
      const left=Math.max(0,Math.floor(x*size.width)-padX),top=Math.max(0,Math.floor(y*size.height)-padY);
      const region={left,top,width:Math.min(size.width,Math.ceil(right*size.width)+padX)-left,height:Math.min(size.height,Math.ceil(bottom*size.height)+padY)-top};
      if(region.width*region.height>size.width*size.height*.06)continue;
      const pageSegMode=bottom-y>lineHeight*1.65?'6':'7';
      const priority=field.required&&!field.candidates.some(c=>c.evidence.some(e=>!e.matchIssue&&e.recognizerConfidence!==null&&e.recognizerConfidence>=.8))?0:1;
      const confidence=Math.min(...sources.map(e=>e.recognizerConfidence??1));
      choices.push({sourcePassId:pass.id,fieldLabel:field.label,region,pageSegMode,priority,confidence});
    }
  }
  const selected=[];
  for(const choice of choices.sort((a,b)=>a.priority-b.priority||a.confidence-b.confidence)){
    if(selected.some(item=>item.fieldLabel===choice.fieldLabel))continue;
    const {confidence,priority,...plan}=choice;selected.push(plan);
    if(selected.length===2)break;
  }
  return selected;
}
