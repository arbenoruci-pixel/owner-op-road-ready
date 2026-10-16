import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path, 'utf8');
const changes = new Map();
function patch(path, before, after) {
  const source = changes.get(path) || read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length, 2, 'Delivery closeout anchor: ' + path + ' / ' + before.slice(0, 100));
  changes.set(path, source.replace(before, () => after));
}
const app = 'source/src/app/App.jsx';
patch(app, "import DriveModeScreen from '../modules/drive/DriveModeScreen.jsx';", "import DriveModeScreen from '../modules/drive/DriveModeScreen.jsx';\nimport {prepareDeliveryPayload,completeDeliveryRoute,finishDeliveryState} from '../core/routes/deliveryCloseoutV110475.js';");
patch(app, "function updateRouteLegsForStatus(routeLegsByDay = {}, day, payload = {}, eventId = '', startMin = 0) {", "function updateRouteLegsForStatus(routeLegsByDay = {}, day, payload = {}, eventId = '', startMin = 0, deliveryState = {}) {");
const source = changes.get(app) || read(app), start = source.indexOf('    if (isDeliveryReason(reason)) {', source.indexOf('function updateRouteLegsForStatus('));
const stop = source.indexOf('      const leg = normalizeRouteLeg({', start);
assert.ok(start > 0 && stop > start, 'Unique legacy delivery matcher');
const old = source.slice(start, stop);
patch(app, old, `    if (isDeliveryReason(reason)) {
      const completed = completeDeliveryRoute(routeLegsByDay, day, {...payload, status:payload.status || 'ON'}, eventId, startMin, deliveryState);
      if (completed) return completed;
`);
patch(app, "backdateMinutes=0 }) {\n    const liveNow", "backdateMinutes=0, bol='', deliveryRouteId='', deliveryCompleted=false, ...deliveryDetails }) {\n    const liveNow");
patch(app, '      let note = reason;', `      let confirmedDelivery;
      try {
        confirmedDelivery = prepareDeliveryPayload(base, {status,reason,reasons,city,state:st,shippingDocs,loadNo,bol,destination,destinationState,deliveryRouteId,deliveryCompleted,...deliveryDetails}, {day,minute:changeAt});
      } catch (error) {
        window.setTimeout(() => window.alert?.(error.message), 0);
        return {...base,sheet:{type:'status'}};
      }
      let note = reason;`);
patch(app, ": String(shippingDocs || loadNo || '').trim();\n      const loadDescription =", ": String(confirmedDelivery.shippingDocs || shippingDocs || loadNo || '').trim();\n      const loadDescription =");
patch(app, "        loadNo:effectiveShippingDocs,\n        bol:effectiveShippingDocs,", "        loadNo:isDeliveryReason(reason) ? confirmedDelivery.loadNo : effectiveShippingDocs,\n        bol:isDeliveryReason(reason) ? confirmedDelivery.bol || effectiveShippingDocs : effectiveShippingDocs,\n        ...(isDeliveryReason(reason) ? {deliveryRouteId:confirmedDelivery.deliveryRouteId,deliveryCompleted:true,deliveryStopSequence:confirmedDelivery.deliveryStopSequence,deliveryStopId:confirmedDelivery.deliveryStopId,deliveryStopCount:confirmedDelivery.deliveryStopCount,orderNo:confirmedDelivery.orderNo,multiStopContextVersion:confirmedDelivery.multiStopContextVersion} : {}),");
patch(app, 'const loadPayload = { status, reason, city:effectiveCity, state:effectiveState, shippingDocs:effectiveShippingDocs, loadNo:effectiveShippingDocs, destination, destinationState, dropHook };', 'const loadPayload = { ...confirmedDelivery, status, reason, city:effectiveCity, state:effectiveState, shippingDocs:effectiveShippingDocs, loadNo:isDeliveryReason(reason) ? confirmedDelivery.loadNo : effectiveShippingDocs, destination, destinationState, dropHook };');
patch(app, 'updateRouteLegsForStatus(base.routeLegsByDay || {}, day, loadPayload, eventId, changeAt);', 'updateRouteLegsForStatus(base.routeLegsByDay || {}, day, loadPayload, eventId, changeAt, base);');
patch(app, '      return recordOnDutyHandoffUpdate(base, markDayRecert(next, day), day, handoffUpdate, now);', '      next = finishDeliveryState(next, loadPayload, eventId);\n      return recordOnDutyHandoffUpdate(base, markDayRecert(next, day), day, handoffUpdate, now);');
const sheet = 'source/src/modules/status/StatusWorkflowSheet.jsx';
patch(sheet, "import { applyDeliveryContextToPayloadV1034, resolveDeliveryContextV1034 } from '../loads/multiStopDeliveryV1034.js';", '// Delivery context is scoped to the selected recorded route.');
patch(sheet, "import React, { useEffect, useRef, useState } from 'react';", "import React, { useEffect, useRef, useState } from 'react';\nimport {deliveryRouteChoices,deliveryRouteInfo,prepareDeliveryPayload} from '../../core/routes/deliveryCloseoutV110475.js';\nimport {localDayKey} from '../../shared/utils/date.js';\nimport {nowMin} from '../../shared/utils/time.js';");
patch(sheet, '  const [startAgoMinutes, setStartAgoMinutes] = useState(0);', `  const [startAgoMinutes, setStartAgoMinutes] = useState(0);
  const [deliveryRouteId,setDeliveryRouteId] = useState('');
  const deliveryChoices = deliveryRouteChoices(state,{day:localDayKey(),minute:Math.max(0,nowMin()-startAgoMinutes)});
  const chosenDeliveryRouteId = deliveryRouteId || (deliveryChoices.length===1 ? deliveryChoices[0].id : '');`);
patch(sheet, '  const deliveryContextV1034 = resolveDeliveryContextV1034(state, { city, state:st });', `  const selectedDeliveryInfo = deliveryRouteInfo(state,deliveryChoices.find(leg=>leg.id===chosenDeliveryRouteId));
  const deliveryContextV1034 = selectedDeliveryInfo.context;`);
patch(sheet, "const activeDeliveryLoadNoV1034 = deliveryContextV1034?.loadNo || activeLoadDocs;", "const activeDeliveryLoadNoV1034 = selectedDeliveryInfo.loadNo;");
patch(sheet, "const activeDeliveryStopV1034 = deliveryContextV1034?.currentStopText || activeLoadDestination;", "const activeDeliveryStopV1034 = selectedDeliveryInfo.destination;");
patch(sheet, '      reasons:selectedReasons,\n      city:', "      reasons:selectedReasons,\n      ...(loadReasonKind(status,selectedReasons)==='delivery' ? {deliveryRouteId:chosenDeliveryRouteId,deliveryCompleted:true} : {}),\n      city:");
patch(sheet, '    const p = applyDeliveryContextToPayloadV1034(state, payload());', `    let p;
    try { p = prepareDeliveryPayload(state,payload(),{day:localDayKey(),minute:Math.max(0,nowMin()-startAgoMinutes)}); }
    catch(error) { setGpsStatus(error.message); return; }`);
patch(sheet, '      setDestination(activeDeliveryStopV1034);', `      const route = deliveryChoices.find(leg=>leg.id===chosenDeliveryRouteId);
      setDestination(route ? [route.toCity,route.toState].filter(Boolean).join(', ') : activeDeliveryStopV1034);`);
patch(sheet, '<section className="picker-section load-link-section multi-stop-delivery-v1034">', `<section className="picker-section load-link-section multi-stop-delivery-v1034">
            {loadReasonKind(status,selectedReasons)==='delivery' && deliveryChoices.length>0 ? <label className="delivery-route-choice">
              <span>Load to complete</span>
              <select aria-label="Load to complete" value={chosenDeliveryRouteId} onChange={event=>{setDeliveryRouteId(event.target.value);const info=deliveryRouteInfo(state,deliveryChoices.find(row=>row.id===event.target.value));setDestination(info.destination);setShippingDocs(info.loadNo);}}>
                <option value="">Choose the load being unloaded</option>
                {deliveryChoices.map(leg=><option key={leg.id} value={leg.id}>{leg.shippingDocs || leg.loadNo} · {[leg.fromCity,leg.fromState].filter(Boolean).join(', ')} → {[leg.toCity,leg.toState].filter(Boolean).join(', ')}{leg.stopSequence ? ' · Stop '+leg.stopSequence : ''}</option>)}
              </select>
              <small>Saving unloading completes this load or delivery stop.</small>
            </label> : null}`);
for (const [path, content] of changes) fs.writeFileSync(path, content);
fs.copyFileSync('scripts/delivery-closeout/closeout.js','source/src/core/routes/deliveryCloseoutV110475.js');
console.log('PASS delivery selection, distinct BOL/order references and exact route completion installed');
