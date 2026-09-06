// Preserve the existing explicit inspection workflow without invoking legacy
// timeline repair or touching other days during an exact editor command.
import fs from 'node:fs';
const path='source/src/app/App.jsx';
let code=fs.readFileSync(path,'utf8');
function once(before,after){if(code.includes(after))return;if(code.split(before).length!==2)throw new Error('Editor inspection contract anchor changed');code=code.replace(before,after);}
once("      try { applyEditorPatch(state.eventsByDay[day], id, patch, { liveId:liveEventId(state, day) }); }\n      catch (error) { window.alert(error.message); return false; }",`      let inspectionPreview;
      try { inspectionPreview = applyEditorPatch(state.eventsByDay[day], id, patch, { liveId:liveEventId(state, day) }).find(e => e.id === id); }
      catch (error) { window.alert(error.message); return false; }
      const inspectionFieldsChanged = ['status','startMin','endMin','city','state','description','note','reasons'].some(key => Object.hasOwn(patch, key));
      const touchesInspection = inspectionFieldsChanged && (isPreTripStatus(before.status, inspectionActivityText(before)) || isPreTripStatus(inspectionPreview.status, inspectionActivityText(inspectionPreview)) || state.inspectionByDay?.[day]?.sourceEventId === id);
      const acceptedEditorInspection = touchesInspection ? maybeAcceptInspectionForEvent(state, day, inspectionPreview) : false;`);
once("        return markDayRecert({ ...s, eventsByDay, sheet:null, selectedEventId:null }, day);",`        let next = { ...s, eventsByDay, sheet:null, selectedEventId:null };
        if (touchesInspection) {
          next = withAcceptedPreTripInspection(next, day, rows.find(e => e.id === id), acceptedEditorInspection);
          next = reconcilePreTripInspections(next, [day]);
        }
        return markDayRecert(next, day);`);
fs.writeFileSync(path,code);
console.log('PASS — explicit editor preserves day-scoped inspection consent and linkage');
