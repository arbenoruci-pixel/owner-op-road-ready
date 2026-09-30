import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Team freight anchor '+p);fs.writeFileSync(p,s.replace(before,()=>after));}
const shipment='source/src/core/routes/shipmentCarryover.js';
patch(shipment,"import {newestRouteCopies} from './routeProjectionV110352.js';", "import {newestRouteCopies} from './routeProjectionV110352.js';\nimport {driverLogbookEntries} from '../team/teamLogbook.js';");
patch(shipment,'  for (const [day, events] of Object.entries(state.eventsByDay || {})) {', '  for (const [driverId, book] of driverLogbookEntries(state)) {\n  for (const [day, events] of Object.entries(book.eventsByDay || {})) {');
patch(shipment,'{day, event}]);','{day, event, driverId}]);');
patch(shipment,'    }\n  }\n  index.groups = new Map();','    }\n  }\n  }\n  index.groups = new Map();');
// Authoritative freight origin comes from its actual pickup, across the team.
patch(shipment,'export function shipmentContextForEvents(',`export function freightOriginForLeg(state, leg, index = routeHistoryIndex(state)) {
  const pickup = routeHistoryWindow(leg, index).pickup;
  return {city:text(pickup?.city || leg.fromCity), state:text(pickup?.state || leg.fromState)};
}

export function shipmentContextForEvents(`);
const route='source/src/core/routes/routeNormalization.js';
patch(route,"import { routeHistoryIndex, recordedRouteDayMembership } from './shipmentCarryover.js';", "import { routeHistoryIndex, recordedRouteDayMembership, freightOriginForLeg } from './shipmentCarryover.js';\nimport {driverLogbookEntries} from '../team/teamLogbook.js';");
patch(route,'  const dayEvents = (Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : []).filter(recordedLogEventV110374);', '  const dayEvents = driverLogbookEntries(state).flatMap(([,book]) => Array.isArray(book.eventsByDay?.[day]) ? book.eventsByDay[day] : []).filter(recordedLogEventV110374);');
patch(route,'    const docs = firstRealText(latestOpenLoaded.shippingDocs, latestOpenLoaded.loadNo);', '    const docs = firstRealText(latestOpenLoaded.shippingDocs, latestOpenLoaded.loadNo);\n    const freightOrigin = freightOriginForLeg(withCanonical, latestOpenLoaded);');
patch(route,'pickupCity:safeText(latestOpenLoaded.fromCity || nextLoad.pickupCity)', 'pickupCity:safeText(freightOrigin.city || nextLoad.pickupCity)');
patch(route,'pickupState:safeUpper(latestOpenLoaded.fromState || nextLoad.pickupState)', 'pickupState:safeUpper(freightOrigin.state || nextLoad.pickupState)');
// DOT exports use the same day-scoped freight records, never an undated cache.
patch(route, '      return refs.some(value => dayRefs.has(value));\n    })', '      return refs.some(value => dayRefs.has(value));\n    })\n    .map(leg => { const origin = freightOriginForLeg(state, leg, historyIndex); return {...leg, fromCity:origin.city, fromState:origin.state}; })');
const dot='source/src/modules/dot/DotMode.jsx';
patch(dot,"import { routeLegsForDayCanonical }", "import {driverLogbookEntries} from '../../core/team/teamLogbook.js';\nimport { routeLegsForDayCanonical }");
patch(dot,'  const events = state.eventsByDay?.[day] || [];\n  const routeLegs = routeLegsForDayCanonical(state, day);','  const events = driverLogbookEntries(state).flatMap(([,book]) => book.eventsByDay?.[day] || []);\n  const routeLegs = routeLegsForDayCanonical(state, day);');
patch(dot,"    || (!!load.sourceEventId && eventIds.has(load.sourceEventId))\n    || (!load.sourceEventDay && !load.sourceEventId && !routeLegs.length && !events.some(event => event.shippingDocs || event.loadNo));", "    || (!!load.sourceEventId && eventIds.has(load.sourceEventId));");
console.log('PASS — per-driver mileage and shared recorded freight projection installed');
