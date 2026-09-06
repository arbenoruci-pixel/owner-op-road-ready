import fs from 'node:fs';
function replaceOnce(text,from,to) { if(text.split(from).length!==2)throw Error('Editor final contract anchor changed: '+from.slice(0,100));return text.replace(from,to); }
const appPath='source/src/app/App.jsx';
let app=fs.readFileSync(appPath,'utf8');
if(!app.includes('EDITOR_INSPECTION_INTENT_V110')) {
  app=replaceOnce(app,`      setState(current => {
        const result = applyLogbookEditorEdit(current,command);
        if (!result.ok || !result.changed) return current;
        return markDayRecert(result.state,command.day);
      });`, `      // EDITOR_INSPECTION_INTENT_V110: retain the explicit pre-trip confirmation.
      const editedPreview = checked.state?.eventsByDay?.[command.day]?.find(event => event.id === id);
      const activityChanged = ['status','note','reasons'].some(key => Object.hasOwn(command.patch,key));
      const acceptedInspection = checked.changed && activityChanged
        ? maybeAcceptInspectionForEvent(state,command.day,editedPreview) : false;
      setState(current => {
        const result = applyLogbookEditorEdit(current,command);
        if (!result.ok || !result.changed) return current;
        const edited = result.state.eventsByDay[command.day].find(event => event.id === id);
        let next = withAcceptedPreTripInspection(result.state,command.day,edited,acceptedInspection);
        const linked = current.inspectionByDay?.[command.day]?.sourceEventId === id;
        if (linked && ['status','startMin','endMin','city','state'].some(key => Object.hasOwn(command.patch,key))) {
          next = reconcilePreTripInspections(next,[command.day]);
        }
        return markDayRecert(next,command.day);
      });`);
  fs.writeFileSync(appPath,app);
}
const editPath='source/src/modules/editor/EditEventSheet.jsx';
let edit=fs.readFileSync(editPath,'utf8');
edit=edit.replaceAll('timeLabel(preview.startMin, true)','timeLabel(preview.startMin)').replaceAll('timeLabel(preview.endMin, true)','timeLabel(preview.endMin)');
fs.writeFileSync(editPath,edit);
const cssPath='source/src/logbook-editor-v110.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('EDITOR_ACCESSIBLE_PICKED_V110'))css+=`
/* EDITOR_ACCESSIBLE_PICKED_V110 */
.editor-ui-v110 .reason-pills button, .editor-ui-v110 .reason-pills button *, .editor-ui-v110 .insert-reason-grid button, .editor-ui-v110 .insert-reason-grid button * { color:inherit !important; -webkit-text-fill-color:currentColor !important; }
.editor-ui-v110 .reason-pills button.picked { color:#075643 !important; -webkit-text-fill-color:#075643 !important; }
.editor-ui-v110 .midnight-end-v110 { padding:0 !important; min-height:24px !important; }
.editor-ui-v110 .midnight-end-v110 input { margin:0 !important; min-height:18px !important; max-height:18px !important; padding:0 !important; }
`;
fs.writeFileSync(cssPath,css);
// Blurring an unchanged location is read-only. Calling the manual-location
// callback would otherwise erase GPS coordinates before a note-only save.
const locationPath='source/src/modules/editor/components/EditorLocationFields.jsx';
let location=fs.readFileSync(locationPath,'utf8');
const guard='    if (parsed.city !== city || parsed.state !== state) onLocationChange(parsed.city, parsed.state);';
if(!location.includes(guard))location=replaceOnce(location,'    onLocationChange(parsed.city, parsed.state);',guard);
fs.writeFileSync(locationPath,location);
// Follow-up release on top of the concurrently published, reviewed 110.2.0.
const VERSION='110.2.1',BUILD='v110201-logbook-followup';
for(const p of ['release-version.json','public/app-version.json']){
 const meta=JSON.parse(fs.readFileSync(p,'utf8'));
 fs.writeFileSync(p,JSON.stringify({...meta,version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null},null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let s=fs.readFileSync(p,'utf8');
 s=s.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
 fs.writeFileSync(p,s);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/App v110\.2\.0/g,'App v'+VERSION).replace(/APP V110\.2\.0/g,'APP V'+VERSION));
console.log('Final editor: explicit inspection acceptance, readable activity text and unchanged-location GPS preservation; '+VERSION);
