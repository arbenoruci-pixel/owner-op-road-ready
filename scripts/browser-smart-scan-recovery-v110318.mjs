import assert from 'node:assert/strict';
import {instructionPdfV110312} from './v110312/savedScanFixtureV110312.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import {buildInstructionGuideV110311} from '../source/src/modules/loads/instructionGuideV110311.js';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/smart-scan-flow-${process.env.TEST_ORIGIN?'production':'local'}`;
fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000029',email:'ratecon-boundary@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const profile={setupComplete:true,mode:'own_authority',companyName:'Example Carrier LLC',carrierName:'Example Carrier LLC',truckNumber:'12',trailerNumber:'TEST',fleetSize:1,modules:['documents','loads','logbook','dot','drive','wallet'],createdAt:'2026-01-01T00:00:00Z',updatedAt:Date.now()};
const fake='live_1788780557647';
function baseState(){return {view:'home',activeDay:'2026-09-07',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'TEST',email:user.email},driverProfile:{name:'Synthetic Driver',email:user.email},carrierName:'Example Carrier LLC',mainOfficeAddress:'100 Example Road, Example City, IL 60000',dotNumber:'0000000',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Downers Grove',state:'IL'},eventsByDay:{'2026-09-07':[{id:fake,status:'OFF',startMin:0,endMin:985,city:'Downers Grove',state:'IL',source:'manual',note:'Off Duty'}]},certifyStatus:{'2026-09-07':'Active day / Not certified yet'},signatureByDay:{},inspectionByDay:{},formByDay:{},dotWallet:{documents:{}},loadGuidesById:{},activeLoadGuideId:'',routeLegsByDay:{'2026-09-07':[{id:'leg_'+fake,loadGroupId:fake,pickupEventId:fake,fromCity:'Downers Grove',fromState:'IL',toCity:'',toState:'',shippingDocs:'',loadNo:'',kind:'loaded',status:'open',source:'pickup_event'}]},loadInfo:{loadNo:'',shippingDocs:'',pickupCity:'Downers Grove',pickupState:'IL',guideId:'',sourceEventId:fake,sourceEventDay:'2026-09-07',updatedAt:Date.now()}};}
function instructionState(){
 const state=baseState();state.routeLegsByDay={};
 const stops=[{id:'pu',type:'pickup',company:'Example Factory',city:'Howe',state:'IN',cityState:'Howe, IN',address:'100 Example Road, Howe, IN 46746',date:'2026-09-08',appointment:'FCFS 08:00–16:00'},{id:'delivery',type:'delivery',company:'Example Receiver',city:'Smithfield',state:'RI',cityState:'Smithfield, RI',address:'200 Example Avenue, Smithfield, RI 02917',date:'2026-09-10',appointment:'Appt 06:00–07:00',deliverySequence:1},{id:'return',type:'delivery',role:'trailer_return',company:'Example Factory',city:'Howe',state:'IN',cityState:'Howe, IN',address:'100 Example Road, Howe, IN 46746',date:'2026-09-17',appointment:'FCFS 08:00–16:00',deliverySequence:2}];
 const plan={version:1,loadNo:'76543210',broker:'TQL',stops,fields:{pickupDate:'2026-09-08',deliveryDate:'2026-09-17'},risks:[{id:'macropoint',title:'MacroPoint tracking required',detail:'Driver Must Accept MacroPoint'}],sourceText:'Driver instructions'};
 const record={id:'test-instruction-doc',type:'load_tender',status:'verified',canonicalLoadNo:plan.loadNo,broker:plan.broker,documentDate:'2026-09-08',linkDay:'2026-09-08',linkToLogbook:true,createdAt:Date.now(),extracted:{instructionPlanV110311:plan}};
 record.instructionGuide=buildInstructionGuideV110311(plan,record);state.testInstructionStore={loads:[],documents:[record]};return state;
}
function recoveryState(kind){
 const state=instructionState(),doc=state.testInstructionStore.documents[0];
 if(kind==='lost-selection'){state.loadGuidesById={[doc.instructionGuide.id]:{...doc.instructionGuide,manualDone:{review_load:456}}};state.activeLoadGuideId='';state.loadInfo={};}
 if(kind==='legacy-original'){delete doc.instructionGuide;doc.extracted={};doc.status='needs_review';doc.reviewStatus='needs_review';doc.canonicalLoadNo='';doc.broker='';doc.clientDocumentId='legacy-client';doc.fileName='legacy-instructions.pdf';doc.mimeType='application/pdf';state.testOriginalPdfBytes=Array.from(instructionPdfV110312());}
 return state;
}
async function seed(page,state){
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session,profile})=>{
  const savedDocument=state.testInstructionStore.documents[0],original=state.testOriginalPdfBytes;delete state.testOriginalPdfBytes;
  localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify(state.testInstructionStore));delete state.testInstructionStore;
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-operator-profile-v1',JSON.stringify(profile));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['app_snapshots','documents_local','document_blobs'],'readwrite');if(original){const blob=new Blob([new Uint8Array(original)],{type:'application/pdf'});tx.objectStore('documents_local').put({local_id:savedDocument.id,client_document_id:savedDocument.clientDocumentId,original_file_name:savedDocument.fileName,mime_type:'application/pdf',file_size_bytes:blob.size,type:'other',created_at:new Date().toISOString(),status:'active',sync_state:'local_only'});tx.objectStore('document_blobs').put({local_blob_id:'legacy-blob',client_document_id:savedDocument.clientDocumentId,blob,created_at:new Date().toISOString()});}tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>reject(new Error('Fixture write: '+(event.target?.error?.message||tx.error?.message||event.type)));tx.onabort=()=>reject(new Error('Fixture transaction aborted: '+(tx.error?.message||'unknown')));};});
 },{schemas,state,session,profile});
 await page.goto(origin);
 const adaptiveHome=page.locator('.adaptive-home-v1038');
 if(!(await adaptiveHome.isVisible().catch(()=>false))){
   const homeButton=page.getByRole('button',{name:/Home/i}).first();
   await homeButton.waitFor({timeout:30000});
   await homeButton.click();
 }
 await adaptiveHome.waitFor({timeout:30000});
}
async function setupRoutes(context){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.startsWith('/npm/pdfjs-dist@4.10.38/'))return route.continue();if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic Rate Con boundary: external access blocked'},headers});});
}

function simplePdf(text){
 const content='BT /F1 10 Tf 14 TL 40 790 Td\n'+text.split('\n').map((line,i)=>(i?'T* ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+'\nET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(pdf);
}
const rateText='RATE CONFIRMATION\nLOAD NO 76543210\nBROKER Example Freight\nTOTAL CARRIER PAY $2400\nPickup Date 09/08/2026\nPickup Howe, IN\nDelivery Smithfield, RI';
const bolText='BOL#82004117\nSHIP FROM: Example Door Company\nSHIP TO: Example Millwork\nCARRIER: Example Carrier LLC\nSHIPPING DATE: 09/09/2026, 08:00\nPO NUMBER: 12345678, 87654321';
function scanState(kind){
 const state=baseState();state.routeLegsByDay={};state.loadInfo={};
 const doc={id:'saved-rate-318',clientDocumentId:'legacy-client',type:'rate_confirmation',status:'verified',canonicalLoadNo:'76543210',broker:'Example Freight',documentDate:'2026-09-08',fileName:'saved-rate.pdf',mimeType:'application/pdf',createdAt:Date.now(),extracted:{loadNo:'76543210',orderNo:'76543210',broker:'Example Freight',documentDate:'2026-09-08',pickupDate:'2026-09-08',origin:'Howe, IN',destination:'Smithfield, RI',guideSourceTextV110312:rateText,stops:[{type:'pickup',city:'Howe',state:'IN',date:'2026-09-08',pickupNumber:'82004117'},{type:'delivery',city:'Smithfield',state:'RI',date:''}]}};
 state.testInstructionStore={loads:[],documents:[doc]};
 if(kind==='resume'){doc.status='needs_review';doc.reviewStatus='needs_review';doc.canonicalLoadNo='';state.testOriginalPdfBytes=Array.from(simplePdf(rateText));}
 return state;
}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 for(const kind of ['missing-appointment','resume','bol-upload']){
  const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'road-ready-scan318-'));
  const context=await type.launchPersistentContext(profileDir,{headless:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Chicago',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-09T21:21:00Z'));await setupRoutes(context);
  try{
   await seed(page,scanState(kind));
   if(kind==='resume'){
    await page.getByRole('button',{name:'Continue saved scan',exact:true}).click();
    await page.getByLabel('Document type',{exact:true}).waitFor({timeout:15000});
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
    await page.getByRole('button',{name:'Read again',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-09-08');
    await page.getByLabel('Load folder',{exact:true}).selectOption('76543210');
   } else if(kind==='bol-upload'){
    await page.locator('.adaptive-home-v1038.active-load').waitFor();
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][accept*="application/pdf"]').setInputFiles({name:'shipping.pdf',mimeType:'application/pdf',buffer:simplePdf(bolText)});
    await page.getByLabel('Document type',{exact:true}).waitFor({timeout:60000});
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'76543210');
    assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-09-09');
   }
   if(kind!=='missing-appointment'){
    const review=page.locator('.scan-driver-check-v105 input');if(await review.count())await review.check();
    const risk=page.locator('.ratecon-risk-ack-v10970 input');if(await risk.count())await risk.check();
    await page.locator('.scan-save-v105').click();
    const done=page.getByRole('button',{name:kind==='resume'?'Done · Open guide':'Done · Open load',exact:true});await done.waitFor();
    const docs=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')).documents);
    if(kind==='resume'){assert.equal(docs.length,1);assert.equal(docs[0].id,'saved-rate-318');assert.ok(docs[0].loadGuideV110312);}
    else {const bol=docs.find(d=>d.type==='bol');assert.equal(bol.canonicalLoadNo,'76543210');assert.equal(bol.linkToLogbook,true);assert.ok(bol.references.some(r=>r.value==='87654321'));}
    await done.click();
    if(kind==='resume')await page.getByRole('heading',{name:'Route and appointments',exact:true}).waitFor();
   } else {
    await page.locator('.adaptive-home-v1038.active-load').waitFor();
    assert.equal(await page.getByRole('button',{name:'Continue saved scan',exact:true}).count(),0);
    await page.getByRole('button',{name:'Full mission',exact:true}).click();await page.getByRole('heading',{name:'Route and appointments',exact:true}).waitFor();
   }
   await page.screenshot({path:`${output}/${name}-${kind}.png`});
   await page.reload();await page.locator('.adaptive-home-v1038.active-load').waitFor({timeout:30000});assert.deepEqual(errors,[]);
   reports.push({browser:name,kind,passed:true});console.log(`PASS — ${name}: ${kind}, save, navigation and reload`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${kind}-FAILED.png`}).catch(()=>{});reports.push({browser:name,kind,passed:false,error:String(error),pageErrors:errors});console.error(error);}
  finally{await context.close();fs.rmSync(profileDir,{recursive:true,force:true});}
 }
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
