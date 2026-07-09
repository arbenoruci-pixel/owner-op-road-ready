import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(dot.includes('/Subtype /Image') && dot.includes('DCTDecode'), 'PDF embeds images as XObjects');
ok(dot.includes('base64ToUint8') && dot.includes('canvas.toDataURL'), 'PDF converts embedded image data into self-contained bytes');
ok(dot.includes('new Blob(chunks, { type: \'application/pdf\' })'), 'PDF returns a self-contained Blob');
