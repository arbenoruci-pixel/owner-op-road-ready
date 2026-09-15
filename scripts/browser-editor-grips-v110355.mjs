import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/editor-grips-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000027',email:'modern-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-14';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
const fixture={view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:'OFF',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:{[day]:[row('off-a','OFF',0,1150,{note:'Off Duty'}),row('target','D',1150,1236,{note:'Driving'}),row('on-short','ON',1236,1247,{note:'Waiting'}),row('off-b','OFF',1247,1440,{note:'Off Duty'})]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let i=0;i<100;i++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('modern editor fixture persistence timeout');}
async function setup(page,context){await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','modern editor test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic modern editor test: external account access blocked'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-15T15:29:00Z'));await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,fixture,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state:fixture,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,fixture,session});await page.goto(origin);await page.locator('[data-log-event-id=target]').waitFor({timeout:30000});}
async function revealEdit(page){const row=page.locator('[data-log-event-id=target]');if(await row.locator('.motive-edit-reveal-v11027').count()===0){await row.click();await row.waitFor({state:'visible'});}await row.locator('.motive-edit-reveal-v11027').waitFor();assert.equal(await page.locator('.editor-modern-v11027').count(),0,'selection alone must not open editor');return row;}
async function openEdit(page){const row=await revealEdit(page);await row.locator('.motive-edit-reveal-v11027').click();await page.locator('.editor-modern-v11027').waitFor();}
async function inspect(page) {
  const values = await page.locator('.rr-graph-panel-v110355').evaluate(root => {
    const box = e => { const r = e.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
    const svg = root.querySelector('svg.log-graph');
    return { viewport:innerWidth, svg:box(svg),
      handles:[...root.querySelectorAll('.rr-time-grip-v110355')].map(box),
      labels:[...root.querySelectorAll('.rr-boundary-label-v110355')].map(box),
      tips:[...root.querySelectorAll('.rr-grip-tab-v110355')].map(box),
      lines:[...root.querySelectorAll('[data-editor-boundary]')].map(e => ({edge:e.dataset.editorBoundary,x:e.getAttribute('x1')})),
      oldRails:root.querySelectorAll('.graph-handle-rail-v111').length,
      overflow:document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.equal(values.oldRails,0); assert.equal(values.handles.length,2); assert.equal(values.labels.length,2);
  assert.equal(values.overflow,false);
  assert.ok(Math.abs(values.svg.height - values.svg.width * .305) < 2, 'no legacy fixed-height letterboxing');
  for (const h of values.handles) { assert.ok(h.width >= 44 && h.height >= 44); assert.ok(h.x >= 0 && h.right <= values.viewport + 1); assert.ok(h.y >= values.svg.bottom - 1, 'grips never cover the trace'); }
  assert.ok(values.handles[0].right + 3.9 <= values.handles[1].x);
  assert.ok(values.labels[0].right + 1.9 <= values.labels[1].x);
  for (const l of values.labels) { assert.ok(l.height <= 20 && l.width <= 66); assert.ok(l.bottom <= values.svg.y, 'small times sit above the graph'); }
  for (const tip of values.tips) assert.ok(tip.width <= 18 && tip.height <= 22, 'visible grip stays compact');
  for (const line of values.lines) {
    const value = Number(await page.getByRole('slider',{name:line.edge+' time handle',exact:true}).getAttribute('aria-valuenow'));
    assert.ok(Math.abs(Number(line.x) - (52 + value / 1440 * 894)) < .001, 'exact minute guide');
  }
  return values;
}
const handle = (page,edge) => page.getByRole('slider',{name:edge+' time handle',exact:true});
const boundary = async(page,edge) => Number(await handle(page,edge).getAttribute('aria-valuenow'));
async function drag(page,edge,delta) {
  const b = await handle(page,edge).boundingBox(), x=b.x+b.width/2,y=b.y+b.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta,y,{steps:8});await page.mouse.up();
}
async function fieldsMatch(page) {
  for (const edge of ['start','end']) {
    const v = await boundary(page,edge), h=Math.floor(v/60)%24,m=v%60;
    assert.equal(await page.getByLabel(edge === 'start' ? 'Start time' : 'End time',{exact:true}).inputValue(),String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'));
  }
}
const reports=[];
for (const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await type.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try {
    await setup(page,context);
    const before=await stored(page);await openEdit(page);
    assert.equal(await boundary(page,'start'),1150);assert.equal(await boundary(page,'end'),1236);
    assert.equal(await page.locator('.save-main').isDisabled(),true);
    for (const width of [320,390,430]) {
      await page.setViewportSize({width,height:844});await page.waitForTimeout(90);await inspect(page);
    }
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(90);
    await page.screenshot({path:`${output}/${name}-edit-before.png`});
    await drag(page,'start',-30);assert.ok(await boundary(page,'start')<1150);
    await drag(page,'end',20);assert.ok(await boundary(page,'end')>1236);await fieldsMatch(page);
    assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay,'dragging is draft-only');
    await page.screenshot({path:`${output}/${name}-edit-dragged.png`});
    await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay);
    await openEdit(page);await handle(page,'start').press('ArrowLeft');await handle(page,'end').press('ArrowRight');
    await fieldsMatch(page);await page.locator('.save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.id==='target'&&e.startMin===1149&&e.endMin===1237));
    assert.deepEqual(saved.routeLegsByDay,before.routeLegsByDay);
    await page.reload();await page.locator('[data-log-event-id=target]').waitFor();await openEdit(page);
    assert.equal(await boundary(page,'start'),1149);assert.equal(await boundary(page,'end'),1237);
    // Short windows and both midnight edges retain two reachable controls.
    for (const [start,end] of [['20:36','20:47'],['00:00','00:01'],['23:58','23:59']]) {
      await page.getByLabel('Start time',{exact:true}).fill(start);await page.getByLabel('End time',{exact:true}).fill(end);
      await inspect(page);await fieldsMatch(page);
    }
    await page.getByRole('button',{name:'Full screen',exact:true}).click();
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);await inspect(page);
    await page.getByRole('button',{name:'Done graph',exact:true}).click();
    await page.setViewportSize({width:390,height:844});await page.locator('.cancel-main').click();
    const persisted=await stored(page);
    await page.getByRole('button',{name:'Insert',exact:true}).click();
    await page.getByLabel('Start time',{exact:true}).fill('10:00');await page.getByLabel('End time',{exact:true}).fill('10:01');
    await inspect(page);await drag(page,'end',12);assert.ok(await boundary(page,'end')>601);
    await drag(page,'start',60);assert.ok(await boundary(page,'start')>600);await fieldsMatch(page);
    // iOS canceled touch restores the whole Insert interval, including a moved companion edge.
    const range=[await boundary(page,'start'),await boundary(page,'end')];
    await handle(page,'start').evaluate(el=>{
      const b=el.getBoundingClientRect(),opts={bubbles:true,cancelable:true,pointerId:77,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:b.x+22,clientY:b.y+22};
      el.dispatchEvent(new PointerEvent('pointerdown',opts));
      window.dispatchEvent(new PointerEvent('pointermove',{...opts,clientX:opts.clientX+30}));
    });
    await page.waitForTimeout(30);
    await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:77,pointerType:'touch',bubbles:true})));
    assert.deepEqual([await boundary(page,'start'),await boundary(page,'end')],range);await fieldsMatch(page);
    await page.screenshot({path:`${output}/${name}-insert.png`});
    await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,persisted.eventsByDay);
    await page.getByRole('button',{name:'Insert',exact:true}).click();
    await page.getByLabel('Start time',{exact:true}).fill('15:10');await page.getByLabel('End time',{exact:true}).fill('15:25');
    await page.locator('.editor-duty-grid button').filter({hasText:/^ON$/}).click();
    await page.locator('.quick-activities-v11023').getByRole('button',{name:'Fuel',exact:true}).click();
    await page.locator('.save-main').click();
    await waitState(page,s=>s.eventsByDay[day].some(e=>e.status==='ON'&&e.startMin===910&&e.endMin===925));
    await page.reload();await page.locator('.logbook-ui-v110').waitFor();
    assert.ok((await stored(page)).eventsByDay[day].some(e=>e.status==='ON'&&e.startMin===910&&e.endMin===925));
    assert.equal(await page.locator('.rr-time-grip-v110355').count(),0,'closed editor leaves no orphan handles');
    assert.deepEqual(errors,[]);reports.push({browser:name,passed:true});console.log('PASS — '+name+': compact flags, pointer/keyboard drag, synchronized fields, short/midnight/resize/landscape, Insert cancellation, draft-only changes, Save and durable reopen');
  } catch(error) {
    await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});
    reports.push({browser:name,passed:false,error:String(error),stack:error.stack,errors});console.error(error);
  } finally { await browser.close(); }
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));
