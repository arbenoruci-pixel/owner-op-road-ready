// Focused candidate/field regression harness. Matcher and normalization inputs
// are controlled; this is not a full readDocument, OCR, browser or persistence test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
function harness(text=source) {
  const sandbox={
    pageFieldMatches:page=>page.matches,
    evidenceFor:(page,observation,line,start,end)=>({
      pageId:page.id,observationId:observation.id,lineId:line.id,
      start,end,quote:line.text.slice(start,end),source:'pdf-text-layer',
      sourceImageId:page.id+':'+observation.id,box:line.box??null,
      recognizerConfidence:line.confidence??1,
    }),
    expandShortYear:(raw,context)=>/^\d{2}\/\d{2}\/\d{2}$/.test(raw)&&context
      ? raw.slice(0,-2)+context.year : null,
    normalizeValue:(_kind,value)=>({value}),
    partyKey:value=>value,
  };
  vm.createContext(sandbox);
  vm.runInContext(text.replace(/^import .*;\n/gm,'').replaceAll('export function ','function ')+
    '\nglobalThis.api={candidatesFor,extractField,'+
    (text.includes('function appendUniqueEvidence')?'appendUniqueEvidence':'')+'};',sandbox);
  return sandbox.api;
}
const patched=harness();
// Recreate the two original append operations to compare decision behavior.
const legacy=harness(source
 .replace('appendUniqueEvidence(candidate.labelEvidence,dateContext.evidence);',
          'candidate.labelEvidence.push(...dateContext.evidence);')
 .replace('appendUniqueEvidence(candidate.labelEvidence,[evidenceFor(page,observation,labelLine,0,labelLine.text.length)]);',
          'candidate.labelEvidence.push(evidenceFor(page,observation,labelLine,0,labelLine.text.length));'));
const plain=value=>JSON.parse(JSON.stringify(value));
const spec={label:'Pickup date',kind:'date',required:true};
function fixture() {
  const dateContext={year:2026,evidence:Array.from({length:8},(_,i)=>({
    pageId:i<2?'rate-page':'certificate-page',observationId:'context-'+i,
    lineId:'ref-'+i,quote:i<2?'SYNTHETIC-REFERENCE':'2026',recognizerConfidence:1,
  }))};
  const matches=['native','layout'].flatMap(id=>[0,1].map(occurrence=>({
    observation:{id},line:{id:'appointment',text:'10/04/26 08:00 to 10/04/26 16:00'},
    start:occurrence===0?0:18,end:occurrence===0?8:26,
    issue:'layout_needs_review',labelLine:{id:'pickup',text:'PICK 1'},
  })));
  return {pages:[{id:'rate-page',matches}],dateContext};
}
const withoutLabels=candidates=>plain(candidates).map(({labelEvidence,...rest})=>rest);

test('four date matches retain ten distinct labels instead of 36 repeats',()=>{
 const {pages,dateContext}=fixture();
 const before=legacy.candidatesFor(pages,spec,dateContext);
 const after=patched.candidatesFor(pages,spec,dateContext);
 assert.equal(before[0].labelEvidence.length,36);
 assert.equal(after[0].labelEvidence.length,10);
 assert.deepEqual(withoutLabels(after),withoutLabels(before));
 assert.equal(after[0].evidence.length,4,'direct source observations are retained');
});
test('field values, review status and issues remain identical',()=>{
 const {pages,dateContext}=fixture();
 const before=legacy.extractField(pages,spec,dateContext),after=patched.extractField(pages,spec,dateContext);
 const summarize=f=>plain({value:f.value,status:f.status,issues:f.issues});
 assert.deepEqual(summarize(after),summarize(before));
 assert.equal(after.status,'needs_review');assert.equal(after.value,null);
 assert.ok(after.issues.includes('layout_needs_review'));
});
test('duplicate input labels are removed in first-seen order',()=>{
 const target=[];const a={pageId:'one',quote:'A'},b={pageId:'two',quote:'B'};
 patched.appendUniqueEvidence(target,[a,a,b,a,b]);assert.deepEqual(target,[a,b]);
});
test('distinct pages, observations, quotes, boxes and confidence survive',()=>{
 const original={pageId:'one',observationId:'native',quote:'ABO12',box:null,recognizerConfidence:1};
 const variants=[original,{...original,pageId:'two'},{...original,observationId:'ocr'},
  {...original,quote:'AB012'},{...original,box:{x:.1,y:.2,width:.1,height:.01}},
  {...original,recognizerConfidence:.5}];
 const target=[];patched.appendUniqueEvidence(target,[...variants,...variants]);
 assert.deepEqual(target,variants);
});
test('low-confidence source warning remains visible after deduplication',()=>{
 const {pages,dateContext}=fixture();dateContext.evidence[0].recognizerConfidence=.4;
 const after=patched.extractField(pages,spec,dateContext);
 assert.equal(after.status,'needs_review');assert.ok(after.issues.includes('weak_recognition'));
});
test('conflicting date candidates are retained and cannot become supported',()=>{
 const {pages,dateContext}=fixture();
 pages[0].matches.push({...pages[0].matches[0],line:{id:'different-date',text:'10/05/26'}});
 const after=patched.extractField(pages,spec,dateContext);
 assert.equal(after.candidates.length,2);assert.equal(after.status,'needs_review');
 assert.ok(after.issues.includes('conflicting_reads'));assert.equal(after.value,null);
});
test('frozen source matches and year context are never mutated',()=>{
 const f=fixture(),before=plain(f);
 function freeze(value){Object.freeze(value);for(const v of Object.values(value))if(v&&typeof v==='object')freeze(v);}
 freeze(f);patched.candidatesFor(f.pages,spec,f.dateContext);assert.deepEqual(plain(f),before);
});
test('without year context only repeated labels change; empty fields remain exact',()=>{
 const {pages}=fixture();
 const before=legacy.candidatesFor(pages,spec),after=patched.candidatesFor(pages,spec);
 assert.equal(before[0].labelEvidence.length,4);
 assert.equal(after[0].labelEvidence.length,2);
 assert.deepEqual(withoutLabels(after),withoutLabels(before));
 assert.deepEqual(plain(after[0].labelEvidence),plain([before[0].labelEvidence[0],before[0].labelEvidence[2]]));
 const decision=field=>plain({value:field.value,status:field.status,issues:field.issues});
 assert.deepEqual(decision(patched.extractField(pages,spec)),decision(legacy.extractField(pages,spec)));
 assert.deepEqual(plain(patched.extractField([],spec)),plain(legacy.extractField([],spec)));
});
test('repeated reads produce identical labels without accumulating context',()=>{
 const {pages,dateContext}=fixture();
 const first=patched.candidatesFor(pages,spec,dateContext);
 for(let i=0;i<5;i++)assert.deepEqual(plain(patched.candidatesFor(pages,spec,dateContext)),plain(first));
 assert.equal(dateContext.evidence.length,8);
});
