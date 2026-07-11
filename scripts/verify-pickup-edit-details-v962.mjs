import assert from 'node:assert/strict';
import fs from 'node:fs';

const edit = fs.readFileSync(new URL('../source/src/modules/editor/EditEventSheet.jsx', import.meta.url), 'utf8');
const status = fs.readFileSync(new URL('../source/src/modules/status/StatusWorkflowSheet.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
const location = fs.readFileSync(new URL('../source/src/core/gps/locationService.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../app/api/location/reverse/route.js', import.meta.url), 'utf8');

assert.match(edit, /Pickup details/);
assert.match(edit, /BOL \/ Shipping document #/);
assert.match(edit, /Going to/);
assert.match(edit, /shippingDocs:kind \? shippingDocs\.trim\(\)/);
assert.match(edit, /maximumAcceptedAccuracy:250/);
assert.match(app, /enrichLoadEventFromLinkedRoute/);
assert.match(app, /applyShippingDocumentReference/);
assert.match(app, /toCity:destination\.city,[\s\S]*toState:destination\.state,/, 'clearing Going to clears the exact route destination');
assert.match(app, /patch\.deliveryCity = destination\.city \|\| '';/, 'new pickup clears a prior load destination instead of inheriting it');
assert.match(app, /patch\.deliveryState = destination\.state \|\| '';/, 'pickup destination state is exact-event scoped');
assert.match(status, /const \[shippingDocs, setShippingDocs\] = useState\(''\)/, 'new pickup does not inherit an old global BOL');
assert.match(status, /if \(nextKind === 'pickup'\)[\s\S]*setShippingDocs\(''\)[\s\S]*setDestination\(''\)/, 'switching to Pickup clears prior load defaults');
assert.match(status, /nextKind === 'delivery'[\s\S]*setShippingDocs\(activeLoadDocs\)/, 'Delivery may reuse only the active load as an editable default');
assert.match(location, /watchPosition/);
assert.match(location, /targetAccuracy/);
assert.match(location, /rejectCoarseFix/);
assert.match(api, /geographies\/coordinates/);

console.log('v96.2 pickup editor, exact-load defaults, and accurate GPS wiring checks passed');
