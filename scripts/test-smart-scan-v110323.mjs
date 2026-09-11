import assert from 'node:assert/strict';
import {qualifyDocumentFieldsV11038 as qualify} from '../source/src/modules/scan/documentFieldSemanticsV11038.js';
import {matchScanDocumentToLoadV11037 as match,referenceIsOnDocumentV11037} from '../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {normalizePaperV110323} from '../source/src/modules/scan/paperQualityV110323.js';
import {missionSnapshotV1038} from '../source/src/modules/home/adaptiveHomeLogicV1038.js';
const text=`BILL OF LADING
Bill of Lading Number: 87123456
DATE: 09/10/2026
SHIP FROM: EXAMPLE WAREHOUSE OF AMERICA
1215 Example Road
Windsor, CT 06095
SHIP TO: Example Receiver
10 Test Road
Coldwater, MI 49036
CARRIER: Sample Carrier LLC
TOTAL WEIGHT: 33374 LB`;
const pass=(id,text,confidence=.9)=>({id,text,confidence,page:1});
const raw={type:{id:'bol'},text,fields:{},ocrEvidenceV110323:[pass('clean',text),pass('sparse',text.replace('Sample Carrier LLC','SAMPLE CARRIER, LLC')),pass('source',text.replace('09/10/2026','09/10/2025'),.75)]};
const fixed=qualify(raw);
assert.equal(fixed.fields.bolNo,'87123456');assert.equal(fixed.fields.documentDate,'2026-09-10');assert.equal(fixed.fields.origin,'Windsor, CT');assert.equal(fixed.fields.destination,'Coldwater, MI');assert.equal(fixed.fields.carrierName,'Sample Carrier LLC');
assert.ok(!fixed.evidenceReviewV11036.issues.some(s=>s.startsWith('More than one Carrier')));
const columns='BILL OF LADING\nBOL NO: 26023311\nDATE: 09/08/2026\nSHIP TO: REEB MILLWORK OF NEW ENGLAND\n19 BUSINESS PARK DRIVE\nSMITHFIELD, RIO2917\nSHIP FROM! THERMA TRU HOWE\n8055 NORTH STATE ROAD9\nHOWE, IN 46746';
const columnRead=qualify({type:{id:'bol'},text:columns,fields:{}});assert.equal(columnRead.fields.destination,'SMITHFIELD, RI');assert.equal(columnRead.fields.origin,'HOWE, IN');
const damagedColumns=qualify({type:{id:'bol'},text:columns.replace('SMITHFIELD, RIO2917\nSHIP FROM!', 'unreadable line SHIP FROM!'),fields:{}});assert.equal(damagedColumns.fields.destination,undefined,'an unreadable destination cannot take the origin address');
const unresolved=qualify({...raw,ocrEvidenceV110323:raw.ocrEvidenceV110323.slice(1)});assert.equal(unresolved.fields.documentDate,undefined);
const store={loads:[{id:'load_38324346',loadNo:'38324346',origin:'Windsor, CT',destination:'Coldwater, MI',pickupDate:'2026-09-10',deliveryDate:'2026-09-11',status:'open',source:'rate_confirmation_v105'}],documents:[]};
const options={state:{},businessStore:store,typeId:'bol',fields:fixed.fields,analysis:fixed};
assert.equal(match(options).loadNo,'38324346');assert.equal(match(options).source,'document_route');
assert.equal(match({...options,fields:{...fixed.fields,documentDate:'2025-09-10'}}).matched,false);
assert.equal(match({...options,businessStore:{...store,loads:[...store.loads,{...store.loads[0],loadNo:'99990000',id:'load_99990000'}]}}).matched,false);
assert.equal(match({...options,analysis:{...fixed,fieldEvidence:{}},fields:{...fixed.fields,loadNo:'unread'}}).matched,false);
assert.equal(referenceIsOnDocumentV11037('87123456','BOL NO 8712 3456'),true);assert.equal(referenceIsOnDocumentV11037('87123456','BOL NO 1871234560'),false);
const w=240,h=320,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,shadow=x<w/2;data[i]=shadow?65:225;data[i+1]=shadow?95:230;data[i+2]=shadow?150:235;data[i+3]=255;if(x%40>12&&x%40<17&&y%30>10&&y%30<16){data[i]=10;data[i+1]=15;data[i+2]=25;}}
const before=new Uint8ClampedArray(data),out=normalizePaperV110323({width:w,height:h,data});assert.deepEqual(data,before);
const paper=out.data[(20*w+20)*4];assert.ok(paper>225);assert.ok(Math.abs(out.data[(20*w+20)*4+2]-paper)<5);assert.ok(out.data[(12*w+14)*4]<80,'dark print is preserved');
const snapshot=missionSnapshotV1038({guide:{stops:[{type:'pickup',cityState:'Windsor, CT'},{type:'delivery',cityState:'Coldwater, MI'}]},currentStep:{id:'route_pickup',phase:'pickup'},steps:[],bol:{id:'bol'}},{currentStop:1});assert.equal(snapshot.currentStop.cityState,'Windsor, CT');assert.equal(snapshot.bolPresent,true);
console.log('PASS — independent OCR consensus, labeled addresses, exact route/date match, ambiguity, paper lighting and Home document status');
