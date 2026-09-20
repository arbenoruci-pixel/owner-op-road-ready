// Original, opt-in layout memory. Store labels and relative geometry only.
// Every proposal reads a NEW source line and remains unconfirmed.
import {normalizeInput,evidenceFor,resolveEvidence} from '../../packages/smart-reader-core/src/input.js';

const normalized=text=>text.trim().replace(/\s+/g,' ').toUpperCase();
const sameBox=(a,b)=>a&&b&&['x','y','width','height'].every(k=>a[k]===b[k]);
const midpoint=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

function checkedLine(input,evidence){
  const {page,observation,line}=resolveEvidence(input,evidence);
  if(!line.box||!sameBox(line.box,evidence.box)||evidence.sourceImageId!==observation.sourceImageId||
      evidence.source!==observation.source||evidence.start!==0||evidence.end!==line.text.length)
    throw new Error('Select an exact, complete current source line with its original geometry');
  return {page,observation,line};
}

export function learnFormat(input,options){
  const {formatKey,documentKind,field,anchors,valueEvidence,userConfirmed,allowLayoutLearning,documentId}=options;
  if(userConfirmed!==true||allowLayoutLearning!==true)throw new Error('Confirmation and explicit layout-learning consent are required');
  input=normalizeInput(input);
  if(documentId!==input.documentId)throw new Error('Confirmation belongs to another document');
  if(![formatKey,documentKind,field].every(v=>typeof v==='string'&&v.trim()))throw new Error('Format, document kind, and field are required');
  if(!Array.isArray(anchors)||anchors.length<2||anchors.length>6)throw new Error('Select two to six stable labels');
  const value=checkedLine(input,valueEvidence);
  const labels=anchors.map(evidence=>{
    const selected=checkedLine(input,evidence);
    const text=normalized(selected.line.text);
    if(text.length<3||text.length>80||/\d/.test(text))throw new Error('Anchors must be stable text labels, without document numbers');
    if(selected.page.id!==value.page.id||selected.observation.id!==value.observation.id)
      throw new Error('All labels and the value must come from one page observation');
    return {text,box:{...selected.line.box}};
  });
  if(new Set(labels.map(l=>l.text)).size!==labels.length)throw new Error('Labels must be distinct');
  if(labels.some(l=>l.text===normalized(value.line.text)))throw new Error('Do not learn a field value as a label');
  // Keep only selected label text and geometry. The previous field value,
  // source image, and complete transcript are absent from this record.
  return {version:1,formatKey,documentKind,field,labels,valueBox:{...value.line.box},
          policy:'suggest-only',learnedFromConfirmation:true};
}

function overlap(a,b){
  const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*
    Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return area/(a.width*a.height+b.width*b.height-area);
}

export function applyFormat(input,memory,{formatKey,documentKind}){
  input=normalizeInput(input);
  const validBox=box=>box&&['x','y','width','height'].every(k=>Number.isFinite(box[k]))&&box.x>=0&&box.y>=0&&box.width>0&&box.height>0&&box.x+box.width<=1.000001&&box.y+box.height<=1.000001;
  if(!memory||memory.version!==1||memory.policy!=='suggest-only'||memory.learnedFromConfirmation!==true||
      !Array.isArray(memory.labels)||memory.labels.length<2||memory.labels.length>6||
      !memory.labels.every(label=>typeof label.text==='string'&&validBox(label.box))||!validBox(memory.valueBox)||
      memory.formatKey!==formatKey||memory.documentKind!==documentKind)return [];
  const proposals=[];
  for(const page of input.pages)for(const observation of page.observations){
    const matched=memory.labels.map(label=>observation.lines.filter(line=>line.box&&normalized(line.text)===label.text));
    // Repeated labels are ambiguous; do not choose one by luck.
    if(matched.some(lines=>lines.length!==1))continue;
    const deltas=matched.map((lines,i)=>{
      const current=midpoint(lines[0].box),known=midpoint(memory.labels[i].box);
      return {x:current.x-known.x,y:current.y-known.y};
    });
    const dx=median(deltas.map(d=>d.x)),dy=median(deltas.map(d=>d.y));
    if(Math.abs(dx)>.12||Math.abs(dy)>.12||deltas.some(d=>Math.abs(d.x-dx)>.015||Math.abs(d.y-dy)>.015))continue;
    if(matched.some((lines,i)=>{
      const a=lines[0].box,b=memory.labels[i].box;
      return Math.abs(a.width/b.width-1)>.25||Math.abs(a.height/b.height-1)>.25;
    }))continue;
    const target={...memory.valueBox,x:memory.valueBox.x+dx,y:memory.valueBox.y+dy};
    const labelIds=new Set(matched.map(lines=>lines[0].id));
    const values=observation.lines.filter(line=>line.box&&line.text.trim()&&!labelIds.has(line.id)&&overlap(target,line.box)>.45);
    if(values.length!==1)continue;
    const line=values[0];
    proposals.push({documentId:input.documentId,pageId:page.id,field:memory.field,rawValue:line.text,
      evidence:evidenceFor(page,observation,line,0,line.text.length),status:'needs_review',confirmed:false,
      origin:'owned-format-memory-v1',automaticAcceptance:false});
  }
  // Multiple pages/observations may represent conflicting readings of the format.
  return proposals.length===1?proposals:[];
}
