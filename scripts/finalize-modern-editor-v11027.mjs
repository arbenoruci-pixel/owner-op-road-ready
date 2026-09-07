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

// Motive interaction: selecting a graph/list event reveals Edit; selection is
// read-only and opening the editor remains an explicit second action.
{
  const path='source/src/modules/logbook/EventList.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`            onClick={() => continuityOnly ? undefined : (selectMode ? onToggleSelected(event.id) : onOpenEdit(event.id))}`,
`            onClick={() => continuityOnly ? undefined : (selectMode ? onToggleSelected(event.id) : onSelect?.(event.id))}`,
'event tap selects before edit');
  source=replaceExact(source,
`            ) : (
              <button className="blue-edit" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
            )}`,
`            ) : selected ? (
              <button className="blue-edit motive-edit-reveal-v11027" aria-label="Edit selected event" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
            ) : (
              <span className="event-edit-placeholder-v11027" aria-hidden="true" />
            )}`,
'Edit reveal action');
  fs.writeFileSync(path,source);
}
{
  const path='source/src/modules/logbook/DayLogScreen.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`    onSelect?.(eventId);
    window.setTimeout(() => onOpenEdit?.(eventId), 0);
  }

  const tz = homeTerminalConfigFromState(state);`,
`    onSelect?.(eventId);
  }

  const tz = homeTerminalConfigFromState(state);`,
'graph tap selects before edit');
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
  if(!source.includes('MOTIVE_EDIT_REVEAL_V11027')) source += `
/* MOTIVE_EDIT_REVEAL_V11027 */
.events.clean-events .event-row.clean-event-row{position:relative!important;overflow:hidden!important;transition:background .16s ease,padding .16s ease!important}
.events.clean-events .event-row.clean-event-row:not(.selectable):not(.continuity-only-v11026){grid-template-columns:34px minmax(0,1fr) 0!important}
.events.clean-events .event-row.clean-event-row.selected:not(.selectable):not(.continuity-only-v11026){padding-left:88px!important;background:#eaf4ff!important;box-shadow:none!important}
.events.clean-events .event-row.clean-event-row.selected:not(.selectable):not(.continuity-only-v11026)::after{content:'';position:absolute;left:78px;top:0;bottom:0;width:1px;background:#c7def8}
.events.clean-events .motive-edit-reveal-v11027{position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:78px!important;height:auto!important;min-height:100%!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#087cf0!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:15px!important;font-weight:750!important;box-shadow:none!important;z-index:2!important}
.events.clean-events .motive-edit-reveal-v11027:active{background:#006bd6!important}
.events.clean-events .event-edit-placeholder-v11027{display:block!important;width:0!important;height:0!important;overflow:hidden!important}
`;
  fs.writeFileSync(path,source);
}

const VERSION='110.2.7',BUILD='v110207-fast-edit';
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Fast Logbook editor',notes:['Tap a graph or list event to select it; a clear blue Edit action appears before the editor opens.','Graph-first editor uses Motive-style Start/End flags with 44px touch targets and two direct Start/End cards.','Duty status, multi-select activities, location and always-visible notes use a cleaner phone-first hierarchy while protected override, HOS and certification behavior remain unchanged.']});
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
