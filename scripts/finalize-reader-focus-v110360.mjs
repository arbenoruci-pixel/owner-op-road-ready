import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.60',BUILD='v110360-focused-source-review';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Reader focus anchor: ${path}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const scan='source/src/modules/scan/',preview=scan+'OwnedReaderPreview.jsx';
fs.copyFileSync('scripts/owned-reader/SourceFocus.jsx',scan+'OwnedReaderSourceFocusV110360.jsx');
patch(preview,"import {reviewScanAnalysis} from './ownedReaderAdapter.js';","import {reviewScanAnalysis} from './ownedReaderAdapter.js';\nimport SourceImage from './OwnedReaderSourceFocusV110360.jsx';");
const original=read('scripts/owned-reader/ReaderPreview.jsx');
patch(preview,original.slice(original.indexOf('function SourceImage('),original.indexOf('function sourcePages(')),'// SourceImage uses the focused, exact-source viewer.\n\n');
patch(preview,'<SourceImage file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence}/>',
  '<SourceImage key={[selection.groupId,selection.key,selection.evidence.sourceImageId,selection.evidence.observationId,selection.evidence.lineId].join(\':\')} file={sources[selection.evidence.sourceImageId]} evidence={selection.evidence} continuations={selection.candidate?.continuationEvidence||[]}/>');
patch(preview,"<b>{field.label}</b><span>{field.status==='confirmed'?'Confirmed':field.status==='supported'?'Source found':field.status==='missing'?'Missing':'Check reading'}</span>",
  "<b>{field.label}</b>{field.status==='needs_review'?<button type=\"button\" className=\"owned-reader-check-source\" aria-label={`Check ${field.label} source`} onClick={()=>openItem({groupId:group.id,key})}>Check reading · View source</button>:<span>{field.status==='confirmed'?'Confirmed':field.status==='supported'?'Source found':'Missing'}</span>}");
patch(preview,'<button type="button" disabled={busy||!selection.evidence||!draft.trim()} onClick={()=>confirm(true)}>',
  '<button type="button" className="owned-reader-confirm-primary" disabled={busy||!selection.evidence||!draft.trim()} onClick={()=>confirm(true)}>');
const cssPath='source/src/command-center.css',css=read('scripts/owned-reader/sourceFocus.css'),existing=read(cssPath);
const cssBlock=/\/\* OWNED_READER_FOCUS_V110360 \*\/[\s\S]*?\/\* END_OWNED_READER_FOCUS_V110360 \*\//;
fs.writeFileSync(cssPath,cssBlock.test(existing)?existing.replace(cssBlock,css.trim()):existing+'\n'+css);
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.60 Focused source review',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Tap an uncertain field to zoom directly to its highlighted source.','Inspect related company rows together, adjust zoom and return to the full source image.','Keep edits, original images and conservative conflict handling intact until confirmation.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;
  if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,'Unique release marker '+path+' '+key);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.59');assert.equal(meta.build,'v110359-clear-party-sources');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs',"assert.equal(meta.version,'110.3.59'); assert.equal(meta.build,'v110359-clear-party-sources');",`assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.60 focused source review installed');
