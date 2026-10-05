import assert from 'node:assert/strict';
import {preparePacket} from '../../source/src/modules/owneros/evidenceWorkspacePacketV110453.js';
import {readStoredZip,sha256} from '../../source/src/modules/backup/chunkedZipV110431.js';
const blob=new Blob(['original source'],{type:'application/pdf'}),hash=await sha256(await blob.arrayBuffer());
const row={id:'1',kind:'document',name:'=receipt.pdf',category:'repair',date:'2026-10-01',unit:'228',merchant:'<img src=x onerror=alert(1)>',amount:'12.50',source:{sha256:hash}};
const result=await preparePacket([row,{...row,id:'2'}, {...row,id:'3',source:{sha256:'f'.repeat(64)}}],{scenario:'repair'},{readOriginal:async()=>blob});
assert.equal(result.originals,1);assert.equal(result.missing.length,1);assert.match(result.missing[0].reason,/checksum/);
const zip=await readStoredZip(result.file),manifest=JSON.parse(await zip.get('manifest.json').blob.text());assert.equal(manifest.records[0].path,manifest.records[1].path);assert.equal(manifest.records[2].path,'');assert.match(await zip.get('Start-here.html').blob.text(),/&lt;img/);assert.match(await zip.get('index.csv').blob.text(),/"'=receipt.pdf"/);assert.equal(await zip.get(manifest.records[0].path).blob.text(),'original source');
console.log('PASS — packet deduplication, byte preservation, checksum mismatch disclosure, CSV and HTML escaping');
