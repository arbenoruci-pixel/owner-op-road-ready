import test from 'node:test';
import assert from 'node:assert/strict';
import {learnFormat,applyFormat} from './format-memory.mjs';
import {evidenceFor,normalizeInput} from '../../packages/smart-reader-core/src/input.js';

function fixture(value='500.00',id='a',dx=0,dy=0){
  return normalizeInput({documentId:id,pages:[{id:'page-1',number:1,observations:[{id:'owned',source:'owned-line-reader-v2',sourceImageId:'pixels-'+id,lines:[
    {id:'label-1',text:'TOTAL RATE',box:{x:.1+dx,y:.3+dy,width:.15,height:.02}},
    {id:'label-2',text:'CARRIER',box:{x:.1+dx,y:.1+dy,width:.1,height:.02}},
    {id:'value',text:value,box:{x:.4+dx,y:.3+dy,width:.1,height:.02}},
  ]}]}]});
}
const evidence=(input,i)=>evidenceFor(input.pages[0],input.pages[0].observations[0],input.pages[0].observations[0].lines[i],0,input.pages[0].observations[0].lines[i].text.length);
const options=input=>({formatKey:'sample-dispatch',documentKind:'rate_confirmation',field:'total_rate',anchors:[evidence(input,0),evidence(input,1)],valueEvidence:evidence(input,2),documentId:input.documentId,userConfirmed:true,allowLayoutLearning:true});
const scope={formatKey:'sample-dispatch',documentKind:'rate_confirmation'};

test('learns layout with consent and retrieves the new value with current evidence',()=>{
  const old=fixture(),memory=learnFormat(old,options(old));
  assert.equal(JSON.stringify(memory).includes('500.00'),false);
  assert.equal(JSON.stringify(memory).includes('pixels-a'),false);
  const next=fixture('875.50','new',.025,.015),[proposal]=applyFormat(next,memory,scope);
  assert.equal(proposal.rawValue,'875.50');assert.equal(proposal.documentId,'new');
  assert.equal(proposal.evidence.sourceImageId,'pixels-new');assert.equal(proposal.evidence.quote,'875.50');
  assert.equal(proposal.confirmed,false);assert.equal(proposal.automaticAcceptance,false);
});

test('requires current confirmation, geometry, and separate layout-learning consent',()=>{
  const input=fixture(),base=options(input);
  for(const change of [{userConfirmed:false},{allowLayoutLearning:false},{documentId:'old'},
    {valueEvidence:{...base.valueEvidence,box:{...base.valueEvidence.box,x:.8}}}])
    assert.throws(()=>learnFormat(input,{...base,...change}));
});

test('different company scope, kind, shifted labels, or duplicated labels cannot supply a value',()=>{
  const input=fixture(),memory=learnFormat(input,options(input));
  assert.deepEqual(applyFormat(fixture('900','b'),memory,{...scope,formatKey:'another-dispatch'}),[]);
  assert.deepEqual(applyFormat(fixture('900','b'),memory,{...scope,documentKind:'bol'}),[]);
  const shifted=fixture('900','b');shifted.pages[0].observations[0].lines[1].box.x+=.1;
  assert.deepEqual(applyFormat(shifted,memory,scope),[]);
  const duplicate=fixture('900','b');duplicate.pages[0].observations[0].lines.push({...duplicate.pages[0].observations[0].lines[0],id:'copy'});
  assert.deepEqual(applyFormat(duplicate,memory,scope),[]);
});

test('missing or conflicting values never copy the previous document value',()=>{
  const input=fixture(),memory=learnFormat(input,options(input)),missing=fixture('','b');
  assert.deepEqual(applyFormat(missing,memory,scope),[]);
  const conflict=fixture('850','b'),obs=conflict.pages[0].observations[0];
  obs.lines.push({...obs.lines[2],id:'conflict',text:'650'});
  assert.deepEqual(applyFormat(conflict,memory,scope),[]);
});
