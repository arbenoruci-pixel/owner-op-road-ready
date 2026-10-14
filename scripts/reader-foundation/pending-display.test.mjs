import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as projection from '../../packages/smart-reader-core/src/analysisProjection.js';

// Render the source templates with the application's existing React/Next
// dependencies. This is source-component coverage, not a materialized app test.
const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('next/dist/compiled/babel/core');
function component(file,dependencies){
 const {code}=transformSync(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{babelrc:false,configFile:false,
  presets:[[require('next/dist/compiled/babel/preset-react'),{runtime:'classic'}]],
  plugins:[require('next/dist/compiled/babel/plugin-transform-modules-commonjs')]});
 const exports={};
 vm.runInNewContext(code,{exports,require:name=>{
  if(name==='react')return React;
  if(name in dependencies)return dependencies[name];
  throw new Error('Unexpected component dependency: '+name);
 }});
 return exports;
}
const summary=component('./AnalysisSummary.jsx',{'../../../../packages/smart-reader-core/src/analysisProjection.js':projection});
const saved=component('./SavedReadingReview.jsx',{
 '../../../../packages/smart-reader-core/src/analysisProjection.js':projection,
 '../scan/AnalysisSummary.jsx':summary,
 // The existing confirmed-facts/catalog boundary is not changed by this work.
 './sourceCopiesV110419.js':{confirmedSource:doc=>Boolean(doc.extracted?.evidenceFactsV1)},
 './evidenceCoreV110413.js':{kindOf:()=> 'bol',CATALOG:{bol:{fields:['shipper']}},evidenceFieldLabel:()=> 'Shipper'},
});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
function fixture(){
 const snapshot=projection.createAnalysisProjection({selectedType:'bol',selectedLoadNo:'DRIVER-CHOICE',assignment:'driver_selected'});
 snapshot.pages=[{id:'p1',number:1,coverage:{status:'observed',needsReview:true}}];
 const pending=(label,text,issue)=>({label,status:'needs_review',value:null,issues:[issue],candidates:[{rawValue:text,value:null,issue,evidence:[{pageId:'p1',quote:text}]}]});
 snapshot.groups=[{id:'bol-1',kind:'bol',label:'Bill of lading',pageIds:['p1'],fields:{
  shipper:pending('Shipper','Sample Printer','layout_needs_review'),
  documentDate:pending('Ship date','04-07-26','short_date_requires_review'),
  weight:pending('Total weight','18,750','weight_unit_required'),
 }}];
 return snapshot;
}

test('scan summary renders pending source text before the closed coverage disclosure',()=>{
 const snapshot=fixture(),before=JSON.stringify(snapshot),html=render(summary.default,{snapshot});
 for(const text of ['Sample Printer','04-07-26','18,750','Not confirmed','full year and month/day order','weight unit','Page 1'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('Sample Printer')<html.indexOf('<details'));
 assert.ok(!html.includes('<input')&&!html.includes('<button'),'display does not create acceptance actions');
 assert.equal(JSON.stringify(snapshot),before);
});

test('saved review shows pending candidates after storage round-trip, separate from accepted values',()=>{
 const snapshot=fixture();
 snapshot.groups[0].fields.carrier={label:'Carrier',status:'supported',value:'Sample Transport',candidates:[]};
 const document=JSON.parse(JSON.stringify({extracted:{readerAnalysisV1:snapshot}}));
 const html=render(saved.default,{document});
 for(const text of ['Sample Printer','Not confirmed','Sample Transport','Check reading'])assert.ok(html.includes(text),text);
 assert.equal(document.extracted.readerAnalysisV1.groups[0].fields.shipper.value,null);
});

test('current confirmed details and newer saved review take precedence over stale pending readings',()=>{
 const old=fixture(),latest=fixture();latest.groups[0].fields.shipper.candidates[0].rawValue='New Source Printer';
 const document={extracted:{readerAnalysisV1:old}};
 const html=render(saved.default,{document,review:{readerAnalysisV1:latest},latestReview:true});
 assert.ok(html.includes('New Source Printer'));assert.ok(!html.includes('Sample Printer'));
 document.extracted.evidenceFactsV1={fields:{loadNo:'DRIVER-CHOICE',shipper:'Driver Confirmed Printer'}};
 const confirmed=render(saved.default,{document});
 assert.ok(confirmed.includes('Driver Confirmed Printer'));assert.ok(!confirmed.includes('Not confirmed'));
 assert.ok(!confirmed.includes('Sample Printer'));
});

test('conflicting readings are rendered as alternatives and source HTML is escaped',()=>{
 const snapshot=fixture(),field=snapshot.groups[0].fields.shipper;
 field.issues=['conflicting_reads'];
 field.candidates.push({rawValue:'<script>not markup</script>',evidence:[{pageId:'p1',quote:'<script>not markup</script>'}]});
 const html=render(summary.default,{snapshot});
 assert.ok(html.includes('Different possible readings'));assert.ok(html.includes('Sample Printer'));
 assert.ok(html.includes('&lt;script&gt;not markup&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('Different readings were found'));
});

test('capture-only snapshots and resolved readings do not leave a stale pending display',()=>{
 const captured=projection.createAnalysisProjection({selectedType:'pod',selectedLoadNo:'DRIVER-CHOICE'});
 assert.ok(!render(summary.default,{snapshot:captured}).includes('Readings found'));
 const snapshot=fixture();assert.ok(render(summary.default,{snapshot}).includes('Readings found'));
 for(const field of Object.values(snapshot.groups[0].fields)){field.status='confirmed';field.value=field.candidates[0].rawValue;}
 assert.ok(!render(summary.default,{snapshot}).includes('Readings found'));
 assert.equal(render(summary.default,{snapshot:null}),'');
});
