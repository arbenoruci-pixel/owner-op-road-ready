import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='scripts/browser-saved-documents-v110344.mjs';
function patch(before,after) {
 const source=fs.readFileSync(path,'utf8');
 if(source.includes(after))return;
 assert.equal(source.split(before).length-1,1,'Offline original browser anchor: '+before.slice(0,80));
 fs.writeFileSync(path,source.replace(before,after));
}
patch("const before=await localRows(page), storeBefore=", "let before=await localRows(page); const storeBefore=");
patch("assert.match(await recent.innerText(),/Original opened from cloud/);", "assert.match(await recent.innerText(),/Cloud original kept on this device for offline access/);");
patch("    assert.deepEqual(await localRows(page),before,'view/share/download leave every saved record unchanged');", `    const cachedRows=await localRows(page), cached=cachedRows.find(row=>row.client_document_id==='example-39-client');
    const previous=before.find(row=>row.client_document_id==='example-39-client');
    assert.equal(cached.local_blob_state,'available');
    assert.ok(Number.isFinite(Date.parse(cached.offline_original_saved_at)),'offline cache is acknowledged only after the local transaction');
    const restoredMetadata={...cached,local_blob_state:previous.local_blob_state};delete restoredMetadata.offline_original_saved_at;
    assert.deepEqual(restoredMetadata,previous,'offline caching changes only availability metadata');
    assert.deepEqual(cachedRows.filter(row=>row.client_document_id!=='example-39-client'),before.filter(row=>row.client_document_id!=='example-39-client'),'other saved records remain unchanged');
    const cachedBytes=await page.evaluate(async()=>{
      const blobs=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('document_blobs','readonly'),get=tx.objectStore('document_blobs').getAll();
          tx.oncomplete=()=>{db.close();resolve(get.result.filter(row=>row.client_document_id==='example-39-client'));};
          tx.onerror=()=>reject(tx.error);};
      });
      return Promise.all(blobs.map(async row=>Array.from(new Uint8Array(await row.blob.arrayBuffer()))));
    });
    assert.equal(cachedBytes.length,1,'retrieval stores one offline original');
    assert.deepEqual(Buffer.from(cachedBytes[0]),original,'offline bytes exactly match the authenticated cloud original');
    before=cachedRows;
    await recent.locator('.saved-document-row-v344').click();
    await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:false}));
    await recent.locator('.saved-document-row-v344').click();await pdfLink.waitFor();
    assert.match(await recent.innerText(),/Original available on this device/);
    assert.deepEqual(Buffer.from(await pdfLink.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())))),original);
    assert.equal(cloudRequests,2,'reopening the cached original offline never contacts cloud');
    assert.deepEqual(await localRows(page),before,'reopening offline does not create another record');
    await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:true}));`);
console.log('PASS — saved document browser regression verifies cached bytes, offline reopen and unchanged metadata');
