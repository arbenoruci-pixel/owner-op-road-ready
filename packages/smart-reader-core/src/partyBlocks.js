import {partyKey} from './partyEvidence.js';
import {explicitPartyRow} from './partyRowEvidence.js';

const raw=match=>match.line.text.slice(match.start,match.end).trim();
const label=match=>match.labelLine||match.line;
const primary=match=>/^\s*CONSIGNED\b(?!\s+TO\b)/i.test(label(match).text);
const second=match=>/^\s*TO\s*:/i.test(label(match).text);
const strong=line=>line.confidence!==null&&line.confidence>=.8;
function nextRow(a,b){
  const x=a.line.box,y=b.line.box;
  return x&&y&&y.y>=x.y+x.height*.65&&y.y-x.y<=Math.max(x.height,y.height)*2.5
    &&Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x)>=Math.min(x.width,y.width)*.7;
}
function wrapped(a,b){
  const x=label(a).box,y=label(b).box;
  return nextRow(a,b)&&x&&y&&y.x>=x.x-.01&&y.x-x.x<=Math.max(.035,x.width*.6);
}

// A wrapped CONSIGNED / TO label can name a company and its facility on two
// rows. Keep both names and their exact ranges. Two complete, unambiguous
// labelled block readings can support that literal text; one stays reviewable.
export function recoverConsigneeBlocks(matches){
  const blocks=[];
  for(const first of matches.filter(primary)){
    const tails=matches.filter(match=>match.observation===first.observation&&second(match)&&wrapped(first,match));
    if(tails.length===1)blocks.push({first,tail:tails[0]});
  }
  // If sparse OCR lost just TO:, use the same full block read elsewhere on
  // this page, and only an aligned, exact matching next row in this image.
  for(const first of matches.filter(primary)){
    if(blocks.some(block=>block.first===first)||!first.line.box||!strong(first.line))continue;
    const known=blocks.filter(block=>block.first.observation!==first.observation&&partyKey(raw(block.first))===partyKey(raw(first)));
    const tails=first.observation.lines.filter(line=>line!==first.line&&strong(line)&&known.some(block=>partyKey(line.text)===partyKey(raw(block.tail)))
      &&nextRow(first,{line}));
    if(tails.length!==1)continue;
    const line=tails[0],value=line.text.trim(),start=line.text.indexOf(value);
    blocks.push({first,tail:{observation:first.observation,line,start,end:start+value.length}});
  }
  const used=new Set();
  for(const block of blocks){
    if(blocks.filter(other=>other.tail.line===block.tail.line&&other.first.observation===block.first.observation).length!==1)continue;
    used.add(block.first);used.add(block.tail);
  }
  const proofs=blocks.filter(({first,tail})=>used.has(first)&&second(tail)&&explicitPartyRow(first)&&explicitPartyRow(tail));
  return matches.flatMap(match=>{
    const block=blocks.find(block=>block.first===match&&used.has(match));
    if(!block)return used.has(match)?[]:[match];
    const {tail}=block;
    const peers=proofs.filter(other=>partyKey(raw(other.first))===partyKey(raw(match))&&partyKey(raw(other.tail))===partyKey(raw(tail)));
    const supported=proofs.includes(block)&&new Set(peers.map(other=>other.first.observation)).size>=2;
    const unresolved=[match.issue,tail.issue].find(issue=>issue&&issue!=='layout_needs_review');
    return [{...match,joinedValue:raw(match)+' / '+raw(tail),issue:unresolved||(supported?undefined:'layout_needs_review'),
      ...(supported?{supportMethod:'corroborated_consigned_block'}:{}),labelLine:label(match),
      continuation:{line:tail.line,start:tail.start,end:tail.end},continuationKind:'party_block',
      extraLabelLines:tail.labelLine?[tail.labelLine]:second(tail)?[tail.line]:[]}];
  });
}
