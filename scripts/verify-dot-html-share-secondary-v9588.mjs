import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(dot.includes('Share HTML Backup'), 'HTML share is labeled as backup');
ok(dot.includes('PDF first') || dot.includes('Use PDF first'), 'UI guides driver to PDF first');
ok(dot.includes('DOT Inspection HTML Package'), 'HTML share remains available');
