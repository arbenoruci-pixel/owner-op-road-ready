import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceExact(source,before,after,label){
  if(source.includes(after)) return source;
  assert.ok(source.includes(before),`110.2.7 editor anchor missing: ${label}`);
  return source.replace(before,after);
}

{
  const path='app/layout.jsx';
  let source=fs.readFileSync(path,'utf8');
  const anchor="import '../source/src/modules/editor/compact-editor-v111.css';";
  const added="import '../source/src/modules/editor/modern-editor-v11027.css';";
  if(!source.includes(added)){
    assert.ok(source.includes(anchor),'modern editor stylesheet anchor missing');
    source=source.replace(anchor,`${anchor}\n${added}`);
  }
  fs.writeFileSync(path,source);
}

for(const path of ['source/src/modules/editor/EditEventSheet.jsx','source/src/modules/editor/InsertEditEventSheet.jsx']){
  let source=fs.readFileSync(path,'utf8');
  source=source.replace('editor-compact-v111"','editor-compact-v111 editor-modern-v11027"');
  fs.writeFileSync(path,source);
}

{
  const path='source/src/modules/editor/EditEventSheet.jsx';
  let source=fs.readFileSync(path,'utf8');
  const before=`        {!liveV110 && <p className={\`editor-help-v110 motive-override-help-v11023 \${previewResultV11023?.ok===false?'blocked':''}\`}>{previewResultV11023?.ok===false ? previewResultV11023.error : 'This range replaces overlapping manual duty time. Save keeps the original in edit history.'}</p>}`;
  const after=`        {!liveV110 && previewResultV11023?.ok===false && <p role="alert" className="editor-help-v110 motive-override-help-v11023 blocked">{previewResultV11023.error}</p>}`;
  source=replaceExact(source,before,after,'normal override helper');
  source=source.replace("{gpsPending ? 'Locking GPS…' : liveV110 ? 'Save details' : 'Save'}","{gpsPending ? 'Locking GPS…' : liveV110 ? 'Save details' : 'Save changes'}");
  fs.writeFileSync(path,source);
}

// Final small overrides keep the visible target Motive-like while preserving
// the tested Cancel control as a subtle secondary action.
{
  const path='source/src/modules/editor/modern-editor-v11027.css';
  let source=fs.readFileSync(path,'utf8');
  if(!source.includes('MODERN_INSERT_ACTIVITY_HEADING_V11027')) source += `
/* MODERN_INSERT_ACTIVITY_HEADING_V11027 */
.editor-ui-v110.editor-modern-v11027 .quick-activities-v11023>.insert-section-title{display:none!important}
`;
  if(!source.includes('MODERN_MOTIVE_FINAL_V11027')) source += `
/* MODERN_MOTIVE_FINAL_V11027 */
.editor-ui-v110.editor-modern-v11027 .graph-handle-large-v110{height:44px!important;min-height:44px!important}
.editor-ui-v110.editor-modern-v11027 .compact-editor-footer-v111{display:grid!important;grid-template-columns:72px minmax(0,1fr)!important;gap:10px!important;align-items:center!important}
.editor-ui-v110.editor-modern-v11027 .compact-editor-footer-v111 .cancel-main{display:block!important;grid-column:1!important;width:72px!important;height:44px!important;min-height:44px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;color:#6a7077!important;-webkit-text-fill-color:#6a7077!important;font-size:13px!important;font-weight:500!important;box-shadow:none!important}
.editor-ui-v110.editor-modern-v11027 .compact-editor-footer-v111 .edit-sticky-save{grid-column:2!important;width:100%!important}
`;
  fs.writeFileSync(path,source);
}

const VERSION='110.2.7',BUILD='v110207-fast-edit';
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Fast Logbook editor',notes:['Graph-first editor with Motive-style Start/End flags and 44px touch targets.','Start Time and End Time use two direct cards; one-minute fine tuning stays secondary.','Duty status, multi-select activities, location and always-visible notes use a cleaner phone-first hierarchy while protected override, HOS and certification behavior remain unchanged.']});
  fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(path,'utf8');
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let source=fs.readFileSync(path,'utf8');
  source=source.replace(/App v110\.2\.6/g,`App v${VERSION}`).replace(/APP V110\.2\.6/g,`APP V${VERSION}`);
  fs.writeFileSync(path,source);
}
console.log('PASS — 110.2.7 Motive-style fast editor finalized after materialization');
