import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');await swc.loadBindings();
const {chromium}=await import(pathToFileURL(process.env.RR_PLAYWRIGHT_MODULE));
const modules=new Map();
for(const [url,file,name] of [
 ['/device','source/src/modules/auth/DeviceSessionGateV110463.jsx','DeviceSessionGate'],
 ['/account','source/src/modules/cloud/AccountSyncGateV110455.jsx','AccountSyncGate']]){
 const source=fs.readFileSync(file,'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default function','function');
 const js=(await swc.transform(source,{filename:name+'.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}}})).code;
 modules.set(url,`(()=>{const {useEffect,useState,useRef}=React;const {CURRENT_APP_VERSION,cloudClient,cloudSession,getOwnerOpDb,flushAppSnapshots,DEVICE_EVENT,verifyDeviceSession,invalidateDeviceSession,sessionId,syncAccount,accountStatus,ACCOUNT_EVENT,requestRecordPriority,createSyncScheduler,recordsFrom,equivalentRecords,LOCAL_KEYS,BUSINESS_STORE_KEY,deviceSessionStatus}=fixture;${js};window.${name}=${name};})();`);
}
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
 if(req.url==='/')return res.end('<!doctype html><div id="root"></div><script src="/react"></script><script src="/react-dom"></script>');
 if(req.url==='/react')return res.end(fs.readFileSync('node_modules/react/umd/react.development.js'));
 if(req.url==='/react-dom')return res.end(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js'));
 if(modules.has(req.url))return res.end(modules.get(req.url));res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{
  const f=window.fixture={CURRENT_APP_VERSION:'110.4.93',mounts:0,unmounts:0,signouts:[],saved:[],device:{active:true,uid:'owner',sid:'session',generation:1,receive:false},mode:'ready'};
  Object.assign(f,{cloudClient:()=>({auth:{signOut:async x=>{f.signouts.push(x);return{};}}}),cloudSession:async()=>({user:{id:'owner'}}),getOwnerOpDb:()=>({app_snapshots:{put:async row=>f.saved.push(row)}}),flushAppSnapshots:async()=>{},DEVICE_EVENT:'device',
   verifyDeviceSession:async()=>{if(f.mode==='held')return new Promise(resolve=>{f.release=()=>resolve(f.device);});if(f.mode==='failed')throw Error('Temporary connection failure');return f.device;},invalidateDeviceSession:()=>{},sessionId:()=> 'session',
   syncAccount:()=>{},accountStatus:()=>({phase:'syncing',message:'Opening your account data…'}),ACCOUNT_EVENT:'account-sync',requestRecordPriority:()=>{},
   createSyncScheduler:options=>{f.queue=options;return{start(){},stop(){},saved(){},wake(){},retry(){}};},recordsFrom:()=>({}),equivalentRecords:()=>true,LOCAL_KEYS:[],BUSINESS_STORE_KEY:'business',deviceSessionStatus:()=>f.device});
  window.__rrAccountState=()=>({eventsByDay:{'2026-10-29':[{id:'saved-duty'}]},sheet:'scan'});
  f.status=detail=>window.dispatchEvent(new CustomEvent('account-sync',{detail}));
 });
 await page.addScriptTag({url:'/device'});await page.addScriptTag({url:'/account'});
 await page.evaluate(()=>{
  const f=fixture;
  function Scanner(){const [pages,setPages]=React.useState(1);React.useEffect(()=>{f.mounts++;f.nextPage=()=>setPages(p=>p+1);return()=>{f.unmounts++;};},[]);return React.createElement('section',{id:'scanner'},React.createElement('h1',null,'Smart Scan'),React.createElement('p',{id:'pages'},'Read '+pages+' pages'),React.createElement('input',{id:'draft',defaultValue:'BOL 17381410'}),React.createElement('button',{id:'save',onClick:()=>{f.clicked=(f.clicked||0)+1;}},'Save document'));}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DeviceSessionGate,null,React.createElement(AccountSyncGate,null,React.createElement(Scanner))));
 });
 await page.getByText('Opening your logbook').waitFor();
 await page.evaluate(()=>fixture.status({phase:'local_ready',localReady:{uid:'other',sid:'session',generation:1}}));assert.equal(await page.locator('#scanner').count(),0);
 await page.evaluate(()=>fixture.status({phase:'local_ready',localReady:{uid:'owner',sid:'session',generation:1}}));await page.locator('#draft').fill('NFI original scan draft');
 await page.evaluate(()=>{fixture.status({phase:'syncing',message:'Syncing document files…'});fixture.nextPage();});
 await page.getByText('Read 2 pages').waitFor();assert.equal(await page.getByText('Opening your logbook').count(),0);
 await page.evaluate(()=>{fixture.mode='held';window.dispatchEvent(new Event('pageshow'));});
 await page.getByText('Reconnecting…',{exact:true}).waitFor({timeout:5000});
 assert.equal(await page.locator('#scanner').isVisible(),true);
 assert.equal(await page.locator('#draft').inputValue(),'NFI original scan draft');
 assert.equal(await page.locator('#scanner').evaluate(el=>!!el.closest('[inert]')),true,'Awaiting authorization still blocks editing');
 await page.locator('#save').dispatchEvent('click');assert.equal(await page.evaluate(()=>fixture.clicked||0),0);
 const banner=await page.getByRole('alert').boundingBox();assert.ok(banner.height<400,'Recheck notice must not replace the screen');
 await page.evaluate(()=>{fixture.nextPage();fixture.mode='ready';fixture.release();});
 await page.locator('#save').click();assert.equal(await page.evaluate(()=>fixture.clicked),1);assert.equal(await page.locator('#pages').textContent(),'Read 3 pages');
 assert.deepEqual(await page.evaluate(()=>[fixture.mounts,fixture.unmounts]),[1,0]);
 await page.evaluate(()=>{fixture.mode='failed';window.dispatchEvent(new Event('pageshow'));});
 await page.getByText('Temporary connection failure').waitFor();assert.equal(await page.locator('#scanner').isVisible(),true);
 await page.evaluate(()=>{fixture.mode='ready';});await page.getByRole('button',{name:'Retry connection'}).click();await page.locator('#save').click();
 await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('#scanner')?.closest('[inert]'));
 await context.setOffline(false);await page.locator('#save').click();assert.deepEqual(await page.evaluate(()=>[fixture.mounts,fixture.unmounts]),[1,0]);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('device',{detail:{active:false,sid:'session'}})));
 await page.waitForFunction(()=>fixture.signouts.length===1);assert.equal(await page.evaluate(()=>fixture.saved.length),1);
 assert.ok((await page.getByRole('alert').boundingBox()).height>=800,'Revoked authorization retains the full gate');
 assert.deepEqual(errors,[]);console.log('PASS — mobile React DOM: local opening, background archive, retained three-page scan/draft, locked controls, retry/offline recovery, one mount and revoked-session preservation');
}catch(error){console.error(await page.evaluate(()=>({text:document.body.innerText,mode:fixture.mode,mounts:fixture.mounts,hasRelease:!!fixture.release,inert:!!document.querySelector('#scanner')?.closest('[inert]')})),errors);throw error;}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
