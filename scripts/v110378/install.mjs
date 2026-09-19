import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s),hash=s=>createHash('sha256').update(s).digest('hex');
function patch(path,before,after,count=1){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length-1,count,`110378 anchor ${path}: ${before.slice(0,95)}`);write(path,s.replaceAll(before,after));}
function replaceBetween(path,start,end,replacement){const s=read(path);if(s.includes(replacement))return;assert.equal(s.split(start).length-1,1,'start '+start);const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(b>a,'end '+end);write(path,s.slice(0,a)+replacement+s.slice(b));}
const layout='app/layout.jsx';
if(!read(layout).includes('shared/duty/dutyFieldsV110378.css'))patch(layout,"export const metadata =", "import '../source/src/shared/duty/dutyFieldsV110378.css';\n\nexport const metadata =");
const day='source/src/modules/logbook/DayLogScreen.jsx';
const locks=JSON.parse(read('module-locks.v1.json'));
assert.equal(hash(read(day)),locks.files[day],'DayLog protected starting point');

// Guard both the new and the persisted guide-to-pickup associations. Selecting
// another guide never authorizes rewriting an actual pickup's primary identity.
const integrity='source/src/core/integrity/logbookIntegrityV107.js';
patch(integrity,"const TERMINAL_ROUTE_STATUS =", "import {guideOwnsRecordedPickup,isRoutePlaceHeading} from '../routes/shipmentIdentityV110378.js';\nconst TERMINAL_ROUTE_STATUS =");
patch(integrity,"const sourceEventId = text(state.loadInfo?.guideId) === text(guide.id) && sourceEventCandidateV1034 && /pickup|loading/i.test(eventText(sourceEventCandidateV1034)) ? sourceEventCandidateIdV1034 : '';", "const sourceEventId = text(state.loadInfo?.guideId) === text(guide.id) && guideOwnsRecordedPickup(sourceEventCandidateV1034,guide) ? sourceEventCandidateIdV1034 : '';");
patch(integrity,"const validOldPickupEventIdV1034 = oldPickupEventV1034 && /pickup|loading/i.test(eventText(oldPickupEventV1034)) ? oldPickupEventIdV1034 : '';", "const validOldPickupEventIdV1034 = guideOwnsRecordedPickup(oldPickupEventV1034,guide) ? oldPickupEventIdV1034 : '';");
patch(integrity,"      source:'rate_confirmation_guide_v107',\n      pickedUpLoadNo", "      source:'rate_confirmation_guide_v107',\n      ...(isRoutePlaceHeading(previous?.city)||isRoutePlaceHeading(stop.city)?{reviewStatus:'needs_review',excludedFromActiveLoad:true,routeReviewReason:'A document heading was parsed as a city. Confirm the actual stop.'}:{}),\n      pickedUpLoadNo");
replaceBetween(integrity,"  if (sourceEvent && sourceEvent.status === 'ON' && /pickup|loading/i.test(eventText(sourceEvent))) {", "  changes.push({ code:'align_active_load_with_driver_guide'", `  // Recorded pickup metadata belongs to the driver's event. This function
  // updates planning/cache data only; it never rewrites that event from a guide.
  if(sourceEvent&&!guideOwnsRecordedPickup(sourceEvent,guide)){
    state.loadInfo={...state.loadInfo,sourceEventId:'',sourceEventDay:'',
      associationReview:{reason:'guide_pickup_identity_conflict',guideId:guide.id,recordedEventId:sourceEventId}};
  }
`);

patch(integrity,"        const duplicatePickup = firstPickupEventId && leg?.pickupEventId === firstPickupEventId && (ref(leg?.loadNo || leg?.shippingDocs) === guideLoad || /^pickup_event$/i.test(text(leg?.source)));", "        const duplicatePickup = false; // recorded/manual route evidence is never deleted by a document guide");
const routeView='source/src/core/routes/routeNormalization.js';
patch(routeView,"    .filter(leg => !leg.logbookExcludedDaysV110352?.includes(day))","    .filter(leg => !leg.logbookExcludedDaysV110352?.includes(day))\n    .filter(leg => !(leg.reviewStatus==='needs_review' && leg.excludedFromActiveLoad===true && /^rate_confirmation_guide/.test(String(leg.source||''))))",2);
const app='source/src/app/App.jsx';
patch(app,"'use client';", "'use client';\nimport {matchingManualPickupPlan,confirmShipmentIdentity} from '../core/routes/shipmentIdentityV110378.js';");
patch(app,"      const existing = routeLegArray(routeLegsByDay).find(leg => leg.pickupEventId === eventId || leg.id === `leg_${eventId}`) || null;", "      const existing = routeLegArray(routeLegsByDay).find(leg => leg.pickupEventId === eventId || leg.id === `leg_${eventId}`) || matchingManualPickupPlan(routeLegsByDay,day,{shippingDocs,fromCity:origin.city,fromState:origin.state,toCity:destination.city,toState:destination.state});");
patch(app,"  function closeLastAndAddStatus({ status, reason, city,", "  function closeLastAndAddStatus({ status, reason, reasons = [], city,");
patch(app,"        note,\n        shippingDocs:", "        note,\n        reasons:status==='ON'?(Array.isArray(reasons)?[...reasons]:[]):[],\n        shippingDocs:");
patch(app,"currentStatus: liveCurrent.status, currentReason: liveCurrent.reason, currentLocation: liveCurrent.location","currentStatus:state.currentStatus || 'OFF', currentReason:state.currentReason || '', currentLocation:state.currentLocation");
patch(app,"  function saveLoadInfo(payload = {}) {\n    setState(s => {", `  function saveLoadInfo(payload = {}) {
    setState(s => {
      if(payload.confirmShipmentIdentity){
        try{return reconcileCertificationStatusesV1032(confirmShipmentIdentity(s,payload.confirmShipmentIdentity));}
        catch(error){if(typeof window!=='undefined')setTimeout(()=>window.alert(error.message),0);return s;}
      }`);
patch(day,"import React,", "import ShipmentReviewV110378 from '../../shared/duty/ShipmentReviewV110378.jsx';\nimport {shipmentIdentityConflicts} from '../../core/routes/shipmentIdentityV110378.js';\nimport React,");
patch(day,"function MiniFormPanel({ state, events, onSaveLoad, onOpenTrailer, onSaveDayDistance }) {\n  const form", "function MiniFormPanel({ state, events, onSaveLoad, onOpenTrailer, onSaveDayDistance }) {\n  const conflictIds=new Set(shipmentIdentityConflicts(state,state.activeDay).flatMap(x=>x.affectedRouteIds));\n  const form");
patch(day,"      <FormSectionTitle>ROUTE / SHIPPING</FormSectionTitle>", "      <FormSectionTitle>ROUTE / SHIPPING</FormSectionTitle>\n      <ShipmentReviewV110378 state={state} onConfirm={request=>onSaveLoad?.({confirmShipmentIdentity:request})}/>");
patch(day,"              <span>{legMeta(leg, state.activeDay, state)}</span>", "              <span className={conflictIds.has(leg.id)?'rr-shipment-conflict':''}>{conflictIds.has(leg.id)?'Conflicting pickup details · review required':leg.completionKind==='trailer_handoff'?'Trailer handed off · confirmed':legMeta(leg, state.activeDay, state)}</span>");

// Live status: same fields and activity vocabulary as the recorded-event editor.
const status='source/src/modules/status/StatusWorkflowSheet.jsx';
patch(status,"import React, { useEffect, useRef, useState } from 'react';", "import React, { useEffect, useRef, useState } from 'react';\nimport {DutyStatusField,DutyActivityField,DutyLocationField,DutyNoteField} from '../../shared/duty/DutyFieldsV110378.jsx';\nimport {dutyActivities,realEquipment,isPlaceHeading} from '../../shared/duty/dutyModelV110378.js';");
replaceBetween(status,'function reasonList(status, intermodalMode = false) {','\nfunction actionHeading',`function reasonList(status, intermodalMode = false) { return dutyActivities(status,intermodalMode); }
`);
patch(status,"      droppedTrailer: dropTrailer.trim().toUpperCase(),\n      hookedTrailer: hookTrailer.trim().toUpperCase(),", "      droppedTrailer:reasonNeedsDropTrailer(status,selectedReasons)?realEquipment(dropTrailer):'',\n      hookedTrailer:reasonNeedsHookTrailer(status,selectedReasons)?realEquipment(hookTrailer):'',");

patch(status,"  function applyLocationText(value = locationText) {\n    manualLocationDirty.current", "  function applyLocationText(value = locationText) {\n    if(value===locationString(city,st))return {city,state:st};\n    manualLocationDirty.current");
patch(status,"    .filter(Boolean)\n    .filter(v =>", "    .filter(Boolean)\n    .filter(v => !isPlaceHeading(v.split(',')[0]))\n    .filter(v =>");
patch(status,'className="status-page status-driver-picker-v934"','className="status-page status-driver-picker-v934 rr-duty-workspace"');
replaceBetween(status,'        <section className="picker-section picker-section-tight">','\n        {state.preTripDriveBlock',`        <DutyStatusField status={status} onChange={choose}/>
`);
replaceBetween(status,'        <section className="picker-section">\n          <div className="picker-label-row">\n            <label>{actionHeading(status)}</label>', '        <section className="picker-section start-time-section">', `        <DutyActivityField status={status} intermodal={intermodalMode} selected={selectedReasons} onToggle={toggleReason}/>

`);
replaceBetween(status,'        <section className="picker-section">\n          <div className="picker-label-row">\n            <label>{leavingDriving', '        <section className="picker-section note-section">', `        <DutyLocationField value={locationText} label={leavingDriving?'Stop location':'Location'}
          onChange={value=>{manualLocationDirty.current=true;gpsRequestId.current+=1;setGpsPending(false);setLocationText(value);setGpsFix(null);setGpsStatus('Manual location');}}
          onBlur={()=>applyLocationText()} onGps={()=>useGps(false,leavingDriving?'driving-exit':'status')}
          onClear={()=>{manualLocationDirty.current=true;gpsRequestId.current+=1;setGpsPending(false);setCity('');setSt('');setLocationText('');setGpsFix(null);setGpsStatus('Location cleared');}}
          gpsStatus={gpsStatus} suggestions={locationSuggestions} onSuggestion={chooseLocationSuggestion}/>

`);
replaceBetween(status,'        <section className="picker-section note-section">','        <button\n          className="status-save',`        <DutyNoteField label="Note" id="status-note-v110378" value={notes} onChange={setNotes}/>

`);

// Editor wrappers share the rendered fields with live status while retaining all
// original graph/time/validation/expected-row/save controllers.
const duty='source/src/modules/editor/components/EditorDutyStatusControls.jsx';
write(duty,`import React from 'react';
import {DutyStatusField} from '../../../shared/duty/DutyFieldsV110378.jsx';
export const DUTY_SHORT_LABELS={OFF:'Off Duty',SB:'Sleeper',D:'Driving',ON:'On Duty'};
export default function EditorDutyStatusControls({status,onChange}){return <div className="editor-duty-top"><DutyStatusField status={status} onChange={onChange}/></div>;}
`);
const location='source/src/modules/editor/components/EditorLocationFields.jsx';
patch(location,"import React, { useEffect, useState } from 'react';", "import React, { useEffect, useState } from 'react';\nimport {DutyLocationField} from '../../../shared/duty/DutyFieldsV110378.jsx';");
patch(location,"  collapsedDescription = false,", "  collapsedDescription = false,\n  historical = false,");
replaceBetween(location,'      <div className="form-label">Location</div>','      {showDescription ? (',`      <DutyLocationField value={draft} onChange={value=>{setDraft(value);onLocationDraftChange?.(value);}}
        onBlur={()=>commitLocation()} onGps={onGps} onClear={clearLocation}
        gpsStatus={draft&&!parseLocationText(draft,'').state?'Add state, example: Gary, IN':gpsStatus}
        suggestions={suggestions} onSuggestion={commitLocation} historical={historical}/>

`);
const edit='source/src/modules/editor/EditEventSheet.jsx';
patch(edit,"import { getAccurateGpsLocation }", "import {DutyActivityField} from '../../shared/duty/DutyFieldsV110378.jsx';\nimport {parseDutyActivities,eventActivities,dutyActivities} from '../../shared/duty/dutyModelV110378.js';\nimport {isIntermodalModeActive} from '../status/equipmentMode.js';\nimport { getAccurateGpsLocation }");
patch(edit,"if (/pickup|pick up|loading/i.test(text)) return 'pickup';","if (/\\b(?:pickup|pick up|loading)\\b/i.test(text)) return 'pickup';");
replaceBetween(edit,'function parseOnDutyNote(value = \'\') {','\nfunction composeOnDutyNote',"function parseOnDutyNote(value = '') { return parseDutyActivities(value); }\n");
replaceBetween(edit,'function selectedReasonsFromForm(form = {}) {','\nexport default function EditEventSheet',"function selectedReasonsFromForm(form = {}) { return eventActivities(form); }\n");
patch(edit,"  const activityKind = loadActivityKind(status, note, description);", "  const intermodalModeV110378=Boolean(event.container||event.chassis||event.droppedContainer||event.droppedChassis)||isIntermodalModeActive(logbookContext);\n  const activityKind = loadActivityKind(status, note, description);");
patch(edit,"  async function applyGps() {\n    if (typeof navigator", "  async function applyGps() {\n    if(dayV110!==clockV110.day&&!window.confirm('Use your CURRENT location for this recorded event? Its saved location stays unchanged unless you confirm.'))return;\n    if (typeof navigator");
patch(edit,"      setLocationSource('gps');", "      setLocationSource(fix.source || 'gps');");
patch(edit,'className="sheet active editor-clean-v85 editor-ui-v110 editor-compact-v111 editor-modern-v11027"','className="sheet active editor-clean-v85 editor-ui-v110 editor-compact-v111 editor-modern-v11027 rr-duty-workspace"');
patch(edit,'<div>Edit Duty Status</div>', '<div>Edit Duty Status</div>');
patch(edit,'      <div className="form editor-form-v85">', `      <div className="form editor-form-v85">
      <p className="rr-duty-context">Recorded event · {dayV110} · {clockV110.timeZone}. Saving edits this event; it does not start a new status now.</p>`);
replaceBetween(edit,"        {status === 'ON' && (\n          <section className=\"form-section editor-on-duty-reasons\"",'        <EditorLocationFields', `        {status==='ON'?<DutyActivityField status={status} intermodal={intermodalModeV110378} selected={selectedOnReasons} onToggle={toggleOnDutyReason} editor>
          {selectedOnReasons.includes('Pre-trip inspection')?<p className="rr-duty-help">Inspection remains linked to the recorded ON DUTY event.</p>:null}
        </DutyActivityField>:null}
        {(event.hookedTrailer||event.droppedTrailer)?<div className="rr-duty-recorded-equipment">Recorded equipment: {event.hookedTrailer?'Hooked trailer '+event.hookedTrailer:''}{event.hookedTrailer&&event.droppedTrailer?' · ':''}{event.droppedTrailer?'Dropped trailer '+event.droppedTrailer:''}</div>:null}

`);
patch(edit,'          collapsedDescription\n        />','          collapsedDescription historical={dayV110!==clockV110.day}\n        />');
// Do not conflate distinct BOL/load identifiers when only the destination changes.
patch(edit,'      patch.shippingDocs = shippingDocs.trim(); patch.loadNo = shippingDocs.trim(); patch.bol = shippingDocs.trim();', "      if(shippingDocs!==initialForm.shippingDocs){patch.shippingDocs=shippingDocs.trim();patch.loadNo=shippingDocs.trim();}");
const notesPath='source/src/modules/editor/components/EditorNotesField.jsx';
write(notesPath,`import React from 'react';
import {DutyNoteField} from '../../../shared/duty/DutyFieldsV110378.jsx';
export default function EditorNotesField({note,onNoteChange,label='Notes'}){
 return <div className="editor-note-compact-v90 editor-note-open-v11027"><DutyNoteField id="logbook-editor-notes" label={label} value={note} onChange={onNoteChange}/></div>;
}
`);
const insert='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert,"import React, { useEffect, useMemo, useState } from 'react';", "import React, { useEffect, useMemo, useState } from 'react';\nimport {DutyActivityField} from '../../shared/duty/DutyFieldsV110378.jsx';\nimport {dutyActivities,parseDutyActivities} from '../../shared/duty/dutyModelV110378.js';\nimport {isIntermodalModeActive} from '../status/equipmentMode.js';");
replaceBetween(insert,'function reasonListForStatus(status) {','\nfunction actionHeadingForStatus', 'function reasonListForStatus(status) {return dutyActivities(status,false);}\n');
replaceBetween(insert,"function selectedReasonsForStatus(status, note = '') {",'\nfunction joinReasons',`function selectedReasonsForStatus(status,note=''){
 return status==='ON'?parseDutyActivities(note).selected:reasonListForStatus(status).filter(reason=>String(note).toLowerCase().includes(reason.toLowerCase()));
}
`);
patch(insert,'editor-modern-v11027"','editor-modern-v11027 rr-duty-workspace"');
replaceBetween(insert,'      <div className="insert-driver-block quick-activities-v11023">','        <EditorLocationFields',`        <DutyActivityField status={form.status} intermodal={isIntermodalModeActive(logbookContext)} selected={selectedReasons} onToggle={toggleReason}/>

`);
// Existing browser assertions keep their behaviors. Selector names below follow
// the newly shared full activity wording instead of the old abbreviated chips.
for(const p of fs.readdirSync('scripts').filter(x=>x.startsWith('browser-')&&x.endsWith('.mjs'))){
 const path='scripts/'+p;let s=read(path);
 s=s.replaceAll("name:'PTI',exact:true","name:'Pre-trip inspection',exact:true").replaceAll("name: 'PTI', exact: true","name: 'Pre-trip inspection', exact: true");
 if(/browser-(modern-editor|motive-override|insert-interaction)/.test(p)){
   s=s.replaceAll("'PTI'","'Pre-trip inspection'").replaceAll("'Delivery'","'Delivery / Unloading'").replaceAll("'Pickup'","'Pickup / Loading'");
 }
 write(path,s);
}
// Only one protected render file was deliberately changed. All engine, signature,
// raw-record and backup lock hashes are retained.
locks.files[day]=hash(read(day));write('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — shared duty fields, explicit shipment review and guide/pickup identity boundary installed');
