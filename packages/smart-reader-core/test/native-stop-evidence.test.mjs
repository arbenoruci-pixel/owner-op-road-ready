import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {rateInput} from './rate-confirmation-fixture.mjs';
const cell=(id,text,x,y,width=.2,height=.011)=>({id,text,confidence:1,box:{x,y,width,height}});
export function nativeStopInput(){
  const input=rateInput();
  input.pages[0].observations.push({id:'native-layout',source:'pdf-text-layer',sourceImageId:'synthetic-rate-page',lines:[
    cell('pick','PICK 1',.037,.406,.066,.013),cell('placeholder','PICK UP',.111,.423,.06),
    cell('pickup-street','123 EXAMPLE RD',.111,.438,.2),
    cell('pickup-time','Appointment 09/16/26 08:00 to 09/16/26 16:00',.515,.438,.36),
    cell('pickup-city','ALBANY NY 12207',.111,.453,.18),
    cell('drop','STOP 1',.037,.482,.063,.013),cell('receiver','EXAMPLE RECEIVING LLC',.111,.498,.25),
    cell('delivery-street','456 SAMPLE ST',.111,.514,.2),
    cell('delivery-time','Appointment 09/22/26 08:00 to 09/22/26 16:00',.515,.514,.36),
    cell('delivery-city','MADISON WI 53703',.111,.529,.18),
    cell('terms','$150 PER DAY LATE FEE, IF DELIVERED AFTER 7 DAYS',.108,.56,.47),
  ]});
  input.pages.push({id:'certificate',observations:[textObservation('REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON\nSYNTHETIC-REFERENCE 16 SEP 2026 22:20:45\nSIGNER TIMESTAMP SIGNATURE\nSIGNED')]});
  return input;
}
const supportedKeys=['pickupAddress','deliveryAddress','pickupAppointment','deliveryAppointment','pickupDate','deliveryDate','consignee'];
const fields=input=>readDocument(input).documents[0].fields;
const change=(input,id)=>input.pages[0].observations[1].lines.find(l=>l.id===id);
function sources(result){for(const group of result.documents)for(const field of Object.values(group.fields))for(const c of field.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);}

test('complete native-PDF stop blocks populate seven fields with traceable role evidence',()=>{
 const input=nativeStopInput(),before=JSON.stringify(input),result=readDocument(input),f=result.documents[0].fields;
 for(const key of supportedKeys){assert.equal(f[key].status,'supported',key);assert.ok(f[key].candidates.some(c=>c.evidence.some(e=>e.supportMethod==='native_stop_block')),key);}
 assert.equal(f.pickupAddress.value,'123 EXAMPLE RD, ALBANY NY 12207');assert.equal(f.deliveryAddress.value,'456 SAMPLE ST, MADISON WI 53703');
 assert.equal(f.pickupDate.value,'2026-09-16');assert.equal(f.deliveryDate.value,'2026-09-22');
 assert.equal(f.pickupAppointment.value,'09/16/26 08:00 to 09/16/26 16:00');
 assert.equal(f.totalRate.value,'2300.00');assert.equal(f.weight.value,null);assert.equal(f.shipper.status,'missing');
 assert.equal(result.calibration.automaticAcceptance,false);assert.equal(result.documents[0].canAutoFile,false);
 assert.deepEqual(result.corrections,[]);assert.equal(JSON.stringify(input),before);sources(result);
});

test('missing, weak, misplaced or extra cells cannot prove a native stop association',()=>{
 const cases=[
  i=>{change(i,'pick').confidence=.7;},i=>{change(i,'pickup-city').confidence=.7;},
  i=>{change(i,'pickup-time').confidence=.7;},i=>{change(i,'receiver').confidence=null;},
  i=>{change(i,'pickup-street').box=null;},i=>{change(i,'drop').box=null;},
  i=>{change(i,'pickup-time').box.y=.46;},i=>{change(i,'pickup-city').box.x=.6;},
  i=>{change(i,'pickup-city').box.y=.56;},i=>{change(i,'receiver').box.x=.6;},
  i=>{change(i,'delivery-street').box.x=.4;},i=>{change(i,'pickup-time').box.x=.2;},
  i=>{change(i,'drop').box.y=.407;},i=>{change(i,'pick').box.x=.6;},
  i=>{change(i,'drop').text='STOP 2';},i=>{change(i,'pick').text='PICK 2';},
  i=>{i.pages[0].observations[1].source='existing-phone-ocr';},
  i=>{i.pages[0].observations[1].lines.splice(5,0,cell('extra','777 OTHER ST',.111,.47));},
  i=>{i.pages[0].observations[1].lines.splice(10,0,cell('extra-city','OTHER CITY IL 60601',.111,.545));},
  i=>{i.pages[0].observations[1].lines.splice(4,0,cell('other-time','Appointment 09/17/26 08:00',.515,.451,.36));},
 ];
 for(const [index,alter]of cases.entries()){
  const input=nativeStopInput();alter(input);const f=fields(input);
  for(const key of supportedKeys)assert.notEqual(f[key].status,'supported',`${index}: ${key}`);
 }
});

test('repeating unpositioned native views does not substitute for role-and-block proof',()=>{
 const input=nativeStopInput();input.pages[0].observations[1].lines.forEach(l=>l.box=null);
 input.pages[0].observations.push({...structuredClone(input.pages[0].observations[1]),id:'duplicate-view'});
 for(const key of supportedKeys)assert.notEqual(fields(input)[key].status,'supported',key);
});

test('the entire block is checked even if a competing address follows the extraction window',()=>{
 const input=nativeStopInput(),o=input.pages[0].observations[1];
 o.lines=o.lines.filter(l=>l.id!=='terms');
 o.lines.push(...Array.from({length:5},(_,n)=>cell('glyph'+n,'\x02',.1,.55+n*.012,.01)));
 o.lines.push(cell('extra-street','777 OTHER AVE',.111,.62),cell('extra-city','CHICAGO IL 60601',.111,.635));
 assert.notEqual(fields(input).deliveryAddress.status,'supported');
});

test('multiple pickups or generic stops cannot become one supported delivery',()=>{
 for(const marker of ['STOP 2','PICK 2','DELIVERY 2']){
  const input=nativeStopInput();input.pages[0].observations[1].lines.push(cell('third',marker,.037,.68,.08));
  assert.notEqual(fields(input).deliveryAddress.status,'supported',marker);
 }
});

test('different native values remain conflicts against existing text evidence',()=>{
 const input=nativeStopInput();change(input,'delivery-street').text='999 DIFFERENT ST';
 const f=fields(input);assert.equal(f.deliveryAddress.value,null);assert.ok(f.deliveryAddress.issues.includes('conflicting_reads'));
 assert.equal(f.pickupAddress.value,'123 EXAMPLE RD, ALBANY NY 12207');
});

test('cross-day windows and ambiguous dates retain their date review guards',()=>{
 const input=nativeStopInput();change(input,'delivery-time').text='Appointment 09/22/26 08:00 to 09/23/26 16:00';
 const f=fields(input);assert.equal(f.deliveryDate.value,null);assert.ok(f.deliveryDate.issues.includes('conflicting_reads'));
 const absent=nativeStopInput();absent.pages.pop();assert.equal(fields(absent).pickupDate.value,null);assert.ok(fields(absent).pickupDate.issues.includes('unrecognized_date'));
});

test('a cell in another observation cannot complete the block',()=>{
 const input=nativeStopInput(),o=input.pages[0].observations[1],time=change(input,'pickup-time');
 o.lines=o.lines.filter(l=>l!==time);input.pages[0].observations.push({...o,id:'detached-cell',lines:[time]});
 assert.notEqual(fields(input).pickupAppointment.status,'supported');
});

test('bounded explicit DELIVERY marker is supported with the same source checks',()=>{
 const input=nativeStopInput();change(input,'drop').text='DELIVERY';
 assert.equal(fields(input).deliveryAddress.status,'supported');sources(readDocument(input));
});

test('exact label duplicates are removed while each distinct supporting source survives',()=>{
 const result=readDocument(nativeStopInput());
 for(const field of Object.values(result.documents[0].fields))for(const candidate of field.candidates){
  const labels=candidate.labelEvidence||[];assert.equal(labels.length,new Set(labels.map(e=>JSON.stringify(e))).size);
 }
 const date=result.documents[0].fields.pickupDate;
 assert.ok(date.candidates[0].labelEvidence.some(e=>e.pageId==='certificate'));
 assert.ok(date.candidates[0].labelEvidence.some(e=>e.lineId==='pick'));
});
