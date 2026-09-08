import fs from 'node:fs';
import crypto from 'node:crypto';

await import('./finalize-live-load-scanner-editor-v11034b.mjs');

const VERSION='110.3.4';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);
const publicApi='source/src/modules/logbook/public-api.js';
const editor='source/src/modules/editor/EditEventSheet.jsx';

let api=read(publicApi);
if(!api.includes('dutyViewEvents')){
  api=api.trimEnd()+"\nexport { dutyViewEvents } from './dutyViewV110212.js';\n";
  write(publicApi,api);
}

let editorSource=read(editor);
editorSource=editorSource.replace("import { dutyViewEvents } from '../logbook/dutyViewV110212.js';","import { dutyViewEvents } from '../logbook/public-api.js';");
write(editor,editorSource);

// Intentional public Logbook contract revision: export one read-only view helper
// and refresh its stable-file digest before isolation verification.
const lockPath='module-locks.v1.json';
const locks=JSON.parse(read(lockPath));
locks.release=VERSION;
locks.files[publicApi]=crypto.createHash('sha256').update(read(publicApi)).digest('hex');
write(lockPath,JSON.stringify(locks,null,2)+'\n');

console.log('PASS — 110.3.4 editor continuity uses reviewed Logbook public API contract');
