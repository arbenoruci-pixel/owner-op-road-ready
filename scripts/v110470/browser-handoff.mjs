import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {origin,seed,setupRoutes,snapshot} from '../v110434/browserFixture.mjs';
import {fixture,day} from '../insert-continuity/fixture.mjs';
import {recordsFrom,FORMAT} from '../../lib/owner-op-cloud/accountCoreV110455.js';

const output='browser-test-results/single-device-ipad';fs.mkdirSync(output,{recursive:true});
const authKey='owner-op-prototype-auth-v1',dbName='owner-op-road-ready-offline-v1';
const cloud='https://ghwkcgczuwctzxsxmqzx.supabase.co';
const user={id:'00000000-0000-4000-8000-000000000029',email:'ratecon-boundary@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const sid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const token=id=>{const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return b({alg:'HS256',typ:'JWT'})+'.'+b({sub:user.id,session_id:id,exp:Math.floor(Date.now()/1000)+86400,aud:'authenticated'})+'.synthetic';};
const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
async function waitFor(fn){for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out waiting for account handoff');}
async function openDay(page){const insert=page.getByRole('button',{name:'Insert',exact:true}),open=page.getByRole('button',{name:'Open logbook',exact:true});await insert.or(open).first().waitFor();if(!await insert.isVisible())await open.click({timeout:3000}).catch(async e=>{if(!await insert.isVisible())throw e;});await insert.waitFor();}
async function rows(page,table){return page.evaluate(async({dbName,table})=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbName);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction(table).objectStore(table).getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}),{dbName,table});}

for(const [engineName,engine] of (process.env.SYNC_TEST_BROWSER==='chromium'?[['chromium',chromium]]:process.env.SYNC_TEST_BROWSER==='webkit'?[['webkit',webkit]]:[['chromium',chromium],['webkit',webkit]])){
 const browser=await engine.launch({headless:true}),contexts=[],pages=[],errors=[],signouts=[];
 let owner=null,generation=0,receive=false,loginNumber=20,commits=0;
 const used=new Set(),history=new Map();
 const local={...fixture(),activeDriverId:'primary',teamDrivers:[{id:'primary',name:'Synthetic Driver'},{id:'retained',name:'Saved Co-driver'}],activeTeamDriverIds:['primary'],coDrivers:'',teamLogbooksByDriverId:{retained:{eventsByDay:{[day]:[{id:'retained-sb',status:'SB',startMin:0,endMin:1440}]},signatureByDay:{[day]:{signatureDataUrl:'saved-signature'}}}},testInstructionStore:{loads:[],documents:[]}};
 local.eventsByDay[day][0].note='Latest active device sleeper';
 local.loadInfo={loadNo:'LATEST-ACTIVE'};
 const remote=structuredClone(local);remote.eventsByDay[day][0].note='Older account sleeper';remote.loadInfo={loadNo:'OLDER-ACCOUNT'};
 delete remote.testInstructionStore;
 let workspace={revision:1,device_id:sid(101),payload:{format:FORMAT,records:recordsFrom({state:remote})}};
 history.set(1,workspace.payload);
 async function client(id,viewport,takeover=false){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'America/New_York'}),page=await context.newPage();contexts.push(context);pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await setupRoutes(context,{cloudSettings:true});await page.clock.setFixedTime(new Date('2026-10-12T05:20:00Z'));
  await context.addInitScript(({authKey,id,device,takeover})=>{localStorage.setItem('owner-op-cloud-mirror-v1:device',device);const raw=localStorage.getItem(authKey);if(!raw)return;const session=JSON.parse(raw),parts=session.access_token.split('.'),c=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));if(c.session_id==='00000000-0000-4000-8000-000000000001'){c.session_id=id;parts[1]=btoa(JSON.stringify(c)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');session.access_token=parts.join('.');localStorage.setItem(authKey,JSON.stringify(session));if(takeover)localStorage.setItem('road-ready-device-login-v1',id);}}, {authKey,id:sid(id),device:sid(id+100),takeover});
  await context.route(cloud+'/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,headers=await req.allHeaders();
   const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':headers['access-control-request-headers']||Object.keys(headers).join(','),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Credentials':'true'};
   const json=(data,status=200)=>route.fulfill({json:data,status,headers:cors}),row=data=>json(headers.accept?.includes('vnd.pgrst.object')?data:data?[data]:[]);
   if(req.method()==='OPTIONS')return json({});
   if(path==='/auth/v1/token'){const id=sid(++loginNumber);return json({access_token:token(id),refresh_token:'synthetic-'+loginNumber,token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user});}
   let session;try{session=claims((headers.authorization||'').replace(/^Bearer /,''));}catch{return route.fallback();}
   const current=()=>owner?.sid===session.session_id;
   if(path==='/auth/v1/logout'){signouts.push({sid:session.session_id,scope:url.searchParams.get('scope')});return json({});}
   if(path.endsWith('/road_ready_active_device_v1')){
    const p=req.postDataJSON();
    if(!owner||(!current()&&p.p_takeover&&!used.has(session.session_id))){receive=!!owner&&owner.device!==p.p_device;owner={sid:session.session_id,device:p.p_device};used.add(owner.sid);generation++;}
    return json({active:current()&&owner.device===p.p_device,generation,receive:current()&&receive});
   }
   if(path.endsWith('/road_ready_ack_device_v1')){const p=req.postDataJSON(),active=current()&&owner.device===p.p_device&&generation===p.p_generation;if(active)receive=false;return json({active});}
   if(path.endsWith('/road_ready_backup_settings'))return row({record_sync_enabled:true,enabled:false});
   if(path.endsWith('/road_ready_account_workspaces'))return row(workspace);
   if(path.endsWith('/road_ready_account_history')){const filters=url.searchParams.getAll('revision'),equal=filters.find(v=>v.startsWith('eq.'));if(equal)return row({payload:history.get(Number(equal.slice(3)))});const after=Number(filters.find(v=>v.startsWith('gt.'))?.slice(3)||0),before=Number(filters.find(v=>v.startsWith('lte.'))?.slice(4)||Infinity);return json([...history].filter(([r])=>r>after&&r<=before).map(([revision,payload])=>({revision,payload})));}
   if(path.endsWith('/road_ready_account_patch_v1')||path.endsWith('/road_ready_account_commit_v1')){
    const p=req.postDataJSON();if(!current()||receive||owner.device!==p.p_device)return json({message:'Inactive device cannot write',code:'42501'},403);
    if(p.p_expected!==workspace.revision)return json({conflict:true});
    const payload=p.p_payload||{...workspace.payload,records:{...workspace.payload.records,...p.p_patch}};for(const k of p.p_deleted||[])delete payload.records[k];
    workspace={revision:workspace.revision+1,device_id:p.p_device,payload};history.set(workspace.revision,structuredClone(payload));commits++;return json({revision:workspace.revision});
   }
   if(path.endsWith('/road_ready_backup_snapshots'))return row(null);
   return route.fallback();
  });return {context,page};
 }
 try{
  const phone=await client(2,{width:390,height:844});await seed(phone.page,structuredClone(local),[],false);
  if(process.env.EXPECT_LEGACY_REVIEW==='1'){await phone.page.getByRole('button',{name:/Review changes/}).waitFor();console.log('REPRODUCED: verified active device still blocks on legacy Review changes');continue;}
  await openDay(phone.page);
  await waitFor(()=>workspace.payload.records['["day","primary","'+day+'"]']?.eventsByDay[0].note==='Latest active device sleeper');
  assert.equal(workspace.payload.records['["state","loadInfo"]'].loadNo,'LATEST-ACTIVE');
  assert.equal(await phone.page.getByRole('button',{name:/Review changes/}).count(),0);
  const recovery=(await rows(phone.page,'sync_meta')).filter(row=>row.key.startsWith('single-device-conflicts:'));
  assert.ok(recovery.some(row=>row.value.conflicts.some(c=>c.local?.eventsByDay?.[0]?.note==='Latest active device sleeper'&&c.remote?.eventsByDay?.[0]?.note==='Older account sleeper')),'Both conflicting driver-day versions are retained before the automatic save');
  const phoneState=await snapshot(phone.page);assert.equal(phoneState.coDrivers,'');
  const ipad=await client(3,{width:820,height:1180},true),stale=structuredClone(local);stale.eventsByDay[day][0].note='Stale iPad';stale.activeDriverId='retained';
  await seed(ipad.page,stale,[],false);await openDay(ipad.page);
  await phone.page.getByRole('button',{name:'Sign in securely',exact:true}).waitFor({timeout:15000});
  assert.ok(signouts.some(row=>row.sid===sid(2)&&row.scope==='local'));
  const tabletState=await snapshot(ipad.page);assert.equal(tabletState.activeDriverId,'primary');assert.equal(tabletState.coDrivers,'');assert.deepEqual(tabletState.eventsByDay[day],phoneState.eventsByDay[day]);
  assert.deepEqual(tabletState.teamLogbooksByDriverId.retained,phoneState.teamLogbooksByDriverId.retained);
  assert.equal(await ipad.page.getByRole('button',{name:/Review changes/}).count(),0);
  const recoveryRows=await rows(phone.page,'app_snapshots');assert.ok(recoveryRows.some(row=>row.key.startsWith('single-device-signout:')&&row.state.eventsByDay[day].length));
  for(const viewport of [{width:820,height:1180},{width:1180,height:820}]){
   await ipad.page.setViewportSize(viewport);
   const bounds=await ipad.page.locator('.logbook-ui-v110').boundingBox(),graph=await ipad.page.locator('.logbook-ui-v110 .log-graph-v110').boundingBox();
   assert.ok(bounds.width>=viewport.width-60&&bounds.width<=viewport.width,'iPad logbook uses the available width');assert.ok(graph.width>=viewport.width*.85,'iPad duty graph is large');
   assert.ok(await ipad.page.locator('.logbook-ui-v110 .event-title-line b').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=20));
   assert.ok(await ipad.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await ipad.page.screenshot({path:`${output}/${engineName}-ipad-${viewport.width}.png`});
  }
  await ipad.page.setViewportSize({width:820,height:1180});
  await ipad.page.getByRole('button',{name:'Insert',exact:true}).click();
  await ipad.page.getByLabel('Start time',{exact:true}).fill('20:00');await ipad.page.getByLabel('End time',{exact:true}).fill('20:15');
  await ipad.page.getByRole('button',{name:'Waiting',exact:true}).click();
  await ipad.page.screenshot({path:`${output}/${engineName}-ipad-insert.png`});
  await ipad.page.locator('.save-main').click();
  await waitFor(()=>workspace.payload.records['["day","primary","'+day+'"]']?.eventsByDay.some(e=>e.status==='ON'&&e.startMin===1200&&e.endMin===1215));
  const latest=await snapshot(ipad.page);
  // Return through the real sign-in UI: it must claim the new session and retire iPad.
  await phone.page.getByLabel('Email address',{exact:true}).fill(user.email);await phone.page.getByLabel('Password',{exact:true}).fill('SyntheticPass123!');await phone.page.getByRole('button',{name:'Sign in securely',exact:true}).click();
  await openDay(phone.page);await ipad.page.getByRole('button',{name:'Sign in securely',exact:true}).waitFor({timeout:15000});
  assert.deepEqual((await snapshot(phone.page)).eventsByDay[day],latest.eventsByDay[day]);
  assert.ok(signouts.some(row=>row.sid===sid(3)&&row.scope==='local'));assert.equal(generation,3);
  await phone.page.reload();await openDay(phone.page);assert.equal(await phone.page.getByRole('button',{name:/Review changes/}).count(),0);
  assert.deepEqual((await snapshot(phone.page)).eventsByDay[day],latest.eventsByDay[day]);
  const width=(await phone.page.locator('.logbook-ui-v110').boundingBox()).width;assert.ok(width<=390);
  await phone.page.screenshot({path:`${output}/${engineName}-phone.png`});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engineName}: legacy conflict recovery, Solo transfer, phone → iPad → real phone sign-in, old-device logout, exact inserted log, reload, iPad portrait/landscape and phone width; commits=${commits}`);
 }catch(error){for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:`${output}/${engineName}-failure-${i}.png`}).catch(()=>{});console.error('PAGE '+i+' '+(await pages[i].locator('body').innerText()).slice(-2500));}throw error;}
 finally{await browser.close();}
}
