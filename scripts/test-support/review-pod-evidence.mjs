// Synthetic browser helper: perform the same explicit evidence review as a driver.
// Reading confirmation alone deliberately does not certify delivery evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openLegacyLoadArchive} from './legacy-load-archive.mjs';
import {snapshot,protectedData} from '../v110434/browserFixture.mjs';
async function record(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents_local'),q=tx.objectStore('documents_local').getAll();tx.oncomplete=()=>{resolve(q.result.find(row=>row.extracted?.readerReviewV110345));db.close();};};}));}
export async function reviewFixturePodEvidence(page,{loadNo,date,reference,output}){
 const before=await record(page),logs=protectedData(await snapshot(page));
 assert.ok(before?.client_document_id);assert.equal(before.type,'pod');
 assert.equal(before.extracted.linkToLogbook,false);
 assert.ok(!before.extracted.evidenceFactsV1?.reviewedAt,'reader-only save is not an evidence-facts review');
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
 await openLegacyLoadArchive(page);
 const docs=page.locator('.rr-docs-browser');
 await docs.getByRole('button',{name:'More document options',exact:true}).click();
 const tools=docs.getByRole('region',{name:'More document options',exact:true});
 await tools.getByText('What’s missing',{exact:true}).click();
 await tools.getByRole('button',{name:'Choose saved document',exact:true}).click();
 await tools.getByLabel('Choose saved source',{exact:true}).selectOption(before.client_document_id);
 const review=tools.getByRole('region',{name:'Review document evidence',exact:true});await review.waitFor();
 const download=review.getByRole('link',{name:'Download',exact:true});await download.waitFor();
 const bytes=await download.evaluate(async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer())));
 assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),before.sha256,'evidence review opens exact saved original');
 const [original]=await Promise.all([page.waitForEvent('popup'),review.getByRole('link',{name:'Open file',exact:true}).click()]);
 await original.locator('img').waitFor();assert.ok(await original.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth>0&&img.naturalHeight>0;}));
 // The synthetic source visibly includes Received by: Sam Sample.
 await original.screenshot({path:output+'-received-source.png'});await original.close();
 assert.equal(await review.getByLabel('Evidence document type',{exact:true}).inputValue(),'pod');
 assert.equal(await review.getByLabel('Document / transaction date',{exact:true}).inputValue(),date);
 assert.equal(await review.getByLabel('Broker load number',{exact:true}).inputValue(),loadNo);
 assert.equal(await review.getByLabel('BOL / delivery reference',{exact:true}).inputValue(),reference);
 // Require a fresh explicit checkbox event even if OCR proposed a checked value.
 await review.getByLabel('Receiver signature / stamp checked',{exact:true}).uncheck();
 await review.getByLabel('Receiver signature / stamp checked',{exact:true}).check();
 await review.getByRole('button',{name:'Save reviewed details',exact:true}).click();
 await tools.getByRole('status').filter({hasText:'Reviewed source details saved.'}).waitFor();
 const after=await record(page);
 assert.equal(after.sha256,before.sha256);assert.equal(after.local_blob_id,before.local_blob_id);
 assert.equal(after.extracted.linkToLogbook,false);
 assert.ok(after.extracted.evidenceFactsV1.reviewedAt);
 assert.equal(after.extracted.evidenceFactsV1.sourceSha256,before.sha256);
 assert.equal(after.extracted.evidenceFactsV1.fields.podSigned,true);
 assert.deepEqual(after.extracted.readerReviewV110345,before.extracted.readerReviewV110345,'evidence confirmation preserves source reading');
 assert.deepEqual(protectedData(await snapshot(page)),logs,'evidence confirmation never writes duty data');
 await page.getByRole('button',{name:'‹ Home',exact:true}).click();await page.reload();
 await page.locator('.adaptive-home-v1038').waitFor();
}
