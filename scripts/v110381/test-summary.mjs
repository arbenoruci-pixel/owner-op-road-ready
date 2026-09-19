import assert from 'node:assert/strict';
import {onDutySummary} from '../../source/src/modules/logbook/onDutySummaryV110381.js';
const rows=Object.freeze([
 Object.freeze({id:'pti',city:'Onalaska',state:'WI',reasons:Object.freeze(['Pre-trip inspection','Drop & Hook']),note:'Pre-trip inspection · Drop & Hook'}),
 Object.freeze({id:'pickup',city:'Onalaska',state:'WI',note:'Hook / Pickup Trailer · Trailer 4298',loadNo:'LOAD-A',shippingDocs:'DOC-B',bol:'BOL-C',hookedTrailer:'4298',destination:'Milwaukee, WI'})
]);
const before=JSON.stringify(rows),summary=onDutySummary(rows);
assert.equal(summary.note,'Pre-trip inspection · Drop & Hook · Trailer 4298');
assert.deepEqual(summary.locations,['Onalaska, WI']);
assert.deepEqual(summary.routes,['Load LOAD-A · BOL BOL-C · Shipping docs DOC-B · Trailer 4298 · Going to Milwaukee, WI']);
assert.equal(JSON.stringify(rows),before);
const other=onDutySummary([...rows,{loadNo:'OTHER',destination:'Chicago, IL',note:'Fuel',city:'Another',state:'IL'}]);
assert.equal(other.routes.length,2);assert.match(other.routes[1],/^Load OTHER · Going to Chicago, IL$/);assert.match(other.note,/Fuel/);assert.equal(other.locations.length,2);
assert.deepEqual(onDutySummary([]),{note:'',locations:[],routes:[]});
console.log('PASS — compact ON summary keeps activities, locations and separate source references without changing records');
