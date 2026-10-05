import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,origin,simplePdf} from '../v110434/browserFixture.mjs';
const browser=await chromium.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true}),page=await context.newPage();
const userId='00000000-0000-4000-8000-000000000029',records=new Map(),changes=[],calls=[],errors=[];let device,failAck=false;
page.on('pageerror',e=>errors.push(e.message));await setupRoutes(context);
await context.route('https://ghwkcgczuwctzxsxmqzx.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method(),headers=await request.allHeaders();
 const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':headers['access-control-request-headers']||Object.keys(headers).join(','),'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Credentials':'true'};
 const json=(value,status=200)=>route.fulfill({json:value,status,headers:cors}),rows=value=>json(headers.accept?.includes('vnd.pgrst.object')?value[0]??null:value);
 if(method==='OPTIONS')return route.fulfill({body:'',headers:cors});
 if(path==='/rest/v1/road_ready_backup_settings')return rows([{enabled:false,record_sync_enabled:true}]);
 if(path.endsWith('/road_ready_record_sync_v1')){
  const p=request.postDataJSON();calls.push(p);device=p.p_device;
  if(p.p_action==='begin')return json({run:p.p_run});
  if(p.p_action==='batch'){for(const r of p.p_records){const prev=records.get(r.record_key);if(!('data' in r)){if(!prev||prev.payload_hash!==r.payload_hash)return json({message:'Cached record needs a full refresh'},400);prev.last_seen_run=p.p_run;}else records.set(r.record_key,{...r,user_id:userId,device_id:device,revision:(prev?.revision||0)+1,deleted:false,captured_at:new Date().toISOString(),last_seen_run:p.p_run});}return json({saved:p.p_records.length});}
  if(p.p_action==='finish'){assert.equal([...records.values()].filter(r=>r.last_seen_run===p.p_run).length,p.p_count);return json({complete:true,records:p.p_count});}
  return json({error:true});
 }
 if(path==='/rest/v1/road_ready_records'){const kind=url.searchParams.get('kind')?.slice(3);return rows([...records.values()].filter(r=>!kind||r.kind===kind).slice(0,60));}
 if(path==='/rest/v1/road_ready_corrections'){
  const id=url.searchParams.get('id')?.slice(3);
  if(method==='PATCH'){if(failAck){failAck=false;return json({message:'Synthetic acknowledgement unavailable'},500);}Object.assign(changes.find(c=>c.id===id),request.postDataJSON());return json(null);}
  return rows(changes.filter(c=>!id||c.id===id));
 }
 if(path==='/functions/v1/owner-op-cloud-v1'){const {action}=request.postDataJSON();return json({ok:true,result:action==='catalog'?{account:{profile:{},home_timezone:'America/New_York'},wallet:[],days:[],stats:{days:0,file_bytes:0},window_start:'2026-09-30',window_end:'2026-10-07'}:action==='list_shares'?{shares:[]}: {}});}
 return route.fallback();
});
const queue=(key,patch,reason)=>{const r=records.get(key);assert(r,key);const c={id:crypto.randomUUID(),user_id:userId,device_id:device,record_key:key,base_revision:r.revision,before_data:structuredClone(r.data),patch,unset:[],kind:r.kind,locator:r.locator,reason,status:'pending',result:{},created_at:new Date().toISOString()};changes.unshift(c);return c;};
const business=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
try{
 if(process.env.EXPECT_SHA){const meta=await(await page.request.get(origin+'/app-version.json?records='+Date.now())).json();assert.equal(meta.version,JSON.parse(fs.readFileSync('release-version.json','utf8')).version);assert.equal(meta.sourceCommit,process.env.EXPECT_SHA);}
 const day='2026-10-02',state={...baseState(),activeDriverId:'alpha',teamDrivers:[{id:'alpha',name:'Synthetic Driver'},{id:'beta',name:'Saved Beta'}],teamLogbooksByDriverId:{beta:{eventsByDay:{[day]:[{id:'beta-event',status:'ON',startMin:600,endMin:620,loadNo:'82002'}]},signatureByDay:{[day]:{signed:true,signatureDataUrl:'data:image/png;base64,YmV0YS1zaWduYXR1cmU='}}}},dotWallet:{documents:{insurance:{title:'Old insurance',documentNumber:'TEST',dataUrl:'data:application/pdf;base64,YWJj'}}},testInstructionStore:{loads:[{id:'load-82002',loadNo:'82002',broker:'Before',origin:'Test city, IL',destination:'Example city, OH',pickupDate:'2026-09-07',deliveryDate:'2026-09-07',unknown:{keep:true}}],documents:[{id:'original-local',clientDocumentId:'original-client',loadNo:'82002',type:'bol'}]}};
 const original=simplePdf('Synthetic original\nLoad 82002');await seed(page,state,[{id:'original',bytes:[...original]}]);
 await page.evaluate(()=>localStorage.setItem('owner-op-cloud-mirror-v1:paused','true'));
 await page.goto(origin+'/_not-found');
 await page.evaluate(()=>{const key='owner-op-road-ready-business-v1',v=JSON.parse(localStorage.getItem(key));v.loads.push({id:'load_424590-1',loadNo:'424590-1',broker:'Red Lightning',gross:2700},{id:'load_424590-1',loadNo:'424590-1',broker:'Select Transport',gross:1000});localStorage.setItem(key,JSON.stringify(v));});
 await page.goto(origin+'/cloud');const panel=page.getByRole('region',{name:'Synchronized records'}),sync=async()=>{await panel.getByRole('button',{name:'Sync records now'}).click();await page.waitForFunction(()=>[...document.querySelectorAll('section[aria-label="Synchronized records"] button')].some(b=>b.textContent==='Sync records now'&&!b.disabled));};
 await panel.getByText(/saved records synchronized\./i).waitFor({timeout:60000});
 const duplicateRows=[...records.values()].filter(r=>r.load_no==='424590-1'&&r.kind==='business_loads');assert.equal(duplicateRows.length,2);assert(duplicateRows.every(r=>r.locator.duplicate));assert.deepEqual(duplicateRows.map(r=>r.data.gross).sort(),[1000,2700]);
 const before=await snapshot(page);assert(records.has('driver/beta'));assert([...records.values()].some(r=>r.driver_id==='beta'&&r.kind==='duty_events'));assert(records.has('wallet/insurance'));assert(records.has('db/documents_local/original-local'));assert(!JSON.stringify([...records.values()]).includes('YmV0YS1zaWduYXR1cmU='));
 const initialBatches=calls.filter(c=>c.p_action==='batch').length;await sync();await panel.getByText(/saved records synchronized\./i).waitFor();assert(calls.filter(c=>c.p_action==='batch').slice(initialBatches).some(c=>c.p_records.some(r=>!('data' in r))));
 const change=queue('business/loads/load-82002',{broker:'Verified broker'},'Use broker from checked original');await sync();await panel.getByText(change.reason).waitFor();
 const editor=await context.newPage();await editor.goto(origin);await editor.locator('.adaptive-home-v1038').waitFor();await panel.getByRole('button',{name:'Apply correction'}).click();await panel.getByText('Close other Road Ready editing tabs before applying this correction.',{exact:true}).waitFor();assert.equal((await business()).loads[0].broker,'Before');await editor.close();
 failAck=true;await panel.getByRole('button',{name:'Apply correction'}).click();await panel.getByText('Synthetic acknowledgement unavailable',{exact:true}).waitFor();assert.equal((await business()).loads[0].broker,'Verified broker');assert.equal(change.status,'pending');await panel.getByRole('button',{name:'Apply correction'}).click();await panel.getByText('Correction saved on this device.',{exact:true}).first().waitFor();assert.equal(change.status,'applied');assert.deepEqual((await business()).loads[0].unknown,{keep:true});
 const wallet=queue('wallet/insurance',{title:'Current insurance'},'Update verified wallet title');await sync();await panel.getByText(wallet.reason).waitFor();await panel.getByRole('button',{name:'Apply correction'}).click();await page.waitForFunction(()=>true);await panel.getByRole('button',{name:'Apply correction'}).waitFor({state:'detached'});assert.equal((await snapshot(page)).dotWallet.documents.insurance.title,'Current insurance');assert.equal((await snapshot(page)).dotWallet.documents.insurance.dataUrl,state.dotWallet.documents.insurance.dataUrl);
 const doc=queue('db/documents_local/original-local',{title:'Verified BOL'},'Correct original document title');await sync();await panel.getByText(doc.reason).waitFor();await panel.getByRole('button',{name:'Apply correction'}).click();await panel.getByRole('button',{name:'Apply correction'}).waitFor({state:'detached'});assert.equal(doc.status,'applied');
 const stale=queue('business/loads/load-82002',{broker:'Stale correction'},'Synthetic conflict retains phone changes');await page.evaluate(()=>{const key='owner-op-road-ready-business-v1',v=JSON.parse(localStorage.getItem(key));v.loads[0].notes='New local phone edit';localStorage.setItem(key,JSON.stringify(v));});await sync();await panel.getByText(stale.reason).waitFor();await panel.getByRole('button',{name:'Apply correction'}).click();await panel.getByText('Conflict: this record changed on the device. Both versions are retained.',{exact:true}).first().waitFor();assert.equal(stale.status,'conflict');assert.equal((await business()).loads[0].broker,'Verified broker');assert.equal((await business()).loads[0].notes,'New local phone edit');
 const callCount=calls.length;await context.setOffline(true);await sync();await panel.getByText('Offline · local changes will synchronize when connected.',{exact:true}).waitFor();assert.equal(calls.length,callCount);await context.setOffline(false);await sync();await panel.getByText(/saved records synchronized\./i).waitFor();
 await panel.getByText('Browse saved records',{exact:true}).click();await panel.locator('summary').filter({hasText:/^Load 82002/}).click();await panel.getByText('Verified broker',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Pause cloud work on this device'}).click();assert(await panel.getByRole('button',{name:'Sync records now'}).isDisabled());assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-cloud-mirror-v1:paused')),'true');
 const after=await snapshot(page);assert.deepEqual(after.eventsByDay,before.eventsByDay);assert.deepEqual(after.teamLogbooksByDriverId.beta.eventsByDay,before.teamLogbooksByDriverId.beta.eventsByDay);assert.deepEqual(after.teamLogbooksByDriverId.beta.signatureByDay,before.teamLogbooksByDriverId.beta.signatureByDay);
 const originalBytes=await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('document_blobs').objectStore('document_blobs').get('original-blob');r.onsuccess=async()=>{const bytes=[...new Uint8Array(await r.result.blob.arrayBuffer())];db.close();resolve(bytes);};r.onerror=()=>reject(r.error);};}));assert.deepEqual(Buffer.from(originalBytes),original);
 await page.reload();await panel.getByText('Record synchronization paused.',{exact:true}).waitFor();assert.equal((await business()).loads[0].broker,'Verified broker');assert.equal((await snapshot(page)).dotWallet.documents.insurance.title,'Current insurance');assert.deepEqual(errors,[]);
 fs.mkdirSync('browser-test-results',{recursive:true});await panel.screenshot({path:'browser-test-results/cloud-records-v110451.png'});
 console.log('PASS browser: two-driver index, incremental sync, record viewer, editing lock, durable corrections, acknowledgement retry, wallet and document metadata, stale conflicts, offline/pause, reload, originals and duty records preserved');
}catch(error){console.error((await page.locator('body').innerText()).slice(0,7000));console.error(errors);throw error;}finally{await browser.close();}
