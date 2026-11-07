import {detectDocumentBoundary, FULL_FRAME, validBoundary} from './documentBoundaryV110329.js';

// Preserve already framed paperwork before considering strong printed rules.
// Bounded pixel sampling only; never reads text or changes the source pixels.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function pixel(image,x,y) {
  const i=(Math.round(clamp(y)*(image.height-1))*image.width+Math.round(clamp(x)*(image.width-1)))*4;
  const alpha=image.data[i+3]/255;
  const rgb=[0,1,2].map(c=>image.data[i+c]*alpha+255*(1-alpha));
  return {rgb,light:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
}
function paper(p) {return p.light>=165&&Math.max(...p.rgb)-Math.min(...p.rgb)<=Math.max(22,p.light*.10);}
export function framedPaperEvidence(image) {
  if(!image?.data||![image.width,image.height].every(n=>Number.isInteger(n)&&n>=24)||image.data.length!==image.width*image.height*4)return null;
  const corners=[];
  for(const [right,bottom] of [[0,0],[1,0],[1,1],[0,1]]) {
    let good=0;
    for(let y=0;y<7;y++)for(let x=0;x<7;x++) {
      const px=.005+x*.0075,py=.005+y*.0075;
      if(paper(pixel(image,right?1-px:px,bottom?1-py:py)))good++;
    }
    corners.push(good/49);
  }
  const sides=[];
  for(let side=0;side<4;side++) {
    let good=0;
    for(let k=0;k<41;k++)for(const inset of [.012,.035]) {
      const t=.04+k*.92/40;
      const p=side===0?[t,inset]:side===1?[1-inset,t]:side===2?[t,1-inset]:[inset,t];
      if(paper(pixel(image,...p)))good++;
    }
    sides.push(good/82);
  }
  return {corners,sides,alreadyFramed:corners.every(n=>n>=.70)&&Math.min(...sides)>=.60&&sides.reduce((a,b)=>a+b,0)/4>=.78};
}

// A paper boundary separates the sheet from its surroundings. A printed table
// has matching paper on both sides. Probe past narrow rules and handwriting,
// and retain the full image whenever a proposed crop has no outside boundary.
export function paperContinuation(image,corners,{shadows=false}={}) {
  if(!validBoundary(corners))return [];
  const w=image.width-1,h=image.height-1,unit=Math.min(w,h);
  return corners.map((p,index)=>{
    const q=corners[(index+1)%4],dx=(q.x-p.x)*w,dy=(q.y-p.y)*h,len=Math.hypot(dx,dy);
    const nx=-dy/len,ny=dx/len;
    let matches=0,tested=0;
    for(let k=2;k<=18;k++) {
      const t=k/20,x=(p.x+(q.x-p.x)*t)*w,y=(p.y+(q.y-p.y)*t)*h;
      const inside=[.018,.035,.055].map(d=>pixel(image,(x+nx*d*unit)/w,(y+ny*d*unit)/h)).sort((a,b)=>b.light-a.light)[0];
      if(inside.light<125)continue;
      let same=0,available=0;
      for(const d of [.014,.030,.050,.075,.10]) {
        const ox=x-nx*d*unit,oy=y-ny*d*unit;
        if(ox<0||oy<0||ox>w||oy>h)continue;
        available++;
        const outside=shadows?[-2,0,2].map(offset=>pixel(image,(ox-nx*offset)/w,(oy-ny*offset)/h)).sort((a,b)=>b.light-a.light)[0]:pixel(image,ox/w,oy/h);
        const chroma=outside.rgb.reduce((sum,c,i)=>sum+Math.abs(c/Math.max(40,outside.light)-inside.rgb[i]/inside.light),0)/3;
        const similar=outside.light>=inside.light*.84&&outside.light<=inside.light*1.18&&chroma<.040;
        // Truck-cab shadows can change both brightness and white balance
        // across a printed rule. Require a sustained light paper surface;
        // dark upholstery and strongly colored desks remain outside evidence.
        const blueCast=p=>p.rgb[2]/p.light>1.10&&Math.abs(p.rgb[0]-p.rgb[1])/p.light<.09;
        const neutral=p=>(Math.max(...p.rgb)-Math.min(...p.rgb))/p.light<.15;
        const blueShadow=(blueCast(inside)&&neutral(outside))||(blueCast(outside)&&neutral(inside));
        const shadowPaper=shadows&&outside.light>=115&&inside.light>=115&&outside.light>=inside.light*.65&&outside.light<=inside.light*1.55&&(chroma<.040||blueShadow&&chroma<.18);
        if(similar||shadowPaper)same++;
      }
      if(available>=3){tested++;if(same>=Math.max(3,available-1))matches++;}
    }
    return tested>=12?matches/tested:0;
  });
}
export function detectSafeDocumentBoundary(image,options={}) {
  const evidence=framedPaperEvidence(image);
  const full=(method,metrics={})=>({corners:FULL_FRAME.map(p=>({...p})),found:false,confidence:0,method,metrics:{...metrics,fullPagePreserved:true}});
  if(!evidence)return full('invalid-image-v110428');
  if(evidence.alreadyFramed)return full('already-framed-paper-v110428',{perimeter:evidence});
  const detection=detectDocumentBoundary(image,{...options,debug:true});
  if(!detection.found)return detection;
  const candidates=[detection,...(detection.candidates||[])];
  for(const candidate of candidates){
    if(candidate.confidence<.80)continue;
    const continuation=paperContinuation(image,candidate.corners,{shadows:true});
    if(continuation.some(support=>support>=.82))continue;
    const {candidates:debugCandidates,...selected}=candidate;
    // Keep a small source-pixel margin, including fine print on the edge.
    const cx=selected.corners.reduce((s,p)=>s+p.x,0)/4,cy=selected.corners.reduce((s,p)=>s+p.y,0)/4;
    const corners=selected.corners.map(p=>({x:clamp(p.x+(p.x-cx)*.008),y:clamp(p.y+(p.y-cy)*.008)}));
    return {...selected,corners,found:true,method:detection.method,metrics:{...detection.metrics,...selected.metrics,continuation,completePageGuard:true},...(options.debug?{candidates:debugCandidates||detection.candidates}:{})};
  }
  return full('internal-rule-rejected-v110428',{continuation:paperContinuation(image,detection.corners,{shadows:true})});
}
