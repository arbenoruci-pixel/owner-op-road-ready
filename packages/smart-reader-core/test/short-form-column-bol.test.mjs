import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
const fixture=()=>{
 const line=(text,x,y,width=.2,height=.015)=>({text,confidence:.96,box:{x,y,width,height}});
 const lines=[
  line('STRIAGHT BILL OF LADING-SHORT FORM ORIGINAL - NOT NEGOTIABLE',.01,.145,.7),
  line('CARRIER: Sample Logistics',.01,.178,.32),line('DATE',.65,.125,.05),line('10-08-26',.78,.121,.1),
  line('TO',.015,.308,.025,.008),line('FROM: SHIPPER',.64,.311,.11,.008),
  line('Example Receiver',.148,.322,.2),line('Example Printer',.763,.325,.2),
  line('STREET',.016,.338,.06),line('STREET',.64,.342,.06),
  line('200 Sample Road',.148,.353,.2),line('100 Sample St',.763,.357,.2),
  line('DESTINATION',.016,.371,.1,.008),line('ORIGIN - CITY, STATE, ZIP',.64,.376,.24,.008),
  line('Omaha, NE 68138',.148,.384,.2),line('Lisbon, ME 04250',.72,.389,.2),
  line('KIND OF PACKAGING, DESCRIPTION OF ARTICLES, SPECIAL MARKS',.148,.434,.5,.008),
  line('SHIPPER',.01,.88,.1),line('Example Footer Name',.01,.90,.2),
  line('CARRIER',.45,.88,.1),line('AUTHORIZED SIGNATURE',.45,.92,.3),line('Unreadable handwriting',.45,.94,.3),
 ];
 return {documentId:'synthetic-short-form',pages:[{number:1,observations:[{id:'scan',sourceImageId:'original-1',lines}]}]};
};
test('damaged short-form title and opposite party columns retain exact source evidence',()=>{
 const input=fixture(),before=structuredClone(input),r=readDocument(input),d=r.documents[0];
 assert.equal(d.kind,'bol');assert.equal(r.pageIdentities[0].status,'needs_review');
 assert.equal(d.fields.carrier.value,'Sample Logistics');
 assert.deepEqual(d.fields.shipper.candidates.map(c=>c.rawValue),['Example Printer']);
 assert.deepEqual(d.fields.consignee.candidates.map(c=>c.rawValue),['Example Receiver']);
 assert.equal(d.fields.documentDate.value,null);assert.equal(d.fields.documentDate.candidates[0].rawValue,'10-08-26');
 for(const field of Object.values(d.fields))for(const c of field.candidates)for(const e of c.evidence)assert.ok(resolveEvidence(r,e));
 assert.ok(r.pageIdentities[0].evidence.some(e=>e.evidence.quote.includes('STRIAGHT')));
 assert.deepEqual(input,before);
});
test('generic authorized carrier handwriting never certifies delivery',()=>{
 const r=readDocument(fixture());assert.equal(r.documents[0].kind,'bol');assert.equal(r.documents[0].canAutoFile,false);
});
test('explicit named receiver signature refines the same complete form to POD',()=>{
 const input=fixture();input.pages[0].observations[0].lines.push({text:'CONSIGNEE SIGNATURE: Jane Example',confidence:.96,box:{x:.1,y:.96,width:.5,height:.02}});
 assert.equal(readDocument(input).documents[0].kind,'pod');
});
test('each independent form label is mandatory and partial reads are never pooled',()=>{
 for(const label of ['FROM: SHIPPER','TO','CARRIER: Sample Logistics','DESTINATION','ORIGIN - CITY, STATE, ZIP','KIND OF PACKAGING, DESCRIPTION OF ARTICLES, SPECIAL MARKS']){
  const input=fixture();input.pages[0].observations[0].lines=input.pages[0].observations[0].lines.filter(l=>l.text!==label);
  assert.equal(readDocument(input).documents[0].kind,'unknown',label);
 }
 const input=fixture(),o=input.pages[0].observations[0];const removed=o.lines.filter(l=>l.text==='FROM: SHIPPER');o.lines=o.lines.filter(l=>!removed.includes(l));
 input.pages[0].observations.push({id:'partial',sourceImageId:'crop-2',lines:removed});
 assert.equal(readDocument(input).documents[0].kind,'unknown');
});
