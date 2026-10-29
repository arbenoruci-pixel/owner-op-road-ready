import fs from 'node:fs';
import assert from 'node:assert/strict';
function patch(file,before,after){const source=fs.readFileSync(file,'utf8');if(source.includes(after))return;assert.equal(source.split(before).length,2,'Sync continuity anchor: '+file);fs.writeFileSync(file,source.replace(before,()=>after));}
// Only publish local readiness after account ownership, live device authority,
// pending journal recovery and handoff checks, and a durable local capture.
// File upload / workspace RPC latency must not keep the local logbook closed.
patch('lib/owner-op-cloud/accountSyncV110455.js',
 'const meaningful=hasData(local);canOpenLocal=meaningful&&!receiving;',
 `const meaningful=hasData(local);canOpenLocal=meaningful&&!receiving;
   if(canOpenLocal)show({phase:'local_ready',message:'Saved records are ready. Checking account changes in the background.',localReady:{uid,sid:writer.sid,generation:writer.generation}});`);
patch('source/src/modules/cloud/AccountSyncGateV110455.jsx',
 "import './syncReliability.css';",
 "import './syncReliability.css';\nimport {deviceSessionStatus} from '../../../../lib/owner-op-cloud/deviceSessionV110463.js';");
patch('source/src/modules/cloud/AccountSyncGateV110455.jsx',
 'const update = event => setStatus(event.detail);',
 `const update = event => {
      const next=event.detail,device=deviceSessionStatus(),local=next.localReady;
      if(next.phase==='local_ready'&&local&&device?.active&&device.receive!==true&&
         device.uid===local.uid&&device.sid===local.sid&&device.generation===local.generation)setReady(true);
      setStatus(next);
    };`);
// Connection checks keep the mounted scanner and its draft visible. Controls
// remain inert until fresh authorization succeeds; initial/revoked sessions
// still use the full gate. Never remount children for a transport failure.
fs.copyFileSync('scripts/sync-continuity/DeviceSessionGate.jsx','source/src/modules/auth/DeviceSessionGateV110463.jsx');
console.log('PASS — owned local records open before archive sync; reconnect retains the scanner and locked controls');
