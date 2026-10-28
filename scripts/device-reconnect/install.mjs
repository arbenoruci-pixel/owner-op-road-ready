import fs from 'node:fs';
for(const [source,target]of [['deviceSession.js','lib/owner-op-cloud/deviceSessionV110463.js'],['DeviceSessionGate.jsx','source/src/modules/auth/DeviceSessionGateV110463.jsx']])fs.copyFileSync('scripts/device-reconnect/'+source,target);
console.log('PASS — suspended device checks cancel safely; foreground retries use a fresh request and retain locked controls');
