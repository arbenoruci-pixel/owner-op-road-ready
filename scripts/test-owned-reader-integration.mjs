import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readDocument} from '../packages/smart-reader-core/src/index.js';
import {inputFromScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {spawnSync} from 'node:child_process';

const text='BILL OF LADING\nBOL NO: A-123\nShip From: Sender\nShip To: Receiver';
const analysis={text:'[[PAGE:2]]\n'+text,pageCount:3,pages:[{page:2,text}],fields:{loadNo:'untouched'},ocrEvidenceV110323:[
  {id:'2-clean',page:2,text,confidence:.99,lines:[{text:'BOL NO: A-123',left:10,top:20,width:40,height:5,confidence:95}]},
  {id:'2-retry',page:2,text:text.replace('A-123','A-128'),confidence:.99},
]};
const before=JSON.stringify(analysis);
const input=inputFromScanAnalysis(analysis);
const result=readDocument(input);
assert.equal(result.pageCount,3);
assert.deepEqual(result.unreadablePageIds,['page-1','page-3']);
assert.equal(result.documents.find(d=>d.kind==='bol').fields.bolNumber.value,null);
assert.equal(result.pages[1].observations.length,2);
assert.equal(JSON.stringify(analysis),before);
const withGeometry=inputFromScanAnalysis(analysis,{dimensions:{'page-2:2-clean':{width:100,height:200}}});
assert.deepEqual(withGeometry.pages[1].observations[0].lines[0].box,{x:.1,y:.1,width:.4,height:.025});
assert.equal(withGeometry.pages[1].observations[1].sourceImageId,undefined);
assert.ok(fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8').includes('<OwnedReaderPreview analysis={analysis}/>')||fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8').includes('<OwnedReaderPreview analysis={analysis} />'));
assert.ok(fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').includes('sourceImageFile:input'));
const test=spawnSync(process.execPath,['--test','packages/smart-reader-core/test/reader.test.mjs'],{stdio:'inherit'});
assert.equal(test.status,0);
console.log('PASS — independent reader preserves pages, OCR provenance, source geometry and legacy fields');
