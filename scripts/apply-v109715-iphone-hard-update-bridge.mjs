import fs from 'node:fs';
const path='source/src/core/update/appUpdate.js';
let src=fs.readFileSync(path,'utf8');
if(!src.includes('export async function unregisterAllServiceWorkers')){
  const marker='export async function clearBrowserCaches()';
  const start=src.indexOf(marker);
  const next=start>=0?src.indexOf('\n}\n',start):-1;
  if(start<0||next<0)throw new Error('clearBrowserCaches anchor missing');
  const insertAt=next+3;
  src=src.slice(0,insertAt)+`\nexport async function unregisterAllServiceWorkers() {\n  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) return [];\n  const registrations = await navigator.serviceWorker.getRegistrations();\n  await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));\n  return registrations;\n}\n`+src.slice(insertAt);
}
const reloadStart=src.indexOf('export function updateReloadUrl');
const reloadEnd=reloadStart>=0?src.indexOf('\n}\n',reloadStart):-1;
if(reloadStart<0||reloadEnd<0)throw new Error('updateReloadUrl anchor missing');
const reloadFn=`export function updateReloadUrl(remote = {}) {\n  if (typeof window === 'undefined') return '';\n  const version = remote.version || CURRENT_APP_VERSION;\n  const target = new URL('/update.html', window.location.origin);\n  target.searchParams.set('next', '/');\n  target.searchParams.set('road_ready_update', version);\n  target.searchParams.set('t', String(Date.now()));\n  return target.toString();\n}`;
src=src.slice(0,reloadStart)+reloadFn+src.slice(reloadEnd+2);
const requestStart=src.indexOf('export async function requestServiceWorkerUpdate');
if(requestStart<0)throw new Error('requestServiceWorkerUpdate anchor missing');
const clearAt=src.indexOf('await clearBrowserCaches().catch(() => {});',requestStart);
if(clearAt<0)throw new Error('cache clear anchor missing');
if(!src.slice(requestStart,clearAt).includes('unregisterAllServiceWorkers'))src=src.slice(0,clearAt)+`await unregisterAllServiceWorkers().catch(() => []);\n  `+src.slice(clearAt);
fs.writeFileSync(path,src);
fs.writeFileSync('public/update.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate"><title>Updating Road Ready</title><style>body{margin:0;background:#08152b;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}.card{width:min(88vw,420px);text-align:center}.spin{width:48px;height:48px;border:5px solid #54709c;border-top-color:#fff;border-radius:50%;margin:0 auto 24px;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}h1{font-size:28px;margin:0 0 10px}p{color:#bcc9df;font-weight:700;line-height:1.45}</style></head><body><main class="card"><div class="spin"></div><h1>Installing latest version</h1><p>Road Ready is clearing the old app shell. Your logs and documents stay saved.</p></main><script>(async()=>{const p=new URLSearchParams(location.search);const version=p.get('road_ready_update')||'latest';try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));}if(window.caches?.keys){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}try{localStorage.setItem('road_ready_last_hard_update',JSON.stringify({version,at:new Date().toISOString()}));}catch{}await new Promise(r=>setTimeout(r,500));const next=new URL(p.get('next')||'/',location.origin);next.searchParams.set('installed',version);next.searchParams.set('hard_update',Date.now());location.replace(next.toString());}catch(e){setTimeout(()=>location.replace('/?hard_update='+Date.now()),800);}})();</script></body></html>`);
const now=new Date().toISOString();
fs.writeFileSync('public/app-version.json',JSON.stringify({version:'109.7.15',build:'v109715-iphone-hard-update-bridge',releasedAt:now,updatedAt:now,label:'v109.7.15 iPhone Hard Update Bridge',force:true,notes:['Reload latest now unregisters every service worker before navigation.','All Cache Storage app shells are removed while local Road Ready data remains preserved.','A standalone update bridge reloads the production app with a cache-busted URL.']},null,2)+'\n');
console.log('PASS — v109.7.15 iPhone hard update bridge applied last');