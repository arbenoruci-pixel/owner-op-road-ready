import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {hasReadableBolReference,planBolIdentifierRegion} from '../src/ocrRetry.js';

const box=(x=.7,y=.1,width=.2)=>({x,y,width,height:.012});
const line=(text,area=box(),confidence=.96)=>({text,box:area,confidence});
const observation=(id,lines)=>({id,sourceImageId:id,lines:[line('BILL OF LADING',box(.2,.02,.4)),line('SHIP FROM: Example Foods',box(.1,.2,.3)),line('SHIP TO: Example Market',box(.1,.3,.3)),...lines]});
const input=observations=>({documentId:'synthetic-fragments',pages:[{id:'page-1',observations}]});
const field=value=>readDocument(value).documents[0].fields.bolNumber;

test('overlapping partial identifiers cannot support a truncated BOL',()=>{
  const value=input([observation('clean',[line('B/L NO.: 7318642'),line('0047318',box(.8,.1,.06))]),
    observation('source',[line('0047318642',box(.8,.1,.095))])]);
  const before=structuredClone(value),result=readDocument(value),bol=result.documents[0].fields.bolNumber;
  assert.equal(bol.value,null);assert.equal(bol.status,'needs_review');
  assert.ok(bol.issues.includes('identifier_fragments'));
  assert.deepEqual(new Set(bol.candidates.map(c=>c.rawValue)),new Set(['7318642','0047318','0047318642']));
  for(const c of bol.candidates)for(const evidence of c.evidence)resolveEvidence(result,evidence);
  assert.deepEqual(value,before);assert.equal(result.pageCount,1);
});

test('unlabelled extensions preserve source evidence but never replace the number automatically',()=>{
  for(const [first,second] of [['007318642','7318642'],['7318642','731864299']]){
    const value=input([observation('clean',[line('BOL NO: '+first)]),observation('retry',[line(second)])]);
    assert.equal(field(value).value,null);assert.ok(field(value).issues.includes('identifier_fragments'));
  }
  const value=input([observation('source',[line('0047318642')])]);
  assert.equal(field(value).status,'missing','a standalone number has no BOL field identity');
});

test('unrelated rows, repeated complete values and other pages cannot corrupt a BOL',()=>{
  const base=observation('clean',[line('BOL NO: 7318642')]);
  for(const extra of [line('7318642'),line('555129876'),line('0047318642',box(.7,.7)),line('Previous BOL NO: 0047318642'),{text:'0047318642',confidence:.99}]){
    assert.equal(field(input([base,observation('retry',[extra])])).value,'7318642');
  }
  const value=input([base]);value.pages.push({id:'page-2',observations:[observation('other',[line('0047318642')])]});
  assert.equal(field(value).value,'7318642');
  assert.equal(field(input([observation('source',[line('BOL NO: X-18'),line('981278912')])])).value,'X-18');
});

test('reread eligibility checks confidence, split fragments and all competing passes',()=>{
  const pass=(value,confidence=96)=>({text:'BOL NO: '+value,lines:[{text:'BOL NO: '+value,confidence,left:100,top:100,width:220,height:20}],imageSize:{width:1000,height:1000}});
  assert.equal(hasReadableBolReference([pass('B-18')]),true);
  assert.equal(hasReadableBolReference([pass('B-18',70)]),false);
  assert.equal(hasReadableBolReference([pass('B-18'),pass('B-19')]),false);
  const fragmented=pass('7318642');fragmented.lines.push({text:'0047318',confidence:98,left:225,top:100,width:80,height:20});
  assert.equal(hasReadableBolReference([fragmented]),false);
  assert.equal(hasReadableBolReference([]),false);
});

test('long and clipped Bill of Lading labels propose only small header rereads',()=>{
  const size={width:1800,height:2300},word=(text,left,top=200)=>({text,left,top,width:text.length*9,height:18});
  for(const spelling of ['Lading','Ladin','Ladi']){
    const words=[word('Bill',900),word('of',941),word(spelling,965),word('Number:',1034),word('X1842',1110)];
    const region=planBolIdentifierRegion(words,size);
    assert.ok(region);assert.ok(region.left<=900&&region.left+region.width>=1155);
    assert.ok(region.width*region.height<size.width*size.height*.06);
    assert.equal(planBolIdentifierRegion([word('Previous',805),...words],size),null);
    assert.equal(planBolIdentifierRegion(words.map(w=>({...w,top:1800})),size),null);
    assert.equal(planBolIdentifierRegion(words.filter(w=>w.text!=='Number:'),size),null);
  }
  assert.equal(planBolIdentifierRegion([word('Bill',900),word('of',941),word('Materials',965),word('Number:',1080)],size),null);
});
