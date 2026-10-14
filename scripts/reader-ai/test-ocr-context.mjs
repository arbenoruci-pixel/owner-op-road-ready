import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedOcrContext} from '../../lib/reader-ai/ocrContext.js';
test('repeated OCR boilerplate preserves a clearer late signature in bounded provider context',()=>{
 const common=Array.from({length:55},(_,i)=>({text:`Terms line ${i} `+'X'.repeat(55)}));
 const observations=[{lines:[{text:'BILL OF LADING'},...common,{text:'illegible footer'}]},
  {lines:[{text:'BILL OF LADING'},...common,{text:'RECEIVED BY: Jane Example'},{text:'DELIVERY DATE: 2026-10-12'}]}];
 const before=structuredClone(observations),text=boundedOcrContext(observations);
 assert.ok(text.length<=6000);assert.match(text,/BILL OF LADING/);assert.match(text,/RECEIVED BY: Jane Example/);assert.match(text,/DELIVERY DATE: 2026-10-12/);assert.deepEqual(observations,before);
});
test('an oversized single OCR read retains both its title and footer without changing source values',()=>{
 const observation={lines:[{text:'BILL OF LADING'},...Array.from({length:150},(_,i)=>({text:'Shipping instruction '+i+' '+'x'.repeat(60)})),{text:'RECEIVED BY: Jane Example'}]};
 const text=boundedOcrContext([observation]);assert.equal(text.length,6000);assert.match(text,/^BILL OF LADING/);assert.match(text,/\[OCR text omitted\]/);assert.match(text,/RECEIVED BY: Jane Example$/);
});
