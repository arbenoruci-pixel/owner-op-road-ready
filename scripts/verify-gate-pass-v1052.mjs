import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, value) => fs.writeFileSync(path.join(ROOT, relative), value);
function pass(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

// The materializer writes a marker beside a JSX conditional. Normalize the
// marker into a JSX comment before Next parses the component.
const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let statusSource = read(statusPath);
statusSource = statusSource.replace(
  '        )} // generic-trailer-action-v1052',
  '        )}{/* generic-trailer-action-v1052 */}',
);
write(statusPath, statusSource);

const {
  classifyTruckDocumentTextV1040,
  reanalyzeTruckDocumentTypeV1040,
} = await import('../source/src/modules/scan/truckDocumentEngineV1040.js');
const {
  documentLinkableV1040,
  documentStacksV1040,
  truckDocumentTypeMetaV1040,
} = await import('../source/src/modules/scan/truckDocumentCatalogV1040.js');

const fixture = `
printed 7/18/26 7:09pm
Drop Load
Anthony Marano Company
Gate Pass
Dock Assignment
Dock S48
Assigned by: Jose Perez
Driver's Name: Truck (914) 413-2229
Appointment Window: 7/18/26 4:00am - 12:00pm
Arrival Time: 7/18/26 6:35pm
Carrier: Select Transport
Trailer #: 7005
Shipper: Borzynski Bros. Dist. Inc.
PO#: 30601896
Lot#: 21725
If you have any questions, please contact the Guard House at 773-321-7641
YARD ENTRANCE
DROP LOAD / PARKING
`;

const classified = classifyTruckDocumentTextV1040({
  text:fixture,
  fileName:'anthony-marano-drop-load-gate-pass.jpg',
  preferredType:'auto',
  context:{},
});
pass(classified.type.id === 'gate_pass', 'Anthony Marano Drop Load is classified as Gate Pass');
pass(classified.confidence >= .85, 'Gate Pass structural confidence is high');
pass(classified.gatePassProfileV1052?.strong === true, 'Gate Pass template profile is strong');
pass(classified.gatePassProfileV1052?.evidence?.includes('Dock assignment'), 'Dock assignment is classification evidence');
pass(classified.gatePassProfileV1052?.evidence?.includes('Arrival time'), 'Arrival time is classification evidence');

const analysis = reanalyzeTruckDocumentTypeV1040({
  text:fixture,
  type:classified.type,
  detectedType:classified.type,
  confidence:classified.confidence,
  fields:{},
  originalFileName:'anthony-marano-drop-load-gate-pass.jpg',
  method:'gate-pass-fixture-v1052',
}, 'gate_pass', {
  state:{ currentTrailer:'7005', equipment:{ trailer:'7005' }, loadInfo:{} },
  profile:{},
  businessStore:{ documents:[], loads:[] },
});

const fields = analysis.fields || {};
pass(fields.title === 'Gate Pass — Drop Load', 'Drop Load title is normalized');
pass(fields.operationType === 'Drop Load', 'operation is extracted as Drop Load');
pass(fields.facilityName === 'Anthony Marano Company', 'facility is extracted');
pass(fields.dockAssignment === 'S48', 'dock S48 is extracted');
pass(fields.poNumber === '30601896', 'PO 30601896 is extracted');
pass(fields.lotNumber === '21725', 'Lot 21725 is extracted separately');
pass(fields.trailerNo === '7005', 'Trailer 7005 is extracted');
pass(fields.carrierName === 'Select Transport', 'carrier is extracted');
pass(/Borzynski Bros/i.test(fields.shipper || ''), 'shipper is extracted');
pass(fields.driverName === '', 'word Truck is not accepted as driver name');
pass(/914[\s.-]413[\s.-]2229/.test(fields.driverPhone || ''), 'driver phone is extracted separately');
pass(/773[\s.-]321[\s.-]7641/.test(fields.guardHousePhone || ''), 'guard-house phone is extracted');
pass(fields.loadNo === '', 'PO, Lot, Dock and phone do not become a Load number');
pass(fields.suggestedDutyStatus === 'ON', 'Gate Pass suggests ON DUTY');
pass(fields.suggestedLogActivity === 'Drop Load / Trailer', 'Gate Pass suggests Drop Load / Trailer');
pass(fields.suggestedStopStatus === 'arrived_at_dock_drop_load', 'Gate Pass creates an arrived-at-dock suggestion');

const meta = truckDocumentTypeMetaV1040('gate_pass');
const stacks = documentStacksV1040('gate_pass').map(item => item.id);
pass(meta.id === 'gate_pass', 'Gate Pass exists in the trucking document taxonomy');
pass(stacks.includes('load_folder'), 'Gate Pass routes to a Load folder');
pass(stacks.includes('logbook'), 'Gate Pass routes to Logbook supporting documents');
pass(documentLinkableV1040('gate_pass') === true, 'Gate Pass can be linked to a Logbook day');

const finalStatusSource = read(statusPath);
const scanSource = read('source/src/modules/scan/SmartScanSheetV105.jsx');
const appSource = read('source/src/app/App.jsx');
pass(finalStatusSource.includes('Drop Load / Trailer'), 'Logbook has Drop Load / Trailer');
pass(finalStatusSource.includes('Hook / Pickup Trailer'), 'Logbook has the opposite Hook / Pickup Trailer action');
pass(finalStatusSource.includes('generic-trailer-action-v1052'), 'generic trailer confirmation fields are installed');
pass(scanSource.includes('Add {saved.fields.suggestedLogActivity} to Logbook'), 'saved Gate Pass offers one-tap Logbook suggestion');
pass(scanSource.includes('road-ready:open-status-activity-v1052'), 'scanner dispatches the Logbook activity suggestion');
pass(appSource.includes('isHookTrailerReasonV1052'), 'App handles Hook / Pickup Trailer');
pass(appSource.includes("sheet:{ type:'status', preferredReason:detail.reason"), 'document suggestion opens the status confirmation sheet');
pass(read('public/app-version.json').includes('105.2.0'), 'v105.2 release metadata is written');

console.log('PASS — v105.2 Gate Pass & Trailer Workflow regression suite');
