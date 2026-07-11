import assert from 'node:assert/strict';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-08';

function stateWithDrivingEnd(endMin, fuelStartMin = 1439) {
  return {
    activeDay: day,
    driverProfile: { name:'Arben Oruci' },
    carrierName: 'Narta Express LLC',
    mainOfficeAddress: '92 201 Lake Drive, Willowbrook, IL 60527',
    driver: { truck:'228' },
    currentTrailer: '529',
    manualMilesByDay: { [day]: 100 },
    loadInfo: { loadNo:'607 2581', sourceEventDay:day },
    inspectionByDay: { [day]: { complete:true, sourceStartMin:1225 } },
    eventsByDay: {
      [day]: [
        { id:'e1', status:'OFF', startMin:0, endMin:1225, city:'Chicago', state:'IL', note:'Off Duty' },
        { id:'e2', status:'ON', startMin:1225, endMin:1240, city:'Chicago', state:'IL', note:'Pre-trip inspection' },
        { id:'e3', status:'D', startMin:1240, endMin:1305, city:'Chicago', state:'IL', note:'Driving started' },
        { id:'e4', status:'ON', startMin:1305, endMin:1320, city:'Wilmington', state:'IL', note:'Pickup / Loading', shippingDocs:'607 2581' },
        { id:'e5', status:'OFF', startMin:1320, endMin:1431, city:'Wilmington', state:'IL', note:'Off Duty' },
        { id:'e6', status:'D', startMin:1431, endMin, city:'Wilmington', state:'IL', note:'Driving started' },
        { id:'e7', status:'ON', startMin:fuelStartMin, endMin:1440, city:'Wilmington', state:'IL', note:'Fuel' },
      ],
    },
    signatureByDay: {},
    certifyStatus: {},
  };
}

const oneMinuteArtifact = validateLogForSigning(stateWithDrivingEnd(1440), day);
assert.equal(oneMinuteArtifact.some(issue => String(issue.code || '').startsWith('overlap_')), false,
  'one-minute minute-boundary artifact must not block certification');
assert.equal(oneMinuteArtifact.some(issue => issue.code === 'missing_shipping_docs'), false,
  'existing shipping docs must stay accepted');

const realOverlap = validateLogForSigning(stateWithDrivingEnd(1440, 1438), day);
assert.equal(realOverlap.some(issue => String(issue.code || '').startsWith('overlap_')), true,
  'overlaps larger than one minute must remain blocked');

console.log('v96.3 minute-boundary signing verification passed');
