import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../src/index.js';
import {confirmPageField,confirmDocumentKind,reviewQueue,savedReadingReview} from '../src/recovery.js';
function input(text='BILL OF LADING\nSHIP FROM: Example Sender\nSHIP TO: Example Receiver'){
 return readDocument({documentId:'scan',pages:[{id:'p1',observations:[{...textObservation(text),sourceImageId:'source-1'}]},{id:'p2',observations:[{...textObservation('Unreadable text'),sourceImageId:'source-2'}]}]});
}
const request={documentId:'scan',groupId:'document-1',pageId:'p1',sourceImageId:'source-1',expectedRevision:0,userConfirmed:true};
test('missing fields can be confirmed against their own page without fabricating OCR evidence',()=>{
 const original=input(),before=structuredClone(original);
 const next=confirmPageField(original,{...request,field:'bolNumber',rawValue:'B-431'});
 assert.equal(next.documents[0].fields.bolNumber.value,'B-431');assert.equal(next.corrections[0].sourceQuote,null);
 assert.equal(next.corrections[0].sourcePage.sourceImageId,'source-1');assert.equal(next.corrections[0].trainingEligible,false);
 assert.equal(next.documents[0].fields.bolNumber.candidates.length,0);assert.equal(next.documents[0].canAutoFile,false);
 assert.deepEqual(original,before);assert.equal(next.pageCount,2);
 assert.ok(!reviewQueue(next).some(q=>q.groupId==='document-1'&&q.key==='bolNumber'));
 for(const change of [{pageId:'p2',sourceImageId:'source-2'},{sourceImageId:'foreign'}, {documentId:'other'},{userConfirmed:false},{expectedRevision:4},{rawValue:'??'}])assert.throws(()=>confirmPageField(original,{...request,field:'bolNumber',rawValue:'B-431',...change}));
 assert.throws(()=>confirmPageField(next,{...request,field:'bolNumber',rawValue:'B-432'}));
});
test('unknown document type unlocks real profile fields without merging pages or inventing text',()=>{
 const original=input('Unreadable heading\nBOL No: B-41'),before=structuredClone(original.pages);
 const next=confirmDocumentKind(original,{...request,kind:'bol'});
 assert.equal(next.documents[0].kind,'bol');assert.equal(next.documents[0].identityStatus,'confirmed');
 assert.equal(next.documents[0].fields.bolNumber.value,'B-41');assert.deepEqual(next.pages,before);
 assert.equal(next.documents[1].kind,'unknown');assert.equal(next.documents.length,2);
 const filled=confirmPageField(next,{...request,expectedRevision:1,field:'shipper',rawValue:'Example Sender'});
 assert.throws(()=>confirmDocumentKind(filled,{...request,expectedRevision:2,kind:'invoice'}));
});
test('saved review contains confirmed page details, no full text or automatic assignment',()=>{
 const result=confirmPageField(input(),{...request,field:'bolNumber',rawValue:'B-431'}),saved=savedReadingReview(result);
 assert.equal(saved.documents[0].fields.bolNumber.value,'B-431');assert.deepEqual(saved.documents[0].pages,[1]);
 assert.equal(saved.trainingEligible,false);assert.ok(saved.remaining>0);assert.equal(saved.pages,undefined);assert.equal(saved.loadNo,undefined);
});
test('receipt header date survives a missing colon and qualified dates remain excluded',()=>{
 for(const heading of ['RECEIPT # R-42 | DATE 18-Aug-2026','RECEIPT # R-42 DATE 18-Aug-2026']){
  const result=input('RECEIPT\nLOAD DETAILS\nLOAD DESCRIPTION: Breakdown\nCHECKOUT FEE\n'+heading);
  assert.equal(result.documents[0].fields.receiptDate.value,'2026-08-18');
 }
 const result=input('RECEIPT\nLOAD DETAILS\nLOAD DESCRIPTION: Breakdown\nCHECKOUT FEE\nPRINTED DATE 18-Aug-2026\nDELIVERY DATE 19-Aug-2026');
 assert.equal(result.documents[0].fields.receiptDate.candidates.length,0);
});

test('manual type applies only to a single document and uses supported filing types',async()=>{
 const {filingTypeForReview}=await import('../src/recovery.js');
 const group=kind=>({kind,typeCorrection:{confirmed:true}});
 assert.equal(filingTypeForReview({documents:[group('bol')]}),'bol');
 assert.equal(filingTypeForReview({documents:[group('invoice')]}),'other');
 assert.equal(filingTypeForReview({documents:[group('load_invoice')]}),'load_invoice');
 assert.equal(filingTypeForReview({documents:[group('unloading_receipt')]}),'lumper_receipt');
 assert.equal(filingTypeForReview({documents:[group('bol'),group('invoice')]}),null);
 assert.equal(filingTypeForReview({documents:[{kind:'bol'}]}),null);
});

test('manual missing-field correction names the chosen later page in a joined document',()=>{
 const result=readDocument({documentId:'joined',pages:[1,2].map(n=>({id:'p'+n,observations:[{...textObservation('BILL OF LADING\nBOL NO: SHARED-42\nSHIP FROM: Sender\nSHIP TO: Receiver'),sourceImageId:'source-'+n}]}))});
 assert.equal(result.documents.length,1);
 const next=confirmPageField(result,{...request,documentId:'joined',field:'documentDate',rawValue:'2026-08-18',pageId:'p2',sourceImageId:'source-2'});
 assert.equal(next.corrections[0].sourcePage.pageNumber,2);assert.equal(next.corrections[0].sourcePage.sourceImageId,'source-2');
 assert.deepEqual(next.documents[0].pageIds,['p1','p2']);
});
