import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(dot.includes('@media(max-width:700px)'), 'HTML package has phone media query');
ok(dot.includes('overflow-x:hidden'), 'HTML package hides horizontal overflow');
ok(dot.includes('overflow-wrap:anywhere'), 'HTML package wraps long text');
ok(dot.includes('wallet-report-table') && dot.includes('display:block'), 'document tables collapse for mobile');
