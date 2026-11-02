import fs from 'node:fs';
import assert from 'node:assert/strict';
const edits = new Map();
const read = file => edits.get(file) ?? fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length, 2, 'Personal conveyance anchor changed: '+file+' '+before.slice(0,70));
  edits.set(file, source.replace(before, () => after));
}
const helper = '../../shared/duty/personalConveyance.js';
const editor = 'source/src/modules/editor/EditEventSheet.jsx';
patch(editor, "import React, {", `import {PC_MODE, PC_REASON, PC_GUIDANCE, choosePersonalConveyance} from '${helper}';\nimport React, {`);
patch(editor, '    status:event.status,', "    status:event.status,\n    specialMode:event.specialMode || 'none',");
patch(editor, '  const [status, setStatus] = useState(initialForm.status);', '  const [status, setStatus] = useState(initialForm.status);\n  const [specialMode, setSpecialMode] = useState(initialForm.specialMode);');
patch(editor, '    setStatus(next.status);', '    setStatus(next.status);\n    setSpecialMode(next.specialMode);');
patch(editor, '  const dirty = status !== initialForm.status ||', '  const dirty = specialMode !== initialForm.specialMode || status !== initialForm.status ||');
patch(editor, '    setStatus(nextStatus);', "    setStatus(nextStatus);\n    if (nextStatus !== status) setSpecialMode('none');");
patch(editor, '  function save() {', `  function togglePersonalConveyance() {
    const next = choosePersonalConveyance({note,reasons:selectedOnReasons}, specialMode !== PC_MODE);
    setSpecialMode(next.specialMode); setNote(next.note); setSelectedOnReasons(next.reasons);
  }

  function save() {`);
patch(editor, "    put('status',status,initialForm.status);", "    put('status',status,initialForm.status);\n    put('specialMode',specialMode,initialForm.specialMode);");
patch(editor, "put('reasons',status === 'ON' ? selectedOnReasons : [],initialRawV110.reasons);", "put('reasons',status === 'ON' || status === 'OFF' ? selectedOnReasons : [],initialRawV110.reasons);");
patch(editor, "activities={status==='ON'?activitiesForRecordedEvent(initialRawV110,logbookContext.equipment?.type==='intermodal'):[]}", "activities={status==='ON'?activitiesForRecordedEvent(initialRawV110,logbookContext.equipment?.type==='intermodal'):status==='OFF'?[PC_REASON]:[]}");
patch(editor, "selected={status==='ON'?selectedOnReasons:[]} onActivityChange={toggleOnDutyReason}", "selected={status==='ON'?selectedOnReasons:status==='OFF'&&specialMode===PC_MODE?[PC_REASON]:[]} onActivityChange={status==='OFF'?togglePersonalConveyance:toggleOnDutyReason}");
patch(editor, 'notes={<EditorNotesField note={note} onNoteChange={setNote}/>}', 'notes={<>{status===\'OFF\'&&specialMode===PC_MODE?<p>{PC_GUIDANCE}</p>:null}<EditorNotesField note={note} onNoteChange={setNote}/></>}');

const core = 'source/src/modules/logbook/eventEditingV110.js';
patch(core, "import {syncEditedPickupReferences}", `import {specialModeEdit} from '${helper}';\nimport {syncEditedPickupReferences}`);
patch(core, "const EDIT_FIELDS=new Set(['status',", "const EDIT_FIELDS=new Set(['specialMode','status',");
patch(core, "  const changes={};\n  for(const [key,value] of Object.entries(patch))", "  const modeEdit=specialModeEdit(before,patch);if(!modeEdit.ok)return modeEdit;\n  patch=modeEdit.patch;\n  const changes={};\n  for(const [key,value] of Object.entries(patch))");
patch(core, "  if(!event?.id||rows.some(e=>e?.id===event.id))", "  const modeEdit=specialModeEdit({},event);if(!modeEdit.ok)return modeEdit;\n  if(!event?.id||rows.some(e=>e?.id===event.id))");

const insert = 'source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert, "import React, {", `import {activitySpecialMode} from '${helper}';\nimport React, {`);
patch(insert, '      status: form.status,\n      startMin: s,', '      status: form.status,\n      specialMode: activitySpecialMode(form.status, selectedReasons),\n      startMin: s,');

// Current-status flow already exposes the PC activity. Keep category assignment
// consistent and constrain it to OFF rather than matching arbitrary reason text.
const app='source/src/app/App.jsx';
patch(app, "import React", "import {activitySpecialMode} from '../shared/duty/personalConveyance.js';\nimport React");
patch(app, "specialMode:/yard move/i.test(reason) ? 'yard_move' : (/personal conveyance/i.test(reason) ? 'personal_conveyance' : 'none'),", "specialMode:activitySpecialMode(status,reasons),");
// Validate every anchor before writing any runtime file.
fs.copyFileSync('scripts/personal-conveyance/mode.js','source/src/shared/duty/personalConveyance.js');
for(const [file,text] of edits) fs.writeFileSync(file,text);
console.log('PASS — explicit personal conveyance editor, insert and live status installed');
