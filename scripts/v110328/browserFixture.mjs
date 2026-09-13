import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000029',email:'ratecon-boundary@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const profile={setupComplete:true,mode:'own_authority',companyName:'Example Carrier LLC',carrierName:'Example Carrier LLC',truckNumber:'12',trailerNumber:'TEST',fleetSize:1,modules:['documents','loads','logbook','dot','drive','wallet'],createdAt:'2026-01-01T00:00:00Z',updatedAt:Date.now()};
const fake='live_1788780557647';
function baseState(){return {view:'home',activeDay:'2026-09-07',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'TEST',email:user.email},driverProfile:{name:'Synthetic Driver',email:user.email},carrierName:'Example Carrier LLC',mainOfficeAddress:'100 Example Road, Example City, IL 60000',dotNumber:'0000000',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Downers Grove',state:'IL'},eventsByDay:{'2026-09-07':[{id:fake,status:'OFF',startMin:0,endMin:985,city:'Downers Grove',state:'IL',source:'manual',note:'Off Duty'}]},certifyStatus:{'2026-09-07':'Active day / Not certified yet'},signatureByDay:{},inspectionByDay:{},formByDay:{},dotWallet:{documents:{}},loadGuidesById:{},activeLoadGuideId:'',routeLegsByDay:{'2026-09-07':[{id:'leg_'+fake,loadGroupId:fake,pickupEventId:fake,fromCity:'Downers Grove',fromState:'IL',toCity:'',toState:'',shippingDocs:'',loadNo:'',kind:'loaded',status:'open',source:'pickup_event'}]},loadInfo:{loadNo:'',shippingDocs:'',pickupCity:'Downers Grove',pickupState:'IL',guideId:'',sourceEventId:fake,sourceEventDay:'2026-09-07',updatedAt:Date.now()}};}
async function seed(page,state,originalFiles=[]){
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session,profile,originalFiles})=>{
  localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify(state.testInstructionStore));delete state.testInstructionStore;
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-operator-profile-v1',JSON.stringify(profile));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['app_snapshots','documents_local','document_blobs'],'readwrite');
   for(const file of originalFiles){const id=file.id;tx.objectStore('documents_local').put({local_id:id+'-local',client_document_id:id+'-client',load_no:'82002',mime_type:'application/pdf',original_file_name:id+'.pdf',type:id==='foreign'?'rate_confirmation':'other',extracted:{type:'rate_confirmation',loadNo:'82002'}});tx.objectStore('document_blobs').put({local_blob_id:id+'-blob',client_document_id:id+'-client',blob:new Blob([new Uint8Array(file.bytes)],{type:'application/pdf'})});}
   tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=event=>reject(new Error('Fixture write: '+(event.target?.error?.message||tx.error?.message||event.type)));tx.onabort=()=>reject(new Error('Fixture transaction aborted: '+(tx.error?.message||'unknown')));};});
 },{schemas,state,session,profile,originalFiles});
 await page.goto(origin);
 await page.locator('.logbook-home-screen-v988').waitFor({timeout:30000});
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
async function snapshot(page){return page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readonly'),q=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{resolve(q.result?.state);db.close();};};}));}
const protectedFields=['eventsByDay','signatureByDay','certifyStatus','inspectionByDay','formByDay'];
const protectedData=state=>Object.fromEntries(protectedFields.map(k=>[k,state[k]]));
function simplePdf(text){
 const content='BT /F1 10 Tf 14 TL 40 790 Td\n'+text.split('\n').map((line,i)=>(i?'T* ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+'\nET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(pdf);
}

export {origin,baseState,seed,setupRoutes,simplePdf};
