import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {origin,baseState,seed,setupRoutes,snapshot,simplePdf} from '../v110434/browserFixture.mjs';
const browser=await chromium.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const objects=new Map(),history=new Map();let workspace=null,commits=0,fullBackups=0,corrupt=false;
const pages=[],contexts=[],errors=[];
async function client(){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',e=>errors.push(e.message));await setupRoutes(context);
 await context.route('https://ghwkcgczuwctzxsxmqzx.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,headers=await req.allHeaders(),cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':headers['access-control-request-headers']||Object.keys(headers).join(','),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true'};
  const json=(value,status=200)=>route.fulfill({json:value,status,headers:cors});if(req.method()==='OPTIONS')return json({});
  const row=value=>json(headers.accept?.includes('vnd.pgrst.object')?value:value?[value]:[]);
  if(path.endsWith('/road_ready_backup_settings'))return row({enabled:true,record_sync_enabled:true});
  if(path.endsWith('/road_ready_account_workspaces'))return row(workspace&&url.searchParams.get('select')!=='*'?{revision:workspace.revision,device_id:workspace.device_id}:workspace);
  if(path.endsWith('/road_ready_account_history')){const filters=url.searchParams.getAll('revision'),eq=filters.find(x=>x.startsWith('eq.'));if(eq)return row({payload:history.get(Number(eq.slice(3)))});const after=Number(filters.find(x=>x.startsWith('gt.'))?.slice(3)||0),before=Number(filters.find(x=>x.startsWith('lte.'))?.slice(4)||Infinity);return json([...history].filter(([r])=>r>after&&r<=before).map(([revision,payload])=>({revision,payload})));}
  if(path.endsWith('/road_ready_account_patch_v1')){const p=req.postDataJSON();if(workspace?.revision!==p.p_expected)return json({conflict:true});const records={...workspace.payload.records,...p.p_patch};for(const k of p.p_deleted)delete records[k];workspace={...workspace,revision:workspace.revision+1,payload:{...workspace.payload,records},device_id:p.p_device};history.set(workspace.revision,{format:'road_ready_account_delta_v1',meta:{format:'road_ready_account_v1'},set:p.p_patch,remove:p.p_deleted});commits++;return json({revision:workspace.revision});}
  if(path.endsWith('/road_ready_account_commit_v1')){const p=req.postDataJSON();if((workspace?.revision||0)!==p.p_expected)return json({conflict:true,revision:workspace?.revision||0});workspace={revision:(workspace?.revision||0)+1,payload:p.p_payload,device_id:p.p_device};history.set(workspace.revision,p.p_payload);commits++;return json({revision:workspace.revision});}
  if(path.endsWith('/road_ready_backup_snapshots'))return row(null);
  if(path.endsWith('/road_ready_commit_backup_v1')||path.endsWith('/road_ready_backup_devices')){fullBackups++;return json({});}
  if(path.endsWith('/road_ready_record_sync_v1'))return json({});
  if(path.endsWith('/road_ready_corrections'))return json([]);
  const prefix='/storage/v1/object/owner-op-private/',download='/storage/v1/object/authenticated/owner-op-private/';
  if(path.startsWith(prefix)&&req.method()==='POST'){const key=path.slice(prefix.length);if(objects.has(key))return json({message:'Duplicate'},409);objects.set(key,req.postDataBuffer());return json({Key:key});}
  if((path.startsWith(download)||path.startsWith(prefix))&&req.method()==='GET'){const key=path.slice(path.startsWith(download)?download.length:prefix.length);return route.fulfill({body:corrupt?Buffer.from('damaged'):objects.get(key)||Buffer.alloc(0),status:objects.has(key)?200:404,headers:cors});}
  return route.fallback();
 });
 return {context,page};
}
const waitFor=async f=>{for(let i=0;i<80;i++){if(await f())return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out waiting for synchronization');};
async function changeBusiness(page,id){await page.evaluate(id=>{const k='owner-op-road-ready-business-v1',b=JSON.parse(localStorage.getItem(k)||'{}');b.expenses=[...(b.expenses||[]),{id,date:'2026-10-05',amount:25,category:'repair',notes:id}];localStorage.setItem(k,JSON.stringify(b));window.dispatchEvent(new Event('owner-op-business-updated'));},id);}
const expense=async(page,id)=>page.evaluate(id=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')||'{}').expenses?.some(x=>x.id===id),id);
try{
 const {page:phone,context:phoneContext}=await client(),day='2026-10-02',state={...baseState(),activeDriverId:'alpha',teamDrivers:[{id:'alpha',name:'Synthetic Driver'},{id:'beta',name:'Saved Beta'}],teamLogbooksByDriverId:{beta:{eventsByDay:{[day]:[{id:'beta-event',status:'ON',startMin:600,endMin:620}]},signatureByDay:{[day]:{signed:true,signatureDataUrl:'data:image/png;base64,YmV0YS1zaWduYXR1cmU='}},formByDay:{[day]:{coDrivers:'Synthetic Driver'}}}},testInstructionStore:{loads:[{id:'load-82002',loadNo:'82002',origin:'Test city, IL',destination:'Example city, OH',pickupDate:'2026-09-07',deliveryDate:'2026-09-07'}],documents:[{id:'original-local',clientDocumentId:'original-client',loadNo:'82002',type:'bol',original_file_name:'original.pdf'}]}};
 const original=simplePdf('Synthetic original\nLoad 82002');await seed(phone,state,[{id:'original',bytes:[...original]}]);await waitFor(()=>workspace?.revision>0);await new Promise(r=>setTimeout(r,3500));
 const {page:tablet,context:tabletContext}=await client();await seed(tablet,{testInstructionStore:{}});assert.ok(await tablet.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')).loads.some(l=>l.loadNo==='82002')));
 const tabletState=await snapshot(tablet);assert.deepEqual(tabletState.teamLogbooksByDriverId.beta.eventsByDay[day],state.teamLogbooksByDriverId.beta.eventsByDay[day]);assert.equal(tabletState.teamLogbooksByDriverId.beta.signatureByDay[day].signatureDataUrl,'data:image/png;base64,YmV0YS1zaWduYXR1cmU=');
 const bytes=await tablet.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('document_blobs').objectStore('document_blobs').get('original-blob');q.onsuccess=async()=>resolve([...new Uint8Array(await q.result.blob.arrayBuffer())]);};}));assert.deepEqual(Buffer.from(bytes),original);
 const beforePause=commits;await tablet.evaluate(()=>{localStorage.setItem('owner-op-record-sync-v1:paused','true');window.dispatchEvent(new Event('online'));});await tablet.getByText('Cloud work is paused on this device.',{exact:true}).waitFor();assert.equal(commits,beforePause);await tablet.evaluate(()=>localStorage.setItem('owner-op-record-sync-v1:paused','false'));
 // Offline edits on separate records merge in both directions.
 await tabletContext.setOffline(true);await changeBusiness(tablet,'tablet-offline');await new Promise(r=>setTimeout(r,3000));assert.ok(await expense(tablet,'tablet-offline'));assert.ok(!await expense(phone,'tablet-offline'));
 await changeBusiness(phone,'phone-online');await waitFor(()=>Object.values(workspace.payload.records).some(v=>v?.id==='phone-online'));
 await tabletContext.setOffline(false);await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>Object.values(workspace.payload.records).some(v=>v?.id==='tablet-offline'));assert.ok(await expense(tablet,'phone-online'));
 await phone.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>expense(phone,'tablet-offline'));
 // No redundant full archives on open, reconnect or refresh.
 await tablet.reload();await tablet.locator('.adaptive-home-v1038').waitFor();assert.ok(await expense(tablet,'phone-online'));assert.ok(await expense(tablet,'tablet-offline'));assert.equal(fullBackups,0);
 // A second tab must wait for the first tab's hydration lock before mounting App.
 const lockPage=await tabletContext.newPage();await lockPage.goto(origin+'/_not-found');await lockPage.evaluate(()=>{navigator.locks.request('road-ready-account-sync-v110455',async()=>{window.__held=true;await new Promise(r=>window.__release=r);});});await lockPage.waitForFunction(()=>window.__held);
 const secondTab=await tabletContext.newPage();await secondTab.goto(origin);await secondTab.getByText('Opening your records',{exact:true}).waitFor();await new Promise(r=>setTimeout(r,1200));assert.equal(await secondTab.locator('.adaptive-home-v1038').count(),0,'App must not mount while initial synchronization is locked');
 await lockPage.evaluate(()=>window.__release());await secondTab.locator('.adaptive-home-v1038').waitFor();assert.ok(await expense(secondTab,'phone-online'));assert.ok(await expense(secondTab,'tablet-offline'));await lockPage.close();
 // An already-mounted tab retains its own merge baseline when another tab advances IndexedDB.
 await phone.evaluate(()=>{const s=structuredClone(window.__rrAccountState());s.testCrossTabNote='new phone record';window.dispatchEvent(new CustomEvent('road-ready-account-apply',{detail:s}));window.dispatchEvent(new Event('online'));});
 await waitFor(()=>workspace.payload.records['["state","testCrossTabNote"]']==='new phone record');await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>tablet.evaluate(()=>window.__rrAccountState()?.testCrossTabNote==='new phone record'));
 await secondTab.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>secondTab.evaluate(()=>window.__rrAccountState()?.testCrossTabNote==='new phone record'));assert.equal(workspace.payload.records['["state","testCrossTabNote"]'],'new phone record');await secondTab.close();
 // Divergent edits of one signed day must retain both versions and require review.
 await phoneContext.setOffline(true);await tabletContext.setOffline(true);
 for(const [page,note] of [[phone,'phone-edit'],[tablet,'tablet-edit']])await page.evaluate(note=>{const s=structuredClone(window.__rrAccountState());s.teamLogbooksByDriverId.beta.eventsByDay['2026-10-02'][0].note=note;window.dispatchEvent(new CustomEvent('road-ready-account-apply',{detail:s}));},note);
 await new Promise(r=>setTimeout(r,300));await phoneContext.setOffline(false);await phone.evaluate(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>Object.values(workspace.payload.records).some(v=>v?.eventsByDay?.[0]?.note==='phone-edit'));
 await tabletContext.setOffline(false);await tablet.evaluate(()=>window.dispatchEvent(new Event('online')));await tablet.getByRole('button',{name:/Review changes/}).waitFor({timeout:25000});assert.equal((await snapshot(tablet)).teamLogbooksByDriverId.beta.eventsByDay[day][0].note,'tablet-edit');
 await tablet.getByRole('button',{name:/Review changes/}).click();await tablet.getByRole('radio',{name:/Saved account copy/}).check();await tablet.getByRole('button',{name:'Save selected versions'}).click();await waitFor(async()=>(await snapshot(tablet)).teamLogbooksByDriverId.beta.eventsByDay[day][0].note==='phone-edit');
 // A new device cannot accept corrupt document bytes.
 corrupt=true;const {page:third}=await client();await seed(third,{testInstructionStore:{}});await third.getByText('A document failed verification. Local data was kept.',{exact:true}).waitFor();assert.equal((await snapshot(third)).teamLogbooksByDriverId?.beta,undefined);corrupt=false;
 assert.equal(fullBackups,0);assert.deepEqual(errors,[]);console.log('PASS two-device account flow: login hydration, exact original PDF, separate drivers/signatures, offline edits both directions, reload, concurrent-tab hydration and stale-tab reconciliation, same-day conflicts, corrupt-file rollback, no automatic full backup; commits='+commits);
}catch(e){for(let i=0;i<pages.length;i++)console.error('PAGE '+i+' '+(await pages[i].locator('body').innerText()).slice(-5000));throw e;}finally{await browser.close();}
