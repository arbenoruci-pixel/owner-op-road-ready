import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeReceiverReviewsV1021, receiverSearchQueryV1021 } from '../source/src/modules/receiver/receiverIntelEngineV1021.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const query = receiverSearchQueryV1021({
  facility:'Sysco Western Minnesota',
  address:'900 Highway 10 S',
  city:'Saint Cloud',
  state:'MN',
});
assert.match(query,/Sysco Western Minnesota/);
assert.match(query,/Saint Cloud, MN/);

const intelligence = analyzeReceiverReviewsV1021([
  {
    rating:5,
    relativePublishTimeDescription:'8 months ago',
    authorAttribution:{ displayName:'Sam' },
    text:{ text:'Great experience. Very organized facility, in & out 45 minutes. Slide your tandem and wait for their call to get signed paperwork.' },
  },
  {
    rating:1,
    relativePublishTimeDescription:'3 months ago',
    authorAttribution:{ displayName:'Rory Clark' },
    text:{ text:'0600 appointment arrived at 0515 checked in put on a door right away. They did not start unloading until 0650.' },
  },
]);

assert.equal(intelligence.reviewCountUsed,2);
assert.equal(intelligence.earlyCheckIn.status,'reported');
assert.match(intelligence.earlyCheckIn.label,/45 min early/i);
assert.equal(intelligence.dayEarly.status,'unknown');
assert.match(intelligence.dayEarly.label,/No evidence/i);
assert.equal(intelligence.unloading.status,'reported');
assert.match(intelligence.unloading.label,/45 min/i);
assert.equal(intelligence.tandems.status,'reported');
assert.equal(intelligence.instructions.some(value=>/phone call/i.test(value)),true);

const route = read('app/api/places/receiver/route.js');
const component = read('source/src/modules/receiver/ReceiverIntelV1021.jsx');
const activeLoad = read('source/src/modules/home/ActiveLoadLiveV102.jsx');
const materializer = read('scripts/materialize-v1021.mjs');
assert.match(route,/GOOGLE_PLACES_API_KEY/);
assert.match(route,/places:searchText/);
assert.match(route,/X-Goog-FieldMask/);
assert.match(route,/'reviews'/);
assert.match(route,/'reviewSummary'/);
assert.match(component,/Receiver Intel/);
assert.match(component,/One day early/);
assert.match(component,/Open Google Maps/);
assert.match(activeLoad,/ReceiverIntelV1021/);
assert.match(activeLoad,/nextStop\.company/);
assert.doesNotMatch(route,/currentStatus|eventsByDay|startMin|endMin/);
assert.doesNotMatch(component,/onApplyStatus|currentStatus|eventsByDay/);
assert.match(materializer,/v102\.1 Google Receiver Intel materialized/);

console.log('verify-receiver-intel-v1021 passed');
