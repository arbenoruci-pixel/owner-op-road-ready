import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.4.0';
const RELEASED_AT = '2026-07-16T15:45:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.4 missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v103.4 missing ${label}`);
  return content.replace(pattern, replacement);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// Fix a precedence typo in the direct module source before importing it in tests/build.
const multiPath = 'source/src/modules/loads/multiStopDeliveryV1034.js';
let multi = read(multiPath);
multi = multi.replace(
  `if (!eventBelongsToGuideV1034(event, guide) && !textV1034(state.activeLoadGuideId) === textV1034(guide.id)) continue;`,
  `if (!eventBelongsToGuideV1034(event, guide) && textV1034(state.activeLoadGuideId) !== textV1034(guide.id)) continue;`
);
write(multiPath, multi);

const workflowPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let workflow = read(workflowPath);
workflow = replaceOnce(
  workflow,
  `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';`,
  `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';\nimport { applyDeliveryContextToPayloadV1034, resolveDeliveryContextV1034 } from '../loads/multiStopDeliveryV1034.js';`,
  'status workflow multi-stop import'
);
workflow = replaceOnce(
  workflow,
  `  const activeLoadDestination = [state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState].filter(Boolean).join(', ');`,
  `  const activeLoadDestination = [state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState].filter(Boolean).join(', ');\n  const deliveryContextV1034 = resolveDeliveryContextV1034(state, { city, state:st });\n  const activeDeliveryLoadNoV1034 = deliveryContextV1034?.loadNo || activeLoadDocs;\n  const activeDeliveryStopV1034 = deliveryContextV1034?.currentStopText || activeLoadDestination;\n  const activeDeliveryNextV1034 = deliveryContextV1034?.nextStopText || '';\n  const activeDeliverySequenceV1034 = Number(deliveryContextV1034?.currentSequence || 0);`,
  'status workflow delivery context'
);
workflow = replaceOnce(
  workflow,
  `    } else if (nextKind === 'delivery') {\n      // Delivery can start from the currently active load, then persists on\n      // this exact event when the driver saves.\n      setShippingDocs(activeLoadDocs);\n      setDestination(activeLoadDestination);\n    }`,
  `    } else if (nextKind === 'delivery') {\n      // Multi-stop delivery: current unloading stop comes from GPS/location +\n      // Rate Con stop sequence. The next stop is separate information.\n      setShippingDocs(activeDeliveryLoadNoV1034);\n      setDestination(activeDeliveryStopV1034);\n    }`,
  'delivery default current stop'
);
workflow = workflow.replace(
  `  }, [status, selectedReasons, activeLoadDocs, activeLoadDestination]);`,
  `  }, [status, selectedReasons, activeLoadDocs, activeLoadDestination, activeDeliveryLoadNoV1034, activeDeliveryStopV1034, activeDeliverySequenceV1034]);`
);
workflow = replacePattern(
  workflow,
  /    return \{\n      status,([\s\S]*?)      locationSource: gpsFix \? 'gps' : 'manual',\n    \};\n  \}/,
  `    const basePayloadV1034 = {\n      status,$1      locationSource: gpsFix ? 'gps' : 'manual',\n    };\n    return applyDeliveryContextToPayloadV1034(state, basePayloadV1034);\n  }`,
  'payload delivery enrichment',
  'basePayloadV1034'
);
workflow = replacePattern(
  workflow,
  /        \{reasonNeedsLoadLink\(status, selectedReasons\) && \([\s\S]*?        \)\}\n\n        <section className="picker-section">/,
  `        {reasonNeedsLoadLink(status, selectedReasons) && (\n          <section className="picker-section load-link-section multi-stop-delivery-v1034">\n            <div className="picker-label-row">\n              <label>{reasonHas(selectedReasons, /delivery|unloading/i) ? 'Delivery info' : 'Pickup info'}</label>\n              <span>linked to this event</span>\n            </div>\n            <div className="driver-load-grid">\n              <label>\n                <span>{reasonHas(selectedReasons, /delivery|unloading/i) ? 'Order / Load #' : 'BOL / Shipping #'}</span>\n                <input\n                  value={shippingDocs}\n                  onChange={(e) => setShippingDocs(e.target.value)}\n                  placeholder="Load or BOL #"\n                  autoComplete="off"\n                />\n              </label>\n              <label>\n                <span>{reasonHas(selectedReasons, /delivery|unloading/i) ? 'Unloading at' : 'Going to'}</span>\n                <input\n                  value={destination}\n                  onChange={(e) => setDestination(e.target.value)}\n                  placeholder="City, ST"\n                  autoComplete="off"\n                />\n              </label>\n            </div>\n            {reasonHas(selectedReasons, /delivery|unloading/i) && deliveryContextV1034 && (\n              <div className="delivery-stop-intel-v1034">\n                <div>\n                  <span>Stop {deliveryContextV1034.currentSequence} of {deliveryContextV1034.stopCount}</span>\n                  {deliveryContextV1034.legNo && <span>Leg {deliveryContextV1034.legNo}</span>}\n                  {deliveryContextV1034.po && <span>PO {deliveryContextV1034.po}</span>}\n                </div>\n                <b>{deliveryContextV1034.currentStop?.company || deliveryContextV1034.currentStopText}</b>\n                <p>{activeDeliveryNextV1034 ? <>Next stop: <strong>{activeDeliveryNextV1034}</strong>{deliveryContextV1034.nextStop?.company ? ` · ${deliveryContextV1034.nextStop.company}` : ''}</> : 'Final stop'}</p>\n              </div>\n            )}\n          </section>\n        )}\n\n        <section className="picker-section">`,
  'delivery UI current and next stop',
  'delivery-stop-intel-v1034'
);
write(workflowPath, workflow);

const integrityPath = 'source/src/core/integrity/logbookIntegrityV107.js';
let integrity = read(integrityPath);
integrity = integrity.replace(
  `    const sourceEventId = text(state.loadInfo?.guideId) === text(guide.id) ? text(state.loadInfo?.sourceEventId) : '';`,
  `    const sourceEventCandidateIdV1034 = text(state.loadInfo?.guideId) === text(guide.id) ? text(state.loadInfo?.sourceEventId) : '';\n    const sourceEventCandidateV1034 = sourceEventCandidateIdV1034 ? findEvent(state, sourceDay || pickupDay, sourceEventCandidateIdV1034) : null;\n    const sourceEventId = sourceEventCandidateV1034 && /pickup|loading/i.test(eventText(sourceEventCandidateV1034)) ? sourceEventCandidateIdV1034 : '';`
);
integrity = integrity.replace(
  `    const pickupEventId = sequence === 1 ? (sourceEventId || old.pickupEventId || '') : (old.pickupEventId || '');`,
  `    const oldPickupEventIdV1034 = text(old.pickupEventId);\n    const oldPickupEventV1034 = oldPickupEventIdV1034 ? findEvent(state, validDay(old.pickupDay || old.day || pickupDay), oldPickupEventIdV1034) : null;\n    const validOldPickupEventIdV1034 = oldPickupEventV1034 && /pickup|loading/i.test(eventText(oldPickupEventV1034)) ? oldPickupEventIdV1034 : '';\n    const pickupEventId = sequence === 1 ? (sourceEventId || validOldPickupEventIdV1034) : (validOldPickupEventIdV1034 || '');`
);
integrity = integrity.replace(
  `  if (sourceEvent && sourceEvent.status === 'ON') {`,
  `  if (sourceEvent && sourceEvent.status === 'ON' && /pickup|loading/i.test(eventText(sourceEvent))) {`
);
write(integrityPath, integrity);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  `import { repairRoadReadyStateV107 } from '../core/integrity/logbookIntegrityV107.js';`,
  `import { repairRoadReadyStateV107 } from '../core/integrity/logbookIntegrityV107.js';\nimport { repairMultiStopDeliveryStateV1034 } from '../modules/loads/multiStopDeliveryV1034.js';`,
  'App multi-stop repair import'
);
app = app.replace(
  `  return reconcileCertificationStatusesV1032(inspectionNormalized);`,
  `  return reconcileCertificationStatusesV1032(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }));`
);
if (!app.includes("source:'state_write_v1034'")) {
  app = app.replaceAll(
    `return markRecert(next);`,
    `return markRecert(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }));`
  );
}
app = app.replace(
  `          out = { ...out, deliveryDay:delivery.day, deliveryMin:deliveryEvent.startMin, status:'delivered' };`,
  `          const linkedDeliveryStatusV1034 = out.loadGroupId && out.stopStatus !== 'done' && out.status !== 'delivered' ? 'in_progress' : 'delivered';\n          out = { ...out, deliveryDay:delivery.day, deliveryMin:deliveryEvent.startMin, status:linkedDeliveryStatusV1034 };`
);
app = app.replace(
  `    if (isDeliveryReason(reason)) {\n      const existing = findOpenRouteLeg(routeLegsByDay, day, shippingDocs);`,
  `    if (isDeliveryReason(reason)) {\n      const guideExistingV1034 = Number(payload.deliveryStopSequence || 0) > 0\n        ? routeLegArray(routeLegsByDay).find(leg => leg.loadGroupId && Number(leg.stopSequence || 0) === Number(payload.deliveryStopSequence) && String(leg.loadNo || leg.shippingDocs || '').trim().toLowerCase() === shippingDocs.toLowerCase())\n        : null;\n      const existing = guideExistingV1034 || findOpenRouteLeg(routeLegsByDay, day, shippingDocs);`
);
app = app.replace(
  `          status:'delivered',\n          updatedAt:Date.now(),`,
  `          status:guideExistingV1034 && payload.deliveryCompleted !== true ? 'in_progress' : 'delivered',\n          stopStatus:guideExistingV1034 && payload.deliveryCompleted !== true ? 'in_progress' : 'done',\n          updatedAt:Date.now(),`
);
app = app.replace(
  `    const origin = { city:payload.city || '', state:payload.state || '' };\n    const patch = {`,
  `    const origin = { city:payload.city || '', state:payload.state || '' };\n    if (deliveryLike && Number(payload.deliveryStopSequence || 0) > 0) {\n      return {\n        sourceEventId:eventId,\n        sourceEventReason:reason,\n        shippingDocs,\n        loadNo:shippingDocs,\n        orderNo:String(payload.orderNo || shippingDocs).trim(),\n        legNo:String(payload.legNo || '').trim(),\n        po:String(payload.po || payload.stopPo || '').trim(),\n        currentStopSequence:Number(payload.deliveryStopSequence),\n        activeStopSequence:Number(payload.deliveryStopSequence),\n        currentStop:String(payload.destination || [payload.city, payload.state].filter(Boolean).join(', ')).trim(),\n        currentStopCity:String(payload.deliveryCity || payload.city || '').trim(),\n        currentStopState:String(payload.deliveryState || payload.state || '').trim(),\n        currentStopCompany:String(payload.deliveryCompany || '').trim(),\n        currentStopPo:String(payload.po || payload.stopPo || '').trim(),\n        nextStopSequence:Number(payload.nextStopSequence || 0) || null,\n        nextStop:String(payload.nextStop || payload.nextDestination || '').trim(),\n        nextStopCity:String(payload.nextStop || payload.nextDestination || '').split(',')[0].trim(),\n        nextStopState:String(payload.nextDestinationState || '').trim(),\n        nextStopCompany:String(payload.nextStopCompany || '').trim(),\n        appointment:String(payload.nextStopAppointment || '').trim(),\n        noLoadDeclared:false,\n        noLoadNote:'',\n        updatedAt:Date.now(),\n        multiStopContextVersion:'103.4.0',\n      };\n    }\n    const patch = {`
);
app = app.replace(
  `    const parts = [];\n    const ref = String(payload.shippingDocs || payload.loadNo || '').trim();`,
  `    if (payload.deliveryDescription) return String(payload.deliveryDescription);\n    const parts = [];\n    const ref = String(payload.shippingDocs || payload.loadNo || '').trim();`
);
write(appPath, app);

const stylePath = 'source/src/command-center.css';
let styles = read(stylePath);
styles = appendOnce(styles, '/* v103.4 multi-stop delivery context */', `
/* v103.4 multi-stop delivery context */
.delivery-stop-intel-v1034{
  margin-top:10px;
  padding:12px;
  border:1px solid #bfdbfe;
  border-radius:15px;
  background:#eff6ff;
  color:#172033;
}
.delivery-stop-intel-v1034>div{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px;}
.delivery-stop-intel-v1034 span{display:inline-flex;padding:4px 7px;border-radius:999px;background:#fff;border:1px solid #dbeafe;font-size:11px;font-weight:900;}
.delivery-stop-intel-v1034 b{display:block;font-size:14px;font-weight:950;}
.delivery-stop-intel-v1034 p{margin:5px 0 0;font-size:12px;font-weight:800;color:#475569;}
.delivery-stop-intel-v1034 strong{color:#0b5ed7;}
`);
write(stylePath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.4-multistop-delivery-context-repair',
  releasedAt:RELEASED_AT,
  notes:[
    'Separates the current unloading stop from the next stop on multi-stop loads.',
    'Resolves the current delivery from GPS/location plus the Rate Confirmation stop list, not from the final load destination.',
    'Stores Order/Load, Leg and stop-specific PO as separate fields and shows the next stop as information.',
    'Repairs existing multi-stop delivery descriptions and route links without changing any duty-status time, status or GPS location.',
    'Prevents a delivery event from being reused as the Rate Confirmation pickup source event.',
    'Keeps an active unloading stop in progress until the driver completes/departs that stop.'
  ],
  label:'v103.4 Multi-stop Delivery Context',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  [workflowPath,'delivery-stop-intel-v1034'],
  [workflowPath,'applyDeliveryContextToPayloadV1034'],
  [appPath,'repairMultiStopDeliveryStateV1034'],
  [appPath,'deliveryStopSequence'],
  [integrityPath,'sourceEventCandidateIdV1034'],
  [multiPath,"multiStopContextVersion:'103.4.0'"],
];
for (const [relative, marker] of checks) if (!read(relative).includes(marker)) throw new Error(`v103.4 verification missing ${marker} in ${relative}`);
console.log('v103.4 multi-stop delivery context materialized');
await import('./verify-multistop-delivery-v1034.mjs');
