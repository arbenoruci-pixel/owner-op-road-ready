import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceExact(source,before,after,label){
  if(source.includes(after)) return source;
  assert.ok(source.includes(before),`110.2.7 editor anchor missing: ${label}`);
  return source.replace(before,after);
}

// Import the scoped modern layer after every legacy/editor stylesheet.
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

// The final materialized sheets get one extra class. Runtime data/edit contracts
// remain unchanged; the redesign is a presentation and interaction-density layer.
for(const path of ['source/src/modules/editor/EditEventSheet.jsx','source/src/modules/editor/InsertEditEventSheet.jsx']){
  let source=fs.readFileSync(path,'utf8');
  source=source.replace('editor-compact-v111"','editor-compact-v111 editor-modern-v11027"');
  fs.writeFileSync(path,source);
}

// Keep only blocking override feedback in the normal edit flow. The successful
// replacement behavior is visible directly in the graph preview.
{
  const path='source/src/modules/editor/EditEventSheet.jsx';
  let source=fs.readFileSync(path,'utf8');
  const before=`        {!liveV110 && <p className={\`editor-help-v110 motive-override-help-v11023 \${previewResultV11023?.ok===false?'blocked':''}\`}>{previewResultV11023?.ok===false ? previewResultV11023.error : 'This range replaces overlapping manual duty time. Save keeps the original in edit history.'}</p>}`;
  const after=`        {!liveV110 && previewResultV11023?.ok===false && <p role="alert" className="editor-help-v110 motive-override-help-v11023 blocked">{previewResultV11023.error}</p>}`;
  source=replaceExact(source,before,after,'normal override helper');
  source=source.replace("{gpsPending ? 'Locking GPS…' : liveV110 ? 'Save details' : 'Save'}","{gpsPending ? 'Locking GPS…' : liveV110 ? 'Save details' : 'Save changes'}");
  fs.writeFileSync(path,source);
}

// Release identity. Worker behavior is unchanged and no forced refresh is used.
const VERSION='110.2.7',BUILD='v110207-fast-edit';
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Fast Logbook editor',notes:['Graph-first editor with lighter 44px Start/End handles.','Start, Duration and End share one compact strip; fine-tuning remains available on demand.','Duty status, multi-select activities, location and notes use a cleaner phone-first hierarchy while protected override, HOS and certification behavior remain unchanged.']});
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
console.log('PASS — 110.2.7 graph-first fast editor finalized after materialization');
