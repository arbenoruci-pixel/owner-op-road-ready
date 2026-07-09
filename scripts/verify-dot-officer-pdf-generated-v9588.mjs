import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(dot.includes('async function dotOfficerPdfBlob'), 'has dotOfficerPdfBlob generator');
ok(dot.includes('buildPdfBlobFromPages'), 'has pure PDF builder');
ok(dot.includes('application/pdf'), 'creates application/pdf file');
ok(dot.includes('dot-officer-package-${days[0]}.pdf'), 'uses dot-officer-package pdf filename');
ok(dot.includes('Share DOT Officer PDF'), 'primary share PDF button exists');
