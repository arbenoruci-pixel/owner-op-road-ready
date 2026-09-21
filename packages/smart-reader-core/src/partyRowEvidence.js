const strong=line=>line?.confidence!==null&&line?.confidence>=.8;

// Direct text or a unique, short label/value row can corroborate another
// reading. Nearby, competing and below-label values are never such proof.
export function explicitPartyRow(match){
  if(!strong(match.line))return false;
  if(!match.labelLine)return !match.issue;
  if(match.issue&&match.issue!=='layout_needs_review'||!strong(match.labelLine))return false;
  const label=match.labelLine.box,value=match.line.box;
  if(!label||!value||value.height>label.height*1.75||label.height>value.height*1.75
    ||Math.abs(label.y+label.height/2-value.y-value.height/2)>Math.min(label.height,value.height)*.55)return false;
  const side=label.x+label.width/2<.5?0:.5;
  const neighbors=match.observation.lines.filter(line=>line!==match.labelLine&&line.box&&/[\p{L}\p{N}]/u.test(line.text)
    &&line.box.x>=label.x+label.width-.003&&line.box.x-label.x-label.width<=.3
    &&line.box.x>=side&&line.box.x+line.box.width<=side+.5
    &&Math.min(line.box.y+line.box.height,label.y+label.height)-Math.max(line.box.y,label.y)>=Math.min(line.box.height,label.height)*.5);
  return neighbors.length===1&&neighbors[0]===match.line;
}
