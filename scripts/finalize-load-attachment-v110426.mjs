import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(p, 'utf8');
function patch(p, before, after) {const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Attachment anchor: '+p);fs.writeFileSync(p,s.replace(before,after));}
for (const [from,to] of [['attachmentContext.js','attachmentContextV110426.js'],['LoadAttachmentSheet.jsx','LoadAttachmentSheetV110426.jsx']]) fs.copyFileSync('scripts/v110426/'+from,'source/src/modules/scan/'+to);
for (const p of ['source/src/modules/loads/SafeDriverMissionV10966.jsx','source/src/modules/loads/DriverLoadGuideV103.jsx','source/src/modules/home/AdaptiveHomeV1038.jsx']) {
  let s=read(p);
  const statement="import {attachmentContext} from '../scan/attachmentContextV110426.js';\n";
  if(!s.includes(statement))s=statement+s;
  s=s.replaceAll("onOpenScan?.(step.documentType || 'auto');", "onOpenScan?.(step.documentType || 'auto', attachmentContext(guide, step));");
  s=s.replaceAll("onScan?.(step.documentType || 'auto');", "onScan?.(step.documentType || 'auto', attachmentContext(guide, step));");
  s=s.replaceAll("step.documentType === 'pod' ? 'Scan POD' : 'Scan BOL'", "'Add'");
  s=s.replaceAll("step.documentType === 'pod' ? 'Scan POD' : 'Scan document'", "'Add'");
  fs.writeFileSync(p,s);
}
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"import React,", "import LoadAttachmentSheetV110426 from '../scan/LoadAttachmentSheetV110426.jsx';\nimport React,");
patch(home,"  const [scanPreferredType, setScanPreferredType] = useState('auto');", "  const [scanPreferredType, setScanPreferredType] = useState('auto');\n  const [loadAttachment, setLoadAttachment] = useState(null);");
patch(home,'  if (scanOpen) {',`  if (loadAttachment) {
    return <LoadAttachmentSheetV110426 state={state} context={loadAttachment} onClose={() => setLoadAttachment(null)}/>;
  }

  if (scanOpen) {`);
let h=read(home);
const old="onOpenScan={type => { setScanPreferredType(type || 'auto'); setScanOpen(true); }}";
const next="onOpenScan={(type, context) => { if (context) { setLoadAttachment(context); return; } setScanPreferredType(type || 'auto'); setScanOpen(true); }}";
assert.ok(h.includes(old)||h.includes(next),'Mission scanner entry missing');h=h.replaceAll(old,next);
h=h.replaceAll("onOpenScan={type => { setScanPreferredType(normalizeScanPreferenceV11039(type)); setScanOpen(true); }}",next);
fs.writeFileSync(home,h);
const css='source/src/command-center.css',styles=`\n.load-attachment-v110426{background:#f4f7fa;min-height:100dvh;color:#18243c}.load-attachment-v110426 header{display:flex;gap:20px;align-items:center;padding:18px}.load-attachment-v110426 h1{font-size:1.4rem;margin:0}.load-attachment-v110426 main{max-width:600px;margin:auto;padding:18px}.load-attachment-v110426 button{font:inherit;font-size:1rem;min-height:48px;padding:12px 18px;border:1px solid #b8c9dd;border-radius:14px;background:white;color:#234ea0}.load-attachment-v110426 button:disabled{opacity:.55}.attachment-choices{display:flex;flex-wrap:wrap;gap:12px}.attachment-preview{margin:20px 0;padding:10px;background:white;border-radius:18px;overflow-wrap:anywhere}.attachment-preview img{display:block;width:100%;max-height:60dvh;object-fit:contain}.load-attachment-v110426 .attachment-save{margin-top:20px;width:100%;background:#2859b8;color:white}.load-attachment-v110426 h2{overflow-wrap:anywhere}\n`;
if(!read(css).includes('.load-attachment-v110426{'))fs.appendFileSync(css,styles);
const VERSION='110.4.26',BUILD='v110426-direct-load-attachments';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.26 Add load documents',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Add BOL and signed POD directly to the selected load.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.25'","'"+VERSION+"'").replaceAll("'v110425-ai-reader-runtime'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — direct BOL/POD load attachments installed');
await import('./finalize-attachment-scanner-v110427.mjs');
