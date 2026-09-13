// On-device, bounded document candidates. Inspired by connected components,
// convex hull / polygon approximation and line-support verification (OpenCV).
// No network, learned content, or pixel changes are involved in boundary finding.
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const FULL_FRAME = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export function area(points) {
  return Math.abs(points.reduce((n,p,i) => {const q=points[(i+1)%points.length];return n+p.x*q.y-q.x*p.y;},0))/2;
}
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function validBoundary(points) {
  if (!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1)) return false;
  const turns=points.map((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4]));
  return area(points)>.025&&(turns.every(n=>n>0)||turns.every(n=>n<0));
}
function order(points) {
  const cx=points.reduce((n,p)=>n+p.x,0)/4,cy=points.reduce((n,p)=>n+p.y,0)/4;
  const sorted=[...points].sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
  const first=sorted.reduce((best,p,i)=>p.x+p.y<sorted[best].x+sorted[best].y?i:best,0);
  return [...sorted.slice(first),...sorted.slice(0,first)];
}
function sampleImage(image,maxSide) {
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  // Relative chroma separates pale paper from pale furniture despite fold shadows.
  const rgb=new Float32Array(w*h*3),gray=new Float32Array(w*h),neutral=new Float32Array(w*h),paperColor=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=clamp((x+.5)/scale-.5,0,image.width-1),sy=clamp((y+.5)/scale-.5,0,image.height-1),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,i=y*w+x;
    for(let c=0;c<3;c++){
      const at=(xx,yy)=>image.data[(Math.min(image.height-1,yy)*image.width+Math.min(image.width-1,xx))*4+c];
      rgb[i*3+c]=(at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy;
    }
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];gray[i]=r*.2126+g*.7152+b*.0722;neutral[i]=gray[i]-(Math.max(r,g,b)-Math.min(r,g,b))*.7;paperColor[i]=gray[i]<85?0:255-700*(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(40,gray[i]);
  }
  const smooth=input=>{const out=new Float32Array(input.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=input[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]*(dx===0?2:1)*(dy===0?2:1);out[y*w+x]=sum/16;}return out;};
  return {w,h,rgb,gray,blur:smooth(gray),neutral:smooth(neutral),paperColor:smooth(paperColor)};
}
function hull(points) {
  const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}
function quadFromHull(points) {
  if(points.length<4)return null;
  const poly=[...points],originalArea=area(poly);
  while(poly.length>4){let best=0,loss=Infinity;for(let i=0;i<poly.length;i++){const n=Math.abs(cross(poly[(i+poly.length-1)%poly.length],poly[i],poly[(i+1)%poly.length]));if(n<loss){loss=n;best=i;}}poly.splice(best,1);}
  if(area(poly)<originalArea*.87)return null;
  return order(poly);
}
function regions(values,threshold,w,h,visit) {
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),minCount=w*h*.065;
  for(let seed=0;seed<values.length;seed++){
    if(seen[seed]||values[seed]<threshold)continue;
    let head=0,tail=1;queue[0]=seed;seen[seed]=1;const boundary=[];let touches=0;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);let border=false;
      if(x===0||y===0||x===w-1||y===h-1)touches++;
      for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]){
        if(n<0||values[n]<threshold){border=true;continue;}if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      }
      if(border)boundary.push({x,y});
    }
    if(tail>=minCount&&tail<w*h*.94&&touches<Math.min(w,h)*.45)visit(boundary,tail);
  }
}
// Verify that each candidate edge has the same paper surface on its inside.
// Strong upholstery seams can have excellent line contrast but a different
// surface from the document. Use bright core samples to exclude printed text;
// probe several inward distances so a dark printed footer remains included.
function paperSideSupport(points,frame) {
  const {w,h,rgb,gray}=frame;
  const at=(x,y)=>clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1);
  const core=[];
  for(let row=0;row<7;row++)for(let col=0;col<7;col++){
    const u=.18+col*.64/6,v=.18+row*.64/6;
    const x=(1-v)*((1-u)*points[0].x+u*points[1].x)+v*((1-u)*points[3].x+u*points[2].x);
    const y=(1-v)*((1-u)*points[0].y+u*points[1].y)+v*((1-u)*points[3].y+u*points[2].y);
    const i=at(x,y);core.push({i,luma:gray[i]});
  }
  core.sort((a,b)=>a.luma-b.luma);
  const paper=core.slice(25,44),tone=[0,0,0];let light=0;
  for(const {i,luma} of paper){light+=luma;for(let c=0;c<3;c++)tone[c]+=rgb[i*3+c]/Math.max(40,luma);}
  light/=paper.length;for(let c=0;c<3;c++)tone[c]/=paper.length;
  return points.map((p,side)=>{
    const q=points[(side+1)%4],len=Math.hypot(q.x-p.x,q.y-p.y),nx=-(q.y-p.y)/len,ny=(q.x-p.x)/len;let supported=0;
    for(let k=3;k<=21;k++){
      const t=k/24,x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t;
      const match=[3,6,10,15].some(d=>{
        const i=at(x+nx*d,y+ny*d),luma=gray[i];
        const chroma=tone.reduce((sum,value,c)=>sum+Math.abs(rgb[i*3+c]/Math.max(40,luma)-value),0)/3;
        return luma>=light*.64&&chroma<.065;
      });
      if(match)supported++;
    }
    return supported/19;
  });
}
function scoreQuad(points,frame,fill) {
  const {w,h,gray,blur,rgb}=frame,quad=points.map(p=>({x:p.x/(w-1),y:p.y/(h-1)})),a=area(quad);
  if(!validBoundary(quad)||a<.08||a>.94)return null;
  const lens=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%4].x,p.y-points[(i+1)%4].y));
  const ratio=(lens[0]+lens[2])/(lens[1]+lens[3]);
  if(ratio<.32||ratio>3.1||Math.min(...lens)<Math.min(w,h)*.17)return null;
  if(Math.min(lens[0],lens[2])/Math.max(lens[0],lens[2])<.60||Math.min(lens[1],lens[3])/Math.max(lens[1],lens[3])<.60)return null;
  for(let i=0;i<4;i++){const p=points[i],a=points[(i+3)%4],b=points[(i+1)%4];if(Math.abs(((a.x-p.x)*(b.x-p.x)+(a.y-p.y)*(b.y-p.y))/(lens[(i+3)%4]*lens[i]))>.65)return null;}
  // A furniture rectangle with one weak edge must not win on size alone.
  const at=(data,x,y)=>data[clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1)];
  const sideSupport=[],sideContrast=[];
  for(let side=0;side<4;side++){
    const p=points[side],q=points[(side+1)%4],len=lens[side],nx=-(q.y-p.y)/len,ny=(q.x-p.x)/len;let strong=0,total=0;
    for(let k=1;k<=24;k++){
      const t=k/25,x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t;
      let contrast=0;
      for(const d of [2,4]){const inside=at(blur,x+nx*d,y+ny*d),outside=at(blur,x-nx*d,y-ny*d);contrast=Math.max(contrast,Math.abs(inside-outside));}
      // Color boundaries also count for colored forms on similar-luma surfaces.
      const ii=(clamp(Math.round(y+ny*3),0,h-1)*w+clamp(Math.round(x+nx*3),0,w-1))*3,oi=(clamp(Math.round(y-ny*3),0,h-1)*w+clamp(Math.round(x-nx*3),0,w-1))*3;
      const color=(Math.abs(rgb[ii]-rgb[oi])+Math.abs(rgb[ii+1]-rgb[oi+1])+Math.abs(rgb[ii+2]-rgb[oi+2]))/3;
      contrast=Math.max(contrast,color*.8,Math.abs(at(frame.paperColor,x+nx*3,y+ny*3)-at(frame.paperColor,x-nx*3,y-ny*3))*.35);if(contrast>11)strong++;total+=Math.min(70,contrast);
    }
    sideSupport.push(strong/24);sideContrast.push(total/(24*70));
  }
  const weakest=Math.min(...sideSupport),support=sideSupport.reduce((n,v)=>n+v,0)/4;
  if(weakest<.29||support<.52)return null;
  // Interior stroke evidence separates paperwork from plain cabinet panels.
  let strokes=0,samples=0,mean=0;const cells=new Set();
  const left=Math.max(2,Math.floor(Math.min(...points.map(p=>p.x)))),right=Math.min(w-3,Math.ceil(Math.max(...points.map(p=>p.x)))),top=Math.max(2,Math.floor(Math.min(...points.map(p=>p.y)))),bottom=Math.min(h-3,Math.ceil(Math.max(...points.map(p=>p.y))));
  const stride=Math.max(2,Math.round(Math.sqrt((right-left)*(bottom-top)/700)));
  for(let y=top;y<=bottom;y+=stride)for(let x=left;x<=right;x+=stride){
    if(points.some((p,i)=>cross(p,points[(i+1)%4],{x,y})<lens[i]*4))continue;
    const v=at(gray,x,y),local=(at(gray,x-2,y)+at(gray,x+2,y)+at(gray,x,y-2)+at(gray,x,y+2))/4;
    samples++;mean+=v;if(local-v>13){strokes++;cells.add(Math.floor((x-left)/Math.max(1,right-left)*5)+5*Math.floor((y-top)/Math.max(1,bottom-top)*5));}
  }
  const ink=strokes/Math.max(1,samples),coverage=cells.size/25;
  // Dense carpet/fabric texture must not qualify as document text.
  if(ink<.004||ink>.20||coverage<.12)return null;
  const rectangularity=clamp(fill/(a*(w-1)*(h-1))),paperMean=mean/Math.max(1,samples);
  const paperSides=paperSideSupport(points,frame),paperEdge=Math.min(...paperSides);
  const score=.35*support+.20*weakest+.15*clamp(coverage/.55)+.13*Math.sqrt(a)+.10*clamp(ink/.04)+.07*clamp((paperMean-60)/130)-.16*(1-paperEdge);
  return {corners:quad,confidence:clamp(score),metrics:{paperArea:a,edgeSupport:support,weakestEdge:weakest,inkRatio:ink,inkCoverage:coverage,paperMean,rectangularity,paperEdge,paperSides}};
}
function lineQuads(frame,visit) {
  const {w,h,blur,paperColor}=frame,diag=Math.ceil(Math.hypot(w,h)),bins=diag*2+1,angles=60,votes=new Float32Array(bins*angles),edges=[];
  const cos=Array.from({length:angles},(_,i)=>Math.cos(i*Math.PI/angles)),sin=Array.from({length:angles},(_,i)=>Math.sin(i*Math.PI/angles));
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    // Weak paper edges can be distinct in chroma even when their luminance matches.
    const i=y*w+x;let gx=blur[i+1]-blur[i-1],gy=blur[i+w]-blur[i-w];const cx=(paperColor[i+1]-paperColor[i-1])*.55,cy=(paperColor[i+w]-paperColor[i-w])*.55;if(cx*cx+cy*cy>gx*gx+gy*gy){gx=cx;gy=cy;}const mag=Math.hypot(gx,gy);if(mag<10)continue;
    edges.push({x,y,gx:gx/mag,gy:gy/mag,weight:Math.min(3,mag/24)});
    let theta=Math.atan2(gy,gx);if(theta<0)theta+=Math.PI;const center=Math.round(theta/Math.PI*angles)%angles;
    for(let d=-1;d<=1;d++){const t=(center+d+angles)%angles,rho=Math.round(x*cos[t]+y*sin[t])+diag;votes[t*bins+rho]+=Math.min(3,mag/24);}
  }
  const lines=[];
  for(let t=0;t<angles;t++)for(let r=2;r<bins-2;r++){
    const value=votes[t*bins+r];if(value<Math.min(w,h)*.17||value<votes[t*bins+r-1]||value<votes[t*bins+r+1])continue;
    lines.push({t,rho:r-diag,score:value,c:cos[t],s:sin[t]});
  }
  lines.sort((a,b)=>b.score-a.score);const vertical=[],horizontal=[];
  for(const line of lines){const group=Math.abs(line.c)>Math.abs(line.s)?vertical:horizontal;if(group.length>=9)continue;
    if(group.some(old=>{const dot=old.c*line.c+old.s*line.s;return Math.abs(dot)>.99&&Math.abs(old.rho-(dot<0?-line.rho:line.rho))<7;}))continue;group.push(line);
  }
  // Fit continuously to the supporting pixels; coarse Hough bins must not
  // introduce a several-degree slant into a straight paper edge.
  for(const line of [...vertical,...horizontal]){
    const selected=edges.filter(p=>Math.abs(p.x*line.c+p.y*line.s-line.rho)<2.5&&Math.abs(p.gx*line.c+p.gy*line.s)>.93);
    let sum=0,x=0,y=0;for(const p of selected){sum+=p.weight;x+=p.x*p.weight;y+=p.y*p.weight;}if(sum<15)continue;x/=sum;y/=sum;
    let xx=0,xy=0,yy=0;for(const p of selected){xx+=(p.x-x)**2*p.weight;xy+=(p.x-x)*(p.y-y)*p.weight;yy+=(p.y-y)**2*p.weight;}
    const angle=.5*Math.atan2(2*xy,xx-yy)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    if(Math.abs(c*line.c+s*line.s)>.99){line.c=c;line.s=s;line.rho=x*c+y*s;}
  }
  const meet=(a,b)=>{const det=a.c*b.s-a.s*b.c;if(Math.abs(det)<.4)return null;return {x:(a.rho*b.s-a.s*b.rho)/det,y:(a.c*b.rho-a.rho*b.c)/det};};
  for(let a=0;a<horizontal.length;a++)for(let b=a+1;b<horizontal.length;b++)for(let c=0;c<vertical.length;c++)for(let d=c+1;d<vertical.length;d++){
    const ps=[meet(horizontal[a],vertical[c]),meet(horizontal[a],vertical[d]),meet(horizontal[b],vertical[d]),meet(horizontal[b],vertical[c])];
    if(ps.some(p=>!p||p.x<1||p.y<1||p.x>w-2||p.y>h-2))continue;
    const quad=order(ps);if(area(quad)<w*h*.09)continue;visit(quad,area(quad));
  }
}
// Refine each candidate against the paper/background transition, then fit one
// robust straight line per side. Carpet fibers must not pull a corner outward.
function refineQuad(corners,frame) {
  const {w,h,neutral}=frame,ps=corners.map(p=>({x:p.x*(w-1),y:p.y*(h-1)}));
  const at=(x,y)=>neutral[clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1)];
  const lines=[];
  for(let side=0;side<4;side++){
    const a=ps[side],b=ps[(side+1)%4],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
    const radius=Math.min(14,Math.max(4,len*.065)),hits=[];
    for(let k=2;k<=22;k++){
      const t=k/24,x=a.x+dx*t,y=a.y+dy*t;let best=null;
      for(let offset=-radius;offset<=radius;offset+=.5){
        const px=x+nx*offset,py=y+ny*offset;
        let inner=0,outer=0,inner2=0,outer2=0;
        for(const d of [2,3,4,5]){const iv=at(px+nx*d,py+ny*d),ov=at(px-nx*d,py-ny*d);inner+=iv;outer+=ov;inner2+=iv*iv;outer2+=ov*ov;}
        inner/=4;outer/=4;
        // Look beyond narrow printed rules: a dark footer is still inside paper.
        const far=Math.max(...[3,5,7,9,11,13].map(d=>at(px-nx*d,py-ny*d)));
        const jump=inner-Math.max(outer,far-12);
        // A bright, smoother sheet interior supports the edge across textures.
        const gain=Math.max(0,Math.sqrt(Math.max(0,outer2/4-outer*outer))-Math.sqrt(Math.max(0,inner2/4-inner*inner)));
        const score=jump+gain*.5-Math.abs(offset)*.35;
        if(jump>14&&(!best||score>best.score))best={t,offset,score};
      }
      if(best)hits.push(best);
    }
    if(hits.length<9)return null;
    // RANSAC over offset(t), so corners and printed rules cannot skew the fit.
    let inliers=[];
    for(let i=0;i<hits.length;i++)for(let j=i+3;j<hits.length;j++){
      const slope=(hits[j].offset-hits[i].offset)/(hits[j].t-hits[i].t),base=hits[i].offset-slope*hits[i].t;
      if(Math.abs(slope)>len*.12)continue;
      const group=hits.filter(p=>Math.abs(p.offset-base-slope*p.t)<1.6);
      if(group.length>inliers.length)inliers=group;
    }
    if(inliers.length<9)return null;
    let sw=0,st=0,so=0,stt=0,sto=0;
    for(const p of inliers){const weight=Math.min(60,p.score);sw+=weight;st+=p.t*weight;so+=p.offset*weight;stt+=p.t*p.t*weight;sto+=p.t*p.offset*weight;}
    const slope=(sw*sto-st*so)/Math.max(.001,sw*stt-st*st),base=(so-slope*st)/sw;
    const p={x:a.x+nx*base,y:a.y+ny*base},q={x:b.x+nx*(base+slope),y:b.y+ny*(base+slope)},length=Math.hypot(q.x-p.x,q.y-p.y);
    const c=-(q.y-p.y)/length,s=(q.x-p.x)/length;lines.push({c,s,rho:p.x*c+p.y*s});
  }
  const refined=lines.map((b,i)=>{const a=lines[(i+3)%4],det=a.c*b.s-a.s*b.c;return {x:(a.rho*b.s-a.s*b.rho)/det/(w-1),y:(a.c*b.rho-a.rho*b.c)/det/(h-1)};});
  return validBoundary(refined)?refined:null;
}
export function detectDocumentBoundary(image,options={}) {
  const fallback={corners:FULL_FRAME.map(p=>({...p})),confidence:0,found:false,method:'no-document-v110329',metrics:{}};
  if(!image?.data||image.width<24||image.height<24)return fallback;
  const frame=sampleImage(image,clamp(options.maxSide||384,96,640)),candidates=[],keys=new Set();
  const thresholds=[70,90,110,130,150,170,190,210,230];
  for(const values of [frame.blur,frame.neutral,frame.paperColor])for(const threshold of (values===frame.paperColor?[120,140,160,175,185,190,195,200,205,210,220,230]:thresholds)){
    regions(values,threshold,frame.w,frame.h,(boundary,count)=>{
      const points=quadFromHull(hull(boundary));if(!points)return;
      const key=points.map(p=>Math.round(p.x/4)+','+Math.round(p.y/4)).join(';');if(keys.has(key))return;keys.add(key);
      const scored=scoreQuad(points,frame,count);if(scored)candidates.push(scored);
    });
  }
  lineQuads(frame,(points,count)=>{const scored=scoreQuad(points,frame,count);if(scored)candidates.push(scored);});
  candidates.sort((a,b)=>b.confidence-a.confidence);
  const best=candidates[0];
  if(!best||best.confidence<.70)return {...fallback,confidence:best?.confidence||0,metrics:{candidateCount:candidates.length,analysisWidth:frame.w,analysisHeight:frame.h}};
  const refined=refineQuad(best.corners,frame);
  const refinedPoints=refined?.map(p=>({x:p.x*(frame.w-1),y:p.y*(frame.h-1)}));
  const refinedScore=refinedPoints&&scoreQuad(refinedPoints,frame,area(refinedPoints));
  // Refinement must still describe the same paper; a nearby board edge can be brighter.
  const selected=refinedScore&&refinedScore.confidence>=best.confidence-.015?refinedScore:best;
  const chosen=selected.corners;
  const cx=chosen.reduce((n,p)=>n+p.x,0)/4,cy=chosen.reduce((n,p)=>n+p.y,0)/4;
  // Subpixel safety margin, independent of how large the document appears.
  const corners=chosen.map(p=>{const dx=(p.x-cx)*(frame.w-1),dy=(p.y-cy)*(frame.h-1),len=Math.hypot(dx,dy);return {x:clamp(p.x+dx/len*.5/(frame.w-1)),y:clamp(p.y+dy/len*.5/(frame.h-1))};});
  return {...selected,corners,found:true,method:'paper-surface-boundaries-v110334',metrics:{...selected.metrics,candidateCount:candidates.length,analysisWidth:frame.w,analysisHeight:frame.h},...(options.debug?{candidates:candidates.slice(0,15)}:{})};
}
export function trackBoundary(previous,detection,now) {
  if(!detection?.found||!validBoundary(detection.corners))return {found:false,corners:null,since:now,lastAt:now,movement:Infinity};
  const old=previous?.found&&now-previous.lastAt<700?previous.corners:null;
  const movement=old?Math.max(...detection.corners.map((p,i)=>Math.hypot(p.x-old[i].x,p.y-old[i].y))):Infinity;
  const continuing=movement<.025;
  const corners=continuing?detection.corners.map((p,i)=>({x:old[i].x*.35+p.x*.65,y:old[i].y*.35+p.y*.65})):detection.corners.map(p=>({...p}));
  return {found:true,corners,since:continuing?previous.since:now,lastAt:now,movement};
}
