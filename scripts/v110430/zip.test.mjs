import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildEverythingZip} from './everythingZip.js';
const bytes=Buffer.from('%PDF-1.4\nOriginal document\n%%EOF'), hash=createHash('sha256').update(bytes).digest('hex');
const binary={__roadReadyBinary:'Blob',mimeType:'application/pdf',size:bytes.length,sha256:hash,base64:bytes.toString('base64')};
const archive={createdAt:'2026-10-03T19:00:00Z',payload:{state:{signatureByDay:{'2026-10-01':{signatureDataUrl:'data:image/png;base64,AQID'}}},businessStore:{loads:[{loadNo:'A1'}]},dexie:{documents_local:[{client_document_id:'one',original_file_name:'../../BOL.pdf',load_no:'A1'},{client_document_id:'duplicate',original_file_name:'again.pdf'},{client_document_id:'missing',original_file_name:'not-here.pdf'}],document_blobs:[{client_document_id:'one',blob:binary},{client_document_id:'duplicate',blob:binary}],capture_asset_blobs:[{client_document_id:'one',fileName:'cropped.jpg',blob:{__roadReadyBinary:'Blob',mimeType:'image/jpeg',size:3,base64:'BwgJ'}}],app_snapshots:[{state:{oldPhoto:'data:image/jpeg;base64,BAUG'}}]},localStorage:[{key:'road-ready-legacy-file',value:JSON.stringify({attachmentDataUrl:'data:application/pdf;base64,'+bytes.toString('base64')})}]},portableReview:{logbook:[{day:'2026-10-01',driverId:'one',driverName:'<script>bad</script>',events:[{status:'SB',startMin:0,endMin:1440}]},{day:'2026-09-30',driverId:'two',driverName:'Second Driver',events:[]}],loads:[{loadNo:'A1'}]}};
const before=JSON.stringify(archive),result=await buildEverythingZip(archive);
assert.equal(JSON.stringify(archive),before);assert.equal(result.originals,1);assert.equal(result.assets,3);assert.equal(result.missingOriginals,1);assert.equal(result.logDays,2);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-zip-test-'));
try{
 const file=path.join(dir,'everything.zip');fs.writeFileSync(file,new Uint8Array(await result.file.arrayBuffer()));
 const checked=spawnSync('python3',['-c',`import sys,zipfile,json,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert all('..' not in p.split('/') and not p.startswith('/') for p in z.namelist())
 backup=json.loads(z.read('Road-Ready-Backup.roadready.json'))
 assert backup['payload']['businessStore']['loads'][0]['loadNo']=='A1'
 manifest=json.loads(z.read('Documents/Manifest.json'))
 for row in manifest: assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
 assert any(z.read(row['path'])==b'%PDF-1.4\\nOriginal document\\n%%EOF' for row in manifest)
 assert len(json.loads(z.read('Documents/Unavailable-originals.json')))==1
 variants=[r for r in manifest if r['source'].startswith('capture_asset_blobs/')]
 assert len(variants)==1 and variants[0]['category']=='saved-asset'
 assert variants[0]['path'].startswith('Saved-assets/') and variants[0]['path'].endswith('.jpg')
 assert sum(r['category']=='original' for r in manifest)==1
 log=z.read('Logbook/Logbook.html').decode()
 assert '<script>bad</script>' not in log and '&lt;script&gt;bad&lt;/script&gt;' in log
 assert 'Second Driver' in log and '24:00' in log
print('PASS: independent ZIP reader, exact originals, deduplication, missing report, legacy photos, all-driver logbook, safe HTML and unchanged source')`,file],{encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);console.log(checked.stdout.trim());
 const corrupt=structuredClone(archive);corrupt.payload.dexie.document_blobs[0].blob.base64='AAAA';await assert.rejects(()=>buildEverythingZip(corrupt),/failed verification/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
