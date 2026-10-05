import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,origin,simplePdf} from '../v110434/browserFixture.mjs';
import {readStoredZip} from '../../source/src/modules/backup/chunkedZipV110431.js';
const browser=await chromium.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage();
const objects=new Map(),snapshots=[],heartbeats=[],errors=[];let corrupt=false,popups=0,denySettings=true;
page.on('pageerror',e=>errors.push(e.message));page.on('popup',()=>popups++);
await setupRoutes(context);
await context.route('https://ghwkcgczuwctzxsxmqzx.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method(),headers=await request.allHeaders();
 const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':headers['access-control-request-headers']||Object.keys(headers).join(','),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true'};
 const json=(value,status=200)=>route.fulfill({json:value,status,headers:cors});
 const rows=value=>json(headers.accept?.includes('vnd.pgrst.object')?value[0]:value);
 if(method==='OPTIONS')return route.fulfill({body:'',headers:cors});
 if(path.endsWith('/owner_op_access_v1'))return json({approved:true});
 if(path.endsWith('/owner_op_migration_status_v1'))return json(null);
 if(path==='/rest/v1/road_ready_backup_settings')return denySettings?json({message:'Synthetic settings unavailable'},403):rows([{enabled:true}]);
 if(path==='/rest/v1/road_ready_backup_devices'){heartbeats.push(request.postDataJSON());return json(null,201);}
 if(path==='/rest/v1/road_ready_backup_snapshots'){
  const id=url.searchParams.get('id')?.replace(/^eq\./,''),device=url.searchParams.get('device_id')?.replace(/^eq\./,'');
  return rows(snapshots.filter(s=>(!id||s.id===id)&&(!device||s.device_id===device)).slice(-1));
 }
 if(path.endsWith('/road_ready_commit_backup_v1')){const p=request.postDataJSON(),id=crypto.randomUUID(),row={id,created_at:new Date().toISOString(),device_id:p.p_device,manifest:p.p_manifest,manifest_sha:p.p_manifest_sha,review:p.p_review,missing_originals:p.p_missing};snapshots.push(row);return json({id});}
 const prefix='/storage/v1/object/owner-op-private/',download='/storage/v1/object/authenticated/owner-op-private/';
 if(path.startsWith(prefix)&&method==='POST'){const key=path.slice(prefix.length);if(objects.has(key))return json({statusCode:'409',error:'Duplicate',message:'The resource already exists'},409);objects.set(key,request.postDataBuffer());return json({Key:key});}
 if((path.startsWith(download)||path.startsWith(prefix))&&method==='GET'){const key=path.slice(path.startsWith(download)?download.length:prefix.length),bytes=objects.get(key);return route.fulfill({body:corrupt?Buffer.from('corrupt'):bytes||Buffer.alloc(0),status:bytes?200:404,contentType:'application/octet-stream',headers:cors});}
 if(path==='/functions/v1/owner-op-cloud-v1'){const {action}=request.postDataJSON();return json({ok:true,result:action==='catalog'?{account:{profile:{},home_timezone:'America/New_York'},wallet:[],days:[],stats:{days:0,file_bytes:0},window_start:'2026-09-30',window_end:'2026-10-07'}:action==='list_shares'?{shares:[]}: {}});}
 return route.fallback();
});
try{
 if(process.env.EXPECT_SHA){const meta=await(await page.request.get(origin+'/app-version.json?mirror='+Date.now())).json();assert.equal(meta.version,'110.4.50');assert.equal(meta.sourceCommit,process.env.EXPECT_SHA);}
 const day='2026-10-02',state={...baseState(),activeDriverId:'alpha',teamDrivers:[{id:'alpha',name:'Synthetic Driver'},{id:'beta',name:'Saved Beta'}],teamLogbooksByDriverId:{beta:{eventsByDay:{[day]:[{id:'beta-event',status:'ON',startMin:600,endMin:620}]},signatureByDay:{[day]:{signed:true,signatureDataUrl:'data:image/png;base64,YmV0YS1zaWduYXR1cmU='}},formByDay:{[day]:{coDrivers:'Synthetic Driver'}}}},testInstructionStore:{loads:[{id:'load-82002',loadNo:'82002',origin:'Test city, IL',destination:'Example city, OH',pickupDate:'2026-09-07',deliveryDate:'2026-09-07'}],documents:[{id:'original-local',clientDocumentId:'original-client',loadNo:'82002',type:'bol',original_file_name:'original.pdf'}]}};
 const original=simplePdf('Synthetic original\nLoad 82002');await seed(page,state,[{id:'original',bytes:[...original]}]);
 await page.evaluate(()=>localStorage.setItem('owner-op-cloud-mirror-v1:paused','true'));
 const before=await snapshot(page);
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 const docs=page.getByRole('region',{name:'Documents',exact:true});
 await docs.locator('.rr-docs-card').filter({hasText:'Sep 7'}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load 82002'}).click();
 await docs.getByText('View originals ›',{exact:true}).click();await docs.getByRole('button',{name:/Open .*original.pdf/}).click();
 const viewer=page.getByRole('dialog',{name:'Original document'});await viewer.getByRole('link',{name:'Download',exact:true}).waitFor();assert.equal(await viewer.locator('iframe').count(),1);assert.equal(popups,0);await viewer.getByRole('button',{name:'Close',exact:true}).click();
 await page.goto(origin+'/cloud');const panel=page.getByRole('region',{name:'Complete device backup'});
 await panel.getByRole('checkbox').check();await panel.getByText('Synthetic settings unavailable',{exact:true}).waitFor();assert.equal(heartbeats.length,0,'A failed settings read must not initiate a backup write');denySettings=false;
 await panel.getByRole('button',{name:'Back up everything now'}).click();await panel.getByText('Complete device copy saved and verified.',{exact:true}).waitFor({timeout:60000});
 assert.equal(snapshots.length,1);assert.equal(snapshots[0].missing_originals,0);assert.ok(snapshots[0].review.logbook.some(d=>d.driverId==='beta'&&d.events.some(e=>e.status==='ON')));assert.ok(heartbeats.some(h=>h.status==='verified'));
 await panel.getByRole('button',{name:'Prepare cloud download'}).click();const link=panel.getByRole('link',{name:'Download verified backup'});await link.waitFor({timeout:60000});
 const [downloaded]=await Promise.all([page.waitForEvent('download'),link.click()]);const bytes=fs.readFileSync(await downloaded.path()),entries=await readStoredZip(new Blob([bytes]));
 const archive=JSON.parse(await entries.get('Road-Ready-Backup.roadready.json').blob.text());assert.deepEqual(archive.payload.state.teamLogbooksByDriverId.beta.eventsByDay,before.teamLogbooksByDriverId.beta.eventsByDay);
 const signature=archive.payload.state.teamLogbooksByDriverId.beta.signatureByDay[day].signatureDataUrl;assert.equal(await entries.get(signature.path).blob.text(),'beta-signature');
 const originalEntry=[...entries].find(([name])=>name.startsWith('Documents/Load-')&&name.endsWith('.pdf'));assert.ok(originalEntry);assert.deepEqual(Buffer.from(await originalEntry[1].blob.arrayBuffer()),original);
 assert.ok(!archive.payload.localStorage.some(r=>/auth|token/.test(r.key)));assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay);
 // A listed document without bytes produces a partial receipt on every retry.
 await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('documents_local','readwrite');tx.objectStore('documents_local').put({local_id:'missing',client_document_id:'missing',original_file_name:'missing.pdf'});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
 await panel.getByRole('button',{name:'Back up everything now'}).click();await panel.getByText('Copy saved · 1 originals are unavailable on this device.',{exact:true}).waitFor({timeout:60000});assert.equal(snapshots.at(-1).missing_originals,1);
 // Corrupt downloads are reported, without replacing any local records.
 corrupt=true;await panel.getByRole('button',{name:'Prepare cloud download'}).click();await panel.getByText('A cloud backup file failed verification.',{exact:true}).waitFor();corrupt=false;
 await panel.getByRole('checkbox').uncheck();assert.ok(await panel.getByRole('button',{name:'Back up everything now'}).isDisabled());assert.deepEqual(errors,[]);
 fs.mkdirSync('browser-test-results',{recursive:true});await page.screenshot({path:'browser-test-results/cloud-mirror-v110450.png',fullPage:true});
 console.log('PASS browser: inline PDF original, complete two-driver copy, byte-identical downloadable ZIP, auth excluded, missing originals remain partial, corrupt restore blocked, local logs unchanged, pause works');
}catch(e){console.error((await page.locator('body').innerText()).slice(0,7000));console.error(errors);throw e;}finally{await browser.close();}
