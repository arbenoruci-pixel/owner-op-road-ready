import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after) {
  const source=read(file);if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Smart Scan 110.3.18 anchor ${file}: ${before.slice(0,90)}`);
  fs.writeFileSync(file,source.replace(before,after));
}
const scan='source/src/modules/scan/',loads='source/src/modules/loads/';
fs.copyFileSync('scripts/v110318/savedScanResumeV110318.js',scan+'savedScanResumeV110318.js');

// A confirmed load can have pending appointments. The guide already renders
// missing dates and builds pickup/delivery stops from origin/destination.
const recovery=loads+'savedLoadRecoveryV110312.js';
patch(recovery,"guide.stops?.length>=2", "(guide.stops?.length>=2 || guide.savedDocumentGuideV110312)");
patch(recovery,"if(record.status!=='verified'||!record.canonicalLoadNo||!record.broker)return null;", "if(!record.canonicalLoadNo || terminal(record.status) || terminal(record.reviewStatus))return null;\n if(record.status!=='verified' && !['document_reference','driver_selected'].includes(record.loadAssignmentStatusV11037 || record.extracted?.loadAssignmentStatusV11037))return null;");
patch(recovery,"&&l.broker&&brokerKey(l.broker)!==brokerKey(record.broker)","&&l.broker&&record.broker&&brokerKey(l.broker)!==brokerKey(record.broker)");
patch(recovery,"if(fields.broker&&brokerKey(fields.broker)!==brokerKey(record.broker))return null;","if(fields.broker&&record.broker&&brokerKey(fields.broker)!==brokerKey(record.broker))return null;");
patch(recovery," if(!Array.isArray(stops)||stops.length<2||stops.some(s=>!s.city||!s.state||!/^\\d{4}-\\d{2}-\\d{2}$/.test(s.date||'')))return null;", " // Optional stop dates/addresses do not block the saved load.\n if(Array.isArray(stops))fields.stops=stops.map(s=>({...s}));");
patch(recovery,"broker:record.broker},{documentId:record.id", "broker:record.broker||fields.broker||''},{documentId:record.id");
patch(recovery,"candidates.filter(g=>(g.deliveryDate||g.pickupDate||'')>=cutoff)","candidates.filter(g=>(g.deliveryDate||g.pickupDate||'')>=cutoff || !g.deliveryDate&&!g.pickupDate&&stamp(g.createdAt)>=Date.now()-14*86400000)");

// Readable shipping references are equivalent across broker/customer labels.
// A unique match is required; equipment, contact numbers and date alone never match.
const assignment=scan+'scanLoadAssignmentV11037.js';
patch(assignment,"const haystack = String(text).toUpperCase().replace(/[._-]/g, '');", "const haystack = String(text).toUpperCase().replace(/[._\\/-]/g, '');");
patch(assignment,"if (['load_number','order_number'].includes(ref.kind) && value === norm(candidate.loadNo)) return true;", "if (value === norm(candidate.loadNo)) return true;");
patch(assignment,"(alias.kind === ref.kind || ['load_number','order_number'].includes(ref.kind) && ['load_number','order_number'].includes(alias.kind))", "shippingKinds.has(alias.kind)");
patch(assignment,"      ref.kind === 'bol_number' && value === norm(stop.bolNumber) ||\n      ref.kind === 'po_number' && value === norm(stop.poNumber)", "      [stop.bolNumber,stop.bolNo,stop.poNumber,stop.pickupNumber,stop.deliveryNumber].some(v=>v && value===norm(v))");
// Every PO survives save/reopen, not only the first one.
const foundation='source/src/modules/documents/documentFoundationV105.js';
patch(foundation,"export function matchDocumentToLoadV105({\n","export function matchDocumentToLoadV105({\n  candidateLimit = 8,\n");
patch(foundation,"candidates:ranked.slice(0, 8),","candidates:ranked.slice(0, candidateLimit),");
patch(assignment,"const base = matchDocumentToLoadV105(options);","const base = matchDocumentToLoadV105({...options,candidateLimit:Infinity});");
patch(foundation,"  if (Array.isArray(f.references)) {", "  for(const value of f.poNumbers || [])addFieldReferenceV105(out,'po_number',value);\n  if (Array.isArray(f.references)) {");
patch(scan+'rateConSaveStabilityV10964.js',"    poNumber:textV10964(stop.poNumber || stop.po).slice(0, 100),", "    poNumber:textV10964(stop.poNumber || stop.po).slice(0, 100),\n    bolNumber:textV10964(stop.bolNumber || stop.bolNo).slice(0,100),");
patch(scan+'rateConSaveStabilityV10964.js',"  if (Array.isArray(fields.stops))", "  if (Array.isArray(fields.references)) out.references=fields.references.filter(r=>r && typeof r.value==='string').slice(0,80).map(r=>({kind:r.kind,value:r.value,source:r.source}));\n  if (Array.isArray(fields.stops))");

// Accept common printed BOL labels (#, ID, colon, dotted initials) and date
// punctuation while continuing to qualify the value against its own label.
const semantics=scan+'documentFieldSemanticsV11038.js';
patch(semantics,"  bolNo:'(?:B[O0]L|B[\\\\/]L|BILL[ \\\\t]+OF[ \\\\t]+LADING)[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|#|(?=:))',", "  bolNo:'(?:B\\\\.?[ \\\\t]*[O0]\\\\.?[ \\\\t]*L\\\\.?|B[\\\\/]L|BILL?[ \\\\t]+OF[ \\\\t]+LADIN[G6])[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|ID|#|(?=:))',");
patch(semantics,"  pickupNumber:'PICK[ \\\\t]*UP[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|#)',", "  pickupNumber:'(?:PICK[ \\\\t]*UP|P[ \\\\t]*U)[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|ID|#)',");
patch(semantics,"(?=$|[ \\\\t:#.\\\\-])", "(?=$|[ \\\\t:#.\\\\-]|[0-9])");
patch(semantics,"(?=$|\\s)/);\n  if(!hit)return null;", "(?=$|[\\s,;|])/);\n  if(!hit)return null;");
patch(semantics,"BOL[ \\\\t]+DATE|^DATE", "B\\\\.?O\\\\.?L\\\\.?[ \\\\t]+DATE|DATE[ \\\\t]+SHIPPED|SHIPPING[ \\\\t]+DATE|^DATE");
const structure=scan+'smartScanEvidenceV11039.js';
patch(structure,"  const bolHeading=", "  const explicitBol=/\\b(?:B\\.?[ \\t]*[O0]\\.?[ \\t]*L\\.?|B\\/L)[ \\t]*(?:NUMBER|N[O0]\\.?|ID|#|:)/i.test(s);\n  const bolHeading=");
patch(structure,"if (shippingGroups>=3 && (bolHeading || shippingId))", "if (shippingGroups>=2 && (bolHeading || shippingId || explicitBol))");

// Native Blob lookup also carries the durable extraction. The sheet uses it
// immediately and exposes a deliberate Read again action when OCR is needed.
const savedFile=scan+'savedScanFileV110312.js';
patch(savedFile,"import {getOwnerOpDb}","import {savedScanResultV110318} from './savedScanResumeV110318.js';\nimport {getOwnerOpDb}");
patch(savedFile," let clientId=record.clientDocumentId||'';", " const local=await db.documents_local.get(record.localDocumentId||record.id);\n let clientId=record.clientDocumentId||local?.client_document_id||'';");
patch(savedFile," return new File([row.blob],record.fileName||'saved-document.pdf',{type:row.blob.type||record.mimeType||'application/pdf'});", " const file=new File([row.blob],record.fileName||local?.original_file_name||'saved-document.pdf',{type:row.blob.type||record.mimeType||'application/pdf'});\n file.savedScanResultV110318=savedScanResultV110318(record,local);\n return file;");
const sheet=scan+'SmartScanSheetV105.jsx';
// The resume effect must be cancellable under React Strict Mode. Each remount
// gets a fresh generation; stale OCR results cannot overwrite the resumed scan.
patch(sheet,"  const resumedFileV110312=useRef(null);\n  useEffect(()=>{if(initialFileV110312 && resumedFileV110312.current!==initialFileV110312){resumedFileV110312.current=initialFileV110312;chooseFile(initialFileV110312,'auto');}},[initialFileV110312]);", "  useEffect(()=>{if(initialFileV110312)chooseFile(initialFileV110312,'auto');},[initialFileV110312]);");
patch(sheet,"    result = qualifyScanResultV11036(result, state);", "    const resumed=result.resumedRecordV110318;\n    if(!resumed)result = qualifyScanResultV11036(result, state);");
patch(sheet,"const loadNo = planV110311 && !preserveLoadChoice ? instructionLoadV110311 : initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);", "const loadNo = resumed ? resumed.loadNo : planV110311 && !preserveLoadChoice ? instructionLoadV110311 : initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);");
patch(sheet,"const date = documentDateFromResult(result);", "const date = resumed?.date || documentDateFromResult(result);");
patch(sheet,"setLoadSelectionSourceV11037(preserveLoadChoice ?", "setLoadSelectionSourceV11037(resumed?.assignment || (preserveLoadChoice ?");
patch(sheet,"'document_reference' : 'unassigned');\n    setSelectedStopSequence", "'document_reference' : 'unassigned'));\n    setSelectedStopSequence");
patch(sheet,"setLinkToLogbook(Boolean((planV110311", "setLinkToLogbook(Boolean(resumed ? resumed.linkToLogbook : (['bol','pod','delivery_receipt'].includes(typeId)&&safeSelectedLoadV11034&&nextMatch.automatic&&date)||(planV110311");
patch(sheet,"applyResult({...result, userSelectedTypeV11036:typeId}, selectedLoadNo,", "applyResult({...result, resumedRecordV110318:undefined, userSelectedTypeV11036:typeId}, selectedLoadNo,");
patch(sheet,"setLinkDay(date || localDateKey());", "setLinkDay(resumed?.linkDay || date || localDateKey());");
patch(sheet,"    try {\n      const analysisFile =", "    try {\n      if(nextFile.savedScanResultV110318 && !scanMeta.readAgainV110318){applyResult(nextFile.savedScanResultV110318);return;}\n      const analysisFile =");
patch(sheet,"          {previewUrl ? <img", "          {analysis.resumedRecordV110318 ? <button type=\"button\" onClick={()=>chooseFile(file,'auto',{readAgainV110318:true})}>Read again</button> : null}\n          {previewUrl ? <img");
patch(sheet,"        {saved.record.instructionGuideId ? <button", "        {!saved.record.instructionGuideId && saved.record.canonicalLoadNo ? <button type=\"button\" className=\"scan-save-v105\" onClick={()=>{onClose?.();onOpenBusiness?.('loads');}}>Done · Open load</button> : null}\n        {saved.record.instructionGuideId ? <button");

// Recovered scans retain their extraction even under localStorage quota fallback.
const business='source/src/modules/business/businessStore.js';
patch(business,"  const out = {};\n  if(Array.isArray(value.transactions))", "  const out = {};\n  if(Array.isArray(value.poNumbers))out.poNumbers=value.poNumbers.slice(0,40);\n  if(Array.isArray(value.references))out.references=value.references.slice(0,80);\n  if(value.guideSourceTextV110312)out.guideSourceTextV110312=String(value.guideSourceTextV110312).slice(0,16000);\n  if(Array.isArray(value.guideRisksV110312))out.guideRisksV110312=value.guideRisksV110312;\n  if(Array.isArray(value.transactions))");
patch(business,"appointment:String(stop?.appointment || '').slice(0, 160), poNumber:String(stop?.poNumber || '').slice(0, 80),", "appointment:String(stop?.appointment || '').slice(0, 160), poNumber:String(stop?.poNumber || '').slice(0, 80),\n        bolNumber:String(stop?.bolNumber||stop?.bolNo||'').slice(0,80),pickupNumber:String(stop?.pickupNumber||'').slice(0,80),");

const VERSION='110.3.18',BUILD='v110318-smart-scan-load-recovery';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.18 Smart Scan load recovery',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Saved Rate Cons open their load even when appointments need review.','Saved scans resume their existing extraction and chosen folder.','BOL matching uses unique shipping references and preserves multiple PO numbers.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.17');assert.equal(meta.build,'v110317-wizard-midnight-coverage');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — Smart Scan 110.3.18: saved result recovery and shipping-reference matching');
