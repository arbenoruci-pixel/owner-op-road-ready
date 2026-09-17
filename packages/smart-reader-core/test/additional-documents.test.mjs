import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,confirmField} from '../src/index.js';
import {additionalCases} from '../../../scripts/v110369/catalogFixture.mjs';
for(const [kind,title,body,fields] of additionalCases)test('extended document profile: '+kind,()=>{
 const r=readDocument({documentId:'example',pages:[{observations:[textObservation(title+'\n'+body)]}]});
 assert.equal(r.documents[0].kind,kind);
 for(const [key,value]of Object.entries(fields))assert.equal(r.documents[0].fields[key].value,value);
 assert.equal(r.documents[0].canAutoFile,false);
});
test('Bill of Sale photographed below the page margin retains its identity and VIN semantics',()=>{
 const lines=['BILL OF SALE','BIDDER: 12345','SERIAL # 1HGBH41JXMN109186','SELLER: EXAMPLE EQUIPMENT'].map((text,i)=>({id:String(i),text,confidence:.95,box:{x:.1,y:.34+i*.1,width:.7,height:.035}}));
 const result=readDocument({documentId:'photo',pages:[{observations:[{id:'ocr',sourceImageId:'photo-1',lines}]}]});
 assert.equal(result.documents[0].kind,'bill_of_sale');assert.equal(result.documents[0].fields.vin.value,'1HGBH41JXMN109186');
 assert.equal(result.documents[0].fields.bolNumber,undefined);assert.equal(result.documents[0].fields.destination,undefined);
});
test('Restaurant receipts without a generic heading remain recognizable with review',()=>{
 const r=readDocument({documentId:'meal',pages:[{observations:[textObservation('Example Diner\nTable: 12\nServer: Sam\nSubtotal 15.00\nTip 3.00\nTotal 18.00\nPaid: cash')]}]});
 assert.equal(r.documents[0].kind,'meal_receipt');assert.equal(r.documents[0].identityStatus,'needs_review');assert.equal(r.documents[0].fields.total.value,'18.00');
});
test('Equipment bills of sale extract and confirm shorter serial identifiers separately from VINs',()=>{
 const r=readDocument({documentId:'equipment',pages:[{observations:[textObservation('BILL OF SALE\nSELLER: EXAMPLE EQUIPMENT\nSERIAL # EQ-57284/A\nUNIT # T-889')]}]});
 const group=r.documents[0],serial=group.fields.serialNumber;
 assert.equal(group.kind,'bill_of_sale');assert.equal(serial.value,'EQ-57284/A');assert.equal(group.fields.vin.value,null);
 assert.equal(group.fields.vin.required,false);
 const next=confirmField(r,{documentId:r.documentId,groupId:group.id,field:'serialNumber',rawValue:'EQ-57285/A',evidence:serial.candidates[0].evidence[0],userConfirmed:true,expectedRawValues:serial.candidates.map(c=>c.rawValue),expectedRevision:r.reviewRevision});
 assert.equal(next.documents[0].fields.serialNumber.value,'EQ-57285/A');assert.equal(next.documents[0].fields.serialNumber.status,'confirmed');
});
