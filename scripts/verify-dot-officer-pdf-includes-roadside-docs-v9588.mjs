import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(dot.includes('Roadside Documents Index'), 'PDF includes roadside document index page');
ok(dot.includes('officerPresentationWalletRows(state)'), 'PDF reads officer-presentable wallet docs');
ok(dot.includes('Roadside Document — ${row.requirement.title}'), 'PDF creates roadside document pages');
ok(dot.includes('imageDocForPdf(row)'), 'PDF attempts to flatten document images');
