import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;assert.equal(s.split(b).length,2,'Inspection snapshot anchor: '+p+' '+b.slice(0,65));fs.writeFileSync(p,s.replace(b,()=>a));}
for(const [from,to] of [['core.js','inspectionSnapshot.js'],['client.js','inspectionShare.js']])fs.copyFileSync('scripts/inspection-snapshot/'+from,'lib/owner-op-cloud/'+to);
const dot='source/src/modules/dot/DotMode.jsx';
patch(dot,"import React, { useEffect, useMemo, useState }", "import React, { useEffect, useMemo, useState, useRef }");
patch(dot,"import { backupLocalData, cloudApi } from '../../../../lib/owner-op-cloud/client.js';", "import { createCurrentInspectionShare } from '../../../../lib/owner-op-cloud/inspectionShare.js';");
patch(dot,'export default function DotMode({ state, onBack }) {','export default function DotMode({ state, onBack }) {\n  const inspectionState = useRef(state); inspectionState.current = state;');
let s=read(dot);
if(!s.includes('const share = await createCurrentInspectionShare(')){
 const start=s.indexOf('      const sync = await backupLocalData({');
 const end=s.indexOf('      const shareUrl = ',start);
 assert.ok(start>0&&end>start,'Exact officer email creation boundary');
 s=s.slice(0,start)+`      const share = await createCurrentInspectionShare({getState:()=>inspectionState.current,walletKeys:[],onProgress:setStatus});\n`+s.slice(end);
 fs.writeFileSync(dot,s);
}
const hub='source/src/modules/cloud/CloudHub.jsx';
patch(hub,"import './cloud.css';","import { createCurrentInspectionShare } from '../../../../lib/owner-op-cloud/inspectionShare.js';\nimport './cloud.css';");
s=read(hub);
if(!s.includes('await createCurrentInspectionShare(')){
 const start=s.indexOf('  async function createShare() {'),end=s.indexOf('  async function openDay(',start);
 assert.ok(start>0&&end>start,'Cloud share boundary');
 s=s.slice(0,start)+`  async function createShare() {\n    setBusy(true);setError('');try {\n      const r=await createCurrentInspectionShare({walletKeys:selected,onProgress:setMessage});\n      setShare({...r,url:window.location.origin+'/inspection#'+r.token});\n      setMessage('Current inspection snapshot created. Review it before sending.');await refresh();\n    }catch(e){setError(e.message);}finally{setBusy(false);}\n  }\n`+s.slice(end);
 fs.writeFileSync(hub,s);
}
const core='lib/owner-op-cloud/core.js';
patch(core,'  const raw = snapshot?.dayData?.events || [];',`  const view = snapshot?.inspectionView;
  if (view && (view.version !== 1 || view.day !== snapshot.sourceDay || !Array.isArray(view.events)
    || !Number.isInteger(view.cutoff) || view.cutoff < 0 || view.cutoff > 1440)) throw Error('Invalid inspection snapshot');
  if (view) cutoff = view.cutoff;
  const raw = view ? view.events : snapshot?.dayData?.events || [];`);
patch(core,"usdot: state.dotNumber || state.usdot || p.usdotNumber || '',","usdot: state.dotNumber || state.usdot || state.carrierDot || p.usdotNumber || '',");
patch(core,"unit: state.currentTruck || state.driver?.truck || p.truckNumber || '',","unit: state.driver?.truck || state.currentTruck || p.truckNumber || '',");
const inspector='source/src/modules/cloud/Inspector.jsx';
patch(inspector,"  if (!snapshot?.dayData?.signature?.signed) return null;","  if (snapshot?.inspectionView && !snapshot.inspectionView.certified) return null;\n  if (!snapshot?.dayData?.signature?.signed) return null;");
patch(inspector,"const cutoff = day === endDay && generatedAt ? minuteAt(generatedAt, zone || 'America/Chicago') : 1440;","const cutoff = snapshot?.inspectionView?.cutoff ?? (day === endDay && generatedAt ? minuteAt(generatedAt, zone || 'America/Chicago') : 1440);");
patch(inspector,"{text(snapshot.dayData.certifyStatus)||'Not certified'}","{text(snapshot.inspectionView?.certification ?? snapshot.dayData.certifyStatus)||'Not certified'}");
patch(inspector,'setManifest(m);','setManifest({...m,generated_at:m.profile?.inspectionCapturedAt || m.generated_at});');
patch(inspector,"'24-hour timeline · source events shown without automatic gap filling'","'24-hour timeline · saved inspection snapshot'");
console.log('PASS — current immutable inspection snapshot installed; raw logs remain unchanged');
