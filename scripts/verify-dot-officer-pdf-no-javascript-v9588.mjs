import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
const pdfStart = dot.indexOf('function buildPdfBlobFromPages');
const pdfEnd = dot.indexOf('async function dotOfficerPdfBlob');
const pdfCode = dot.slice(pdfStart, pdfEnd);
ok(!pdfCode.includes('<script'), 'PDF builder does not inject HTML script');
ok(!pdfCode.includes('roadsideDocumentViewerScriptHtml()'), 'PDF builder does not depend on HTML viewer script');
ok(dot.includes('This PDF is self-contained'), 'PDF cover explains self-contained package');
