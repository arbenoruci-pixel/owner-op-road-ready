import fs from 'node:fs';
import path from 'node:path';

const VERSION = '109.6.6';
const BUILD = 'v10966-no-reload-mission-shell';
const HOME_PATH = 'source/src/modules/home/HomeScreen.jsx';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  const directory = path.dirname(filePath);
  if (directory && directory !== '.') fs.mkdirSync(directory, { recursive:true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, transform) {
  const value = JSON.parse(read(filePath));
  transform(value);
  write(filePath, JSON.stringify(value, null, 2) + '\n');
}

write('source/src/modules/loads/safeMissionModelV10966.js', String.raw`export const SAFE_MISSION_VERSION_V10966 = '109.6.6';

function textV10966(value = '') {
  return String(value || '').trim();
}

function refV10966(value = '') {
  return textV10966(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function listV10966(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function activityV10966(event = {}) {
  return [
    ...listV10966(event.reasons),
    event.reason,
    event.note,
    event.description,
    event.operation,
    event.action,
    event.trailerAction,
    event.activity,
  ].map(textV10966).filter(Boolean).join(' ').toLowerCase();
}

function eventRefsV10966(event = {}) {
  return [event.loadNo, event.shippingDocs, event.orderNo, event.bol, event.bolNo, event.po, event.poNumber]
    .map(refV10966).filter(Boolean);
}

function guideRefsV10966(guide = {}) {
  const poNumbers = Array.isArray(guide.poNumbers) ? guide.poNumbers : textV10966(guide.poNumbers).split(/[·,|]/);
  return [guide.loadNo, guide.orderNo, guide.legNo, guide.pickupNumber, ...poNumbers]
    .map(refV10966).filter(Boolean);
}

function matchesGuideV10966(value = {}, guide = {}) {
  const own = eventRefsV10966(value);
  const refs = guideRefsV10966(guide);
  if (!own.length) return true;
  return own.some(item => refs.includes(item));
}

function samePickupV10966(event = {}, guide = {}) {
  const pickup = listV10966(guide.stops).find(stop => stop.type === 'pickup') || listV10966(guide.stops)[0] || {};
  const targetCity = textV10966(pickup.city).toLowerCase();
  const targetState = textV10966(pickup.state).toUpperCase();
  const eventCity = textV10966(event.city || event.location?.city).toLowerCase();
  const eventState = textV10966(event.state || event.location?.state).toUpperCase();
  const cityOk = !targetCity || (eventCity && (eventCity.includes(targetCity) || targetCity.includes(eventCity)));
  const stateOk = !targetState || (eventState && eventState === targetState);
  return Boolean(cityOk && stateOk);
}

export function allMissionEventsV10966(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, events]) => listV10966(events).map(event => ({ ...event, _day:day })));
}

export function pickupPresenceV10966(state = {}, guide = {}) {
  return allMissionEventsV10966(state).some(event => (
    event.status === 'ON'
    && /pickup|pick\s*up|loading|hook(?:ed)?|drop\s*&?\s*hook|pickup\s+trailer|dhl\s*yard/.test(activityV10966(event))
    && matchesGuideV10966(event, guide)
    && samePickupV10966(event, guide)
  ));
}

export function findBolEvidenceV10966(state = {}, guide = {}, businessStore = {}) {
  const refs = guideRefsV10966(guide);
  const rows = [
    ...listV10966(businessStore.documents),
    ...Object.values(state.documentsByDay || {}).flatMap(listV10966),
  ];
  const linked = state.lastDocumentLink || {};
  if (/^(?:bol|bill_of_lading)$/i.test(textV10966(linked.type))) {
    const linkedRef = refV10966(linked.canonicalLoadNo || linked.loadNo || linked.bolNo);
    if (linkedRef && refs.includes(linkedRef)) return linked;
  }
  return rows.find(document => {
    if (!/^(?:bol|bill_of_lading)$/i.test(textV10966(document.type))) return false;
    const documentRef = refV10966(document.canonicalLoadNo || document.loadNo || document.orderNo || document.bolNo || document.poNumber);
    return Boolean(documentRef && refs.includes(documentRef));
  }) || null;
}

function safeStepV10966(step = {}, index = 0) {
  return {
    ...step,
    id:textV10966(step.id) || ('step_' + (index + 1)),
    kind:textV10966(step.kind) || 'manual',
    title:textV10966(step.title) || 'Continue load',
    detail:textV10966(step.detail),
    location:textV10966(step.location || [step.city, step.state].filter(Boolean).join(', ')),
    checklist:listV10966(step.checklist).map(textV10966).filter(Boolean),
  };
}

export function safeGuideV10966(guide = null) {
  if (!guide || typeof guide !== 'object') return null;
  return {
    ...guide,
    loadNo:textV10966(guide.loadNo || guide.orderNo),
    orderNo:textV10966(guide.orderNo || guide.loadNo),
    origin:textV10966(guide.origin),
    destination:textV10966(guide.destination),
    stops:listV10966(guide.stops),
    steps:listV10966(guide.steps).map(safeStepV10966),
    manualDone:guide.manualDone && typeof guide.manualDone === 'object' ? guide.manualDone : {},
    documents:guide.documents && typeof guide.documents === 'object' ? guide.documents : {},
  };
}

export function safeMissionProgressV10966(state = {}, guideInput = null, businessStore = {}) {
  const guide = safeGuideV10966(guideInput);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, pickupPresent:false, bol:null };
  const pickupPresent = pickupPresenceV10966(state, guide);
  const bol = findBolEvidenceV10966(state, guide, businessStore);
  const steps = guide.steps.map(step => {
    let complete = Boolean(guide.manualDone?.[step.id] || step.complete);
    if (pickupPresent && (step.id === 'route_pickup' || step.id === 'arrive_pickup')) complete = true;
    if (bol && step.id === 'pickup_bol') complete = true;
    return { ...step, complete };
  });
  const completed = steps.filter(step => step.complete).length;
  const total = steps.length;
  return {
    guide,
    steps,
    completed,
    total,
    percent:total ? Math.round((completed / total) * 100) : 0,
    currentStep:steps.find(step => !step.complete) || null,
    pickupPresent,
    bol,
  };
}
`);

write('source/src/modules/loads/SafeDriverMissionV10966.jsx', String.raw`import React, { useEffect, useMemo } from 'react';
import { readBusinessStore } from '../business/businessStore.js';
import {
  dispatchLoadGuideActionV103,
  dispatchSmartDocumentLinkV100,
  getActiveLoadGuideV103,
} from './loadGuideV103.js';
import { safeMissionProgressV10966 } from './safeMissionModelV10966.js';

function openRouteV10966(step = {}) {
  const destination = step.location || [step.city, step.state].filter(Boolean).join(', ');
  if (!destination || typeof window === 'undefined') return;
  const params = new URLSearchParams({ api:'1', destination, travelmode:'driving' });
  window.open('https://www.google.com/maps/dir/?' + params.toString(), '_blank', 'noopener,noreferrer');
}

function runMissionStepV10966(guide, step, onOpenScan) {
  if (!guide || !step || step.complete) return;
  if (step.kind === 'route') return openRouteV10966(step);
  if (step.kind === 'status') {
    dispatchLoadGuideActionV103({ action:'open_status', guideId:guide.id, stepId:step.id, step });
    return;
  }
  if (step.kind === 'document') {
    onOpenScan?.(step.documentType || 'auto');
    return;
  }
  dispatchLoadGuideActionV103({
    action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done',
    guideId:guide.id,
    stepId:step.id,
    step,
  });
}

function actionLabelV10966(step = {}) {
  if (step.kind === 'route') return 'Open route';
  if (step.kind === 'status') return step.status === 'D' ? 'Log Driving' : 'Open Logbook';
  if (step.kind === 'document') return step.documentType === 'pod' ? 'Scan POD' : 'Scan BOL';
  if (step.kind === 'complete_stop') return 'Complete stop';
  return 'Mark done';
}

function SafeMissionBodyV10966({ state = {}, onBack, onOpenScan }) {
  const rawGuide = useMemo(() => getActiveLoadGuideV103(state), [state]);
  const businessStore = useMemo(() => {
    try { return readBusinessStore(); } catch { return {}; }
  }, [state]);
  const progress = useMemo(() => safeMissionProgressV10966(state, rawGuide, businessStore), [state, rawGuide, businessStore]);
  const guide = progress.guide;

  useEffect(() => {
    if (!guide) return;
    if (progress.pickupPresent) {
      for (const stepId of ['route_pickup', 'arrive_pickup']) {
        if (!guide.manualDone?.[stepId]) {
          const step = guide.steps.find(item => item.id === stepId);
          if (step) dispatchLoadGuideActionV103({ action:'toggle_done', guideId:guide.id, stepId, step });
        }
      }
    }
    if (progress.bol && !guide.documents?.bolDocumentId && !guide.documents?.pickupBolDocumentId) {
      const id = progress.bol.id || progress.bol.localDocumentId || progress.bol.clientDocumentId || progress.bol.documentId || '';
      dispatchSmartDocumentLinkV100({
        type:{ id:'bol', label:'Bill of Lading' },
        typeId:'bol',
        fields:{
          type:'bol',
          loadNo:guide.loadNo,
          canonicalLoadNo:guide.loadNo,
          bolNo:progress.bol.bolNo || '',
        },
        record:progress.bol,
        localDocument:{ local_id:id, id },
        source:'safe_mission_bol_relink_v10966',
      });
    }
  }, [guide, progress.pickupPresent, progress.bol]);

  if (!guide) {
    return <section style={{ minHeight:'100vh', padding:'28px 22px', background:'#f4f7f6', color:'#10213c' }}>
      <button type="button" onClick={onBack} style={{ border:'1px solid #cad5e4', borderRadius:18, padding:'14px 18px', background:'#fff', fontWeight:800 }}>Back</button>
      <div style={{ marginTop:28, border:'1px solid #c8d7ee', borderRadius:28, padding:24, background:'#fff' }}>
        <div style={{ fontSize:13, fontWeight:900, letterSpacing:2, color:'#2563eb' }}>DRIVER MISSION</div>
        <h1 style={{ margin:'10px 0', fontSize:30 }}>Mission data is safe</h1>
        <p style={{ color:'#66758d', fontWeight:700 }}>Open Home again after the load finishes syncing.</p>
      </div>
    </section>;
  }

  const current = progress.currentStep;
  return <section style={{ minHeight:'100vh', paddingBottom:40, background:'#f4f7f6', color:'#10213c' }}>
    <header style={{ position:'sticky', top:0, zIndex:4, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'18px 18px', background:'#fff', borderBottom:'1px solid #dbe4ef' }}>
      <button type="button" onClick={onBack} style={{ border:'1px solid #cad5e4', borderRadius:16, padding:'11px 15px', background:'#fff', fontWeight:900 }}>Back</button>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:12, letterSpacing:2, fontWeight:900, color:'#2563eb' }}>DRIVER MISSION</div><div style={{ fontSize:22, fontWeight:950 }}>Load {guide.loadNo || guide.orderNo}</div></div>
      <strong style={{ minWidth:48, textAlign:'right', color:'#2563eb' }}>{progress.percent}%</strong>
    </header>

    <main style={{ padding:'18px', maxWidth:760, margin:'0 auto' }}>
      <section style={{ borderRadius:28, padding:24, color:'#fff', background:'#102b57', boxShadow:'0 12px 30px rgba(16,43,87,.15)' }}>
        <div style={{ fontSize:13, fontWeight:900, letterSpacing:2, opacity:.75 }}>ACTIVE LOAD</div>
        <h1 style={{ margin:'8px 0 4px', fontSize:36 }}>{guide.loadNo || guide.orderNo}</h1>
        <p style={{ margin:0, fontSize:18, fontWeight:800, opacity:.85 }}>{guide.origin || 'Pickup'} → {guide.destination || 'Final destination'}</p>
        <div style={{ marginTop:18, height:10, borderRadius:999, background:'rgba(255,255,255,.2)', overflow:'hidden' }}><i style={{ display:'block', width:progress.percent + '%', height:'100%', background:'#5ee0a5' }}/></div>
        <div style={{ marginTop:8, fontWeight:800, opacity:.82 }}>{progress.completed}/{progress.total} steps</div>
      </section>

      <section style={{ marginTop:18, borderRadius:28, padding:24, background:'#fff', border:'1px solid #d7e1ee' }}>
        <div style={{ fontSize:13, fontWeight:900, letterSpacing:2, color:'#2563eb' }}>DO THIS NOW</div>
        <h2 style={{ margin:'10px 0 6px', fontSize:30 }}>{current?.title || 'Pickup workflow complete'}</h2>
        {current?.detail ? <p style={{ margin:'0 0 8px', color:'#66758d', fontWeight:750, fontSize:17 }}>{current.detail}</p> : null}
        {current?.location ? <p style={{ margin:'0 0 16px', color:'#40526f', fontWeight:850 }}>{current.location}</p> : null}
        {current?.checklist?.length ? <div style={{ display:'grid', gap:8, margin:'15px 0' }}>{current.checklist.map((item, index) => <div key={item + index} style={{ borderRadius:14, padding:'11px 13px', background:'#f2f6fb', fontWeight:800 }}>{item}</div>)}</div> : null}
        {current ? <button type="button" onClick={() => runMissionStepV10966(guide, current, onOpenScan)} style={{ width:'100%', border:0, borderRadius:18, padding:'17px 18px', background:'#159777', color:'#fff', fontSize:19, fontWeight:950 }}>{actionLabelV10966(current)}</button> : null}
      </section>

      <section style={{ marginTop:18, borderRadius:28, padding:22, background:'#fff', border:'1px solid #d7e1ee' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}><strong style={{ fontSize:20 }}>Driver checklist</strong><span style={{ color:'#66758d', fontWeight:800 }}>{progress.completed}/{progress.total}</span></div>
        <div style={{ display:'grid', gap:10 }}>
          {progress.steps.map((step, index) => <div key={step.id + index} style={{ display:'grid', gridTemplateColumns:'38px 1fr auto', gap:10, alignItems:'center', borderRadius:16, padding:'12px', background:step.complete ? '#effbf4' : '#f7f9fc' }}>
            <span style={{ width:32, height:32, borderRadius:12, display:'grid', placeItems:'center', background:step.complete ? '#d8f7e5' : '#e8eef8', color:step.complete ? '#08784e' : '#315b9c', fontWeight:950 }}>{step.complete ? '✓' : index + 1}</span>
            <div><b style={{ display:'block', fontSize:16 }}>{step.title}</b>{step.detail ? <em style={{ display:'block', marginTop:3, color:'#6b7890', fontStyle:'normal', fontWeight:700 }}>{step.detail}</em> : null}</div>
            {step.complete ? <strong style={{ color:'#08784e' }}>Done</strong> : <button type="button" onClick={() => runMissionStepV10966(guide, step, onOpenScan)} style={{ border:'1px solid #bfcde0', borderRadius:12, padding:'9px 10px', background:'#fff', fontWeight:900 }}>{actionLabelV10966(step)}</button>}
          </div>)}
        </div>
      </section>
    </main>
  </section>;
}

class MissionBoundaryV10966 extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed:false };
  }
  static getDerivedStateFromError() {
    return { failed:true };
  }
  componentDidCatch(error) {
    try { console.error('Safe mission render failed', error); } catch {}
  }
  render() {
    if (this.state.failed) {
      return <section style={{ minHeight:'100vh', padding:24, background:'#f4f7f6', color:'#10213c' }}>
        <button type="button" onClick={this.props.onBack} style={{ border:'1px solid #cad5e4', borderRadius:16, padding:'12px 16px', background:'#fff', fontWeight:900 }}>Back to Home</button>
        <div style={{ marginTop:24, borderRadius:24, padding:22, background:'#fff', border:'1px solid #d7e1ee' }}><strong style={{ fontSize:24 }}>Mission data remains saved</strong><p style={{ color:'#66758d', fontWeight:700 }}>Use Home while this screen recovers. No reload is required.</p></div>
      </section>;
    }
    return this.props.children;
  }
}

export default function SafeDriverMissionV10966(props) {
  return <MissionBoundaryV10966 onBack={props.onBack}><SafeMissionBodyV10966 {...props}/></MissionBoundaryV10966>;
}
`);

let home = read(HOME_PATH);
const oldImport = "import DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';";
const safeImport = "import SafeDriverMissionV10966 from '../loads/SafeDriverMissionV10966.jsx';";
if (!home.includes(safeImport)) {
  if (!home.includes(oldImport)) throw new Error('v109.6.6 Home DriverLoadGuide import missing');
  home = home.replace(oldImport, oldImport + '\n' + safeImport);
}
const fullMissionPattern = /if \(guideOpen(?: && getActiveLoadGuideV103\(state\))?\) \{\s*return <DriverLoadGuideV103 state=\{state\} mode="screen" onBack=\{\(\) => setGuideOpen\(false\)\} onOpenScan=\{\(\) => \{ setGuideOpen\(false\); setBusinessSection\('loads'\); \}\} \/>;\s*\}/;
const safeMissionBlock = `if (guideOpen) {
    return <SafeDriverMissionV10966 state={state} onBack={() => setGuideOpen(false)} onOpenScan={() => { setGuideOpen(false); setBusinessSection('loads'); }} />;
  }`;
if (!home.includes('<SafeDriverMissionV10966 state={state}')) {
  if (!fullMissionPattern.test(home)) throw new Error('v109.6.6 Full mission Home block missing');
  home = home.replace(fullMissionPattern, safeMissionBlock);
}
write(HOME_PATH, home);

write('public/sw.js', String.raw`const OWNER_OP_SW_VERSION = '109.6.6';
const OWNER_OP_SW_BUILD = 'v10966-no-reload-mission-shell';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'OWNER_OP_GET_SW_VERSION') {
    event.source?.postMessage?.({ type:'OWNER_OP_SW_VERSION', version:OWNER_OP_SW_VERSION, build:OWNER_OP_SW_BUILD });
  }
  if (event.data?.type === 'OWNER_OP_ACTIVATE_UPDATE') {
    self.skipWaiting();
    event.source?.postMessage?.({ type:'OWNER_OP_SW_ACTIVATED', version:OWNER_OP_SW_VERSION, build:OWNER_OP_SW_BUILD });
  }
});

// Navigation and JavaScript stay network-authoritative. This worker never
// serves stale app-shell chunks and never tells the page to reload itself.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(fetch(request, { cache:'no-store' }));
  }
});
`);

write('public/force-update-10966.html', String.raw`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Road Ready 109.6.6</title>
<style>body{margin:0;background:#f3f7f6;color:#10213c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}.card{max-width:520px;background:#fff;border:1px solid #d6e2ef;border-radius:28px;padding:28px;box-shadow:0 16px 40px rgba(16,33,60,.1)}h1{margin:8px 0 10px;font-size:30px}p{color:#62718a;font-weight:700;line-height:1.45}.bar{height:12px;background:#e7eef7;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;width:20%;background:#18a47f;border-radius:99px;animation:p 1.2s infinite}@keyframes p{0%{transform:translateX(-120%)}100%{transform:translateX(520%)}}</style></head>
<body><div class="card"><small>ROAD READY</small><h1>Installing 109.6.6</h1><p id="status">Removing the old mission shell and cached chunks…</p><div class="bar"><i></i></div></div>
<script>
(async()=>{
  try{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}}
  catch{}
  try{if('caches' in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}}
  catch{}
  document.getElementById('status').textContent='Opening the clean mission shell…';
  setTimeout(()=>location.replace('/?v=10966&clean=' + Date.now()),700);
})();
</script></body></html>`);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.6.6 No-reload Mission Shell',
  force:true,
  notes:[
    'Replaces the Full Mission screen with a defensive renderer that never asks the driver to reload or retry the app.',
    'Uses the real ON DUTY Hook / Pickup Trailer event to complete Navigate to pickup and Log arrival at pickup.',
    'Re-links a verified BOL from the active Load folder and clears Pickup BOL missing for the matching mission.',
    'Keeps a Back to Home recovery screen inside the app if mission data is malformed.',
    'Makes navigation and JavaScript chunks network-authoritative so an old service worker cannot mix stale app code with the current release.',
    'Preserves duty events, HOS clocks, signatures, inspections, documents and the Load 97155 route.'
  ],
}, null, 2) + '\n');

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '" + VERSION + "';");
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, "const FALLBACK_APP_BUILD = '" + BUILD + "';");
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.6 no-reload mission shell applied');
