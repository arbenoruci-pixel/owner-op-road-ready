import fs from 'node:fs';
import path from 'node:path';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function realBackupStateFixture() {
  const jul05Events = [
    { id:'live_1783270004475', status:'OFF', specialMode:'none', startMin:706, endMin:862, city:'Chicago', state:'IL', note:'Off Duty', description:'', shippingDocs:'', loadNo:'', lat:41.741938724546586, lng:-87.94836563803713, source:'live_status' },
    { id:'live_1783280230626', status:'ON', specialMode:'none', startMin:862, endMin:885, city:'Chicago', state:'IL', description:'Load 111Y7Z983 · BNSF-CORWITH-CS Chicago, IL → SBN1 Bristol, IN', note:'Drop & Hook · Load 111Y7Z983 · to Bristol, IN', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983', destination:'Bristol', destinationState:'IN', source:'live_status' },
    { id:'live_1783280755903', status:'D', specialMode:'none', startMin:885, endMin:1109, city:'Chicago', state:'IL', note:'Driving started', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983', destination:'Bristol', destinationState:'IN', source:'live_status' },
    { id:'live_1783290584637', status:'ON', specialMode:'none', startMin:1109, endMin:1114, city:'Bristol', state:'IN', description:'Drop & Hook · Delivered 111Y7Z983 · Picked up 111J98KGR', note:'Drop & Hook · Delivered 111Y7Z983 · Picked up 111J98KGR', shippingDocs:'111Y7Z983 / 111J98KGR', loadNo:'111Y7Z983 / 111J98KGR', source:'live_status' },
    { id:'live_1783290900000', status:'ON', specialMode:'none', startMin:1119, endMin:1129, city:'Bristol', state:'IN', description:'Pre-trip inspection', note:'Pre-trip inspection', shippingDocs:'111J98KGR', loadNo:'111J98KGR', source:'live_status' },
    { id:'live_1783291200000', status:'D', specialMode:'none', startMin:1129, endMin:1305, city:'Bristol', state:'IN', note:'Driving started', shippingDocs:'111J98KGR', loadNo:'111J98KGR', destination:'Perrysburg', destinationState:'OH', source:'live_status' },
    { id:'live_1783302321600', status:'ON', specialMode:'none', startMin:1305, endMin:1320, city:'Perrysburg', state:'OH', description:'Drop & Hook · Delivered 111J98KGR · Picked up 114RMB689', note:'Drop & Hook · Delivered 111J98KGR · Picked up 114RMB689', shippingDocs:'111J98KGR / 114RMB689', loadNo:'111J98KGR / 114RMB689', source:'live_status' },
    { id:'live_1783303200000', status:'D', specialMode:'none', startMin:1320, endMin:1435, city:'Perrysburg', state:'OH', note:'Driving started', shippingDocs:'114RMB689', loadNo:'114RMB689', destination:'North Baltimore', destinationState:'OH', source:'live_status' },
    { id:'live_1783305300000', status:'SB', specialMode:'none', startMin:1435, endMin:1440, city:'Maumee', state:'OH', note:'Sleeper Berth', description:'', shippingDocs:'114RMB689', loadNo:'114RMB689', destination:'North Baltimore', destinationState:'OH', source:'live_status' },
  ];

  const jul06Events = [
    { id:'live_1783312700000', status:'OFF', specialMode:'none', startMin:38, endMin:40, city:'North Baltimore', state:'OH', note:'Off Duty', description:'', shippingDocs:'', loadNo:'', source:'live_status' },
    { id:'live_1783312835748', status:'ON', specialMode:'none', startMin:40, endMin:48, city:'North Baltimore', state:'OH', note:'Pre-trip inspection', description:'Load 113NRH53Z · CSXT-NORTHWEST OHIO ICTF North Baltimore, OH → MQJ1 Greenfield, IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', source:'live_status' },
    { id:'live_1783313300000', status:'D', specialMode:'none', startMin:48, endMin:252, city:'North Baltimore', state:'OH', note:'Driving started', description:'', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'Greenfield', destinationState:'IN', source:'live_status' },
    { id:'live_1783325520000', status:'ON', specialMode:'none', startMin:252, endMin:260, city:'Indianapolis', state:'IN', note:'On Duty', description:'Drop delivery paperwork', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', source:'live_status' },
    { id:'ev_1783350336721_0', status:'SB', specialMode:'none', startMin:260, endMin:1440, city:'Indianapolis', state:'IN', note:'Sleeper Berth', description:'', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'Greenfield', destinationState:'IN', source:'manual' },
  ];

  const jul07Events = [
    { id:'live_1783397778992', status:'ON', specialMode:'none', startMin:11, endMin:26, city:'Indianapolis', state:'IN', description:'Drop & Hook · Dropped AZNU241674 / DDRZ959762 · Hooked AZNU203742 / NSPZ135827 · to chicago,il', note:'Drop & Hook · Dropped AZNU241674 / DDRZ959762 · Hooked AZNU203742 / NSPZ135827 · to chicago,il', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'Greenfield, IN', destinationState:'IN', lat:39.83106022146432, lng:-85.88596975602441, source:'live_status' },
    { id:'live_1783398067361', status:'D', specialMode:'none', startMin:26, endMin:215, city:'Indianapolis', state:'IN', description:'', note:'Driving started', shippingDocs:'', loadNo:'', destination:'', destinationState:'', source:'live_status' },
    { id:'live_1783438869426', status:'ON', specialMode:'none', startMin:215, endMin:225, city:'chicago', state:'IL', description:'Drop Off · Dropped AZNU203742 / NSPZ135827', note:'Drop Off · Dropped AZNU203742 / NSPZ135827', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'chicago, IL', destinationState:'IL', source:'live_status' },
    { id:'ev_1783438930946_0', status:'SB', specialMode:'none', startMin:225, endMin:830, city:'Chicago', state:'IL', description:'', note:'Sleeper Berth', shippingDocs:'', loadNo:'', destination:'', destinationState:'', source:'manual' },
  ];

  const routeLegsByDay = {
    '2026-07-05':[
      { id:'relay_111Y7Z983', day:'2026-07-05', pickupDay:'2026-07-05', pickupEventId:'live_1783280230626', pickupMin:862, deliveryDay:'2026-07-05', deliveryEventId:'live_1783290584637', deliveryMin:1109, fromFacility:'BNSF-CORWITH-CS', fromCity:'Chicago', fromState:'IL', toFacility:'SBN1', toCity:'Bristol', toState:'IN', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983', kind:'loaded', status:'delivered', source:'manual_relay_route_fix', miles:123, rate:854.39, equipmentType:"53' Container", pickupAt:'Sun, Jul 5, 15:00 CDT', deliveryAt:'Sun, Jul 5, 21:00 EDT' },
      { id:'relay_111J98KGR', day:'2026-07-05', pickupDay:'2026-07-05', pickupEventId:'live_1783290584637', pickupMin:1109, deliveryDay:'2026-07-05', deliveryEventId:'live_1783302321600', deliveryMin:1305, fromFacility:'SBN1', fromCity:'Bristol', fromState:'IN', toFacility:'TOL3', toCity:'Perrysburg', toState:'OH', shippingDocs:'111J98KGR', loadNo:'111J98KGR', container:'AZNU213430', chassis:'UPHZ 531029', kind:'loaded', status:'delivered', source:'manual_relay_route_fix', miles:135, rate:607.38, equipmentType:"53' Container" },
      { id:'relay_114RMB689', day:'2026-07-05', pickupDay:'2026-07-05', pickupEventId:'live_1783302321600', pickupMin:1320, deliveryDay:'2026-07-06', deliveryEventId:'live_1783312835748', deliveryMin:40, fromFacility:'TOL3', fromCity:'Perrysburg', fromState:'OH', toFacility:'CSXT-NORTHWEST OHIO ICTF', toCity:'North Baltimore', toState:'OH', shippingDocs:'114RMB689', loadNo:'114RMB689', container:'AZNU241674', chassis:'DDRZ959762', kind:'loaded', status:'delivered', source:'manual_relay_route_fix', miles:33, rate:229.79, equipmentType:"53' Container", pickupAt:'Sun, Jul 5, 21:30 EDT', deliveryAt:'Sun, Jul 5, 22:56 EDT' },
    ],
    '2026-07-06':[
      { id:'relay_113NRH53Z', day:'2026-07-06', pickupDay:'2026-07-06', pickupEventId:'live_1783312835748', pickupMin:40, deliveryDay:'2026-07-07', deliveryEventId:'live_1783397778992', deliveryMin:11, fromFacility:'CSXT-NORTHWEST OHIO ICTF', fromCity:'North Baltimore', fromState:'OH', toFacility:'MQJ1', toCity:'Indianapolis', toState:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', kind:'loaded', status:'delivered', source:'manual_relay_route_fix', miles:206, rate:1152.11, equipmentType:"53' Container", pickupAt:'Mon, Jul 6, 01:00 EDT', deliveryAt:'Mon, Jul 6, 06:30 EDT', droppedContainer:'AZNU241674', droppedChassis:'DDRZ959762' },
    ],
    '2026-07-07':[
      { id:'leg_hook_live_1783397778992', day:'2026-07-07', pickupDay:'2026-07-07', pickupEventId:'live_1783397778992', pickupMin:11, deliveryDay:'2026-07-07', deliveryEventId:'live_1783438869426', deliveryMin:215, fromCity:'Indianapolis', fromState:'IN', toCity:'chicago', toState:'IL', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', container:'AZNU203742', chassis:'NSPZ135827', droppedContainer:'AZNU203742', droppedChassis:'NSPZ135827', kind:'loaded', status:'delivered', source:'drop_hook_event' },
      { id:'leg_hook_live_1783438869426', day:'2026-07-07', pickupDay:'2026-07-07', pickupEventId:'live_1783438869426', pickupMin:215, deliveryDay:'', deliveryEventId:'', deliveryMin:null, fromCity:'chicago', fromState:'IL', toCity:'chicago', toState:'IL', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', container:'', chassis:'', droppedContainer:'AZNU203742', droppedChassis:'NSPZ135827', kind:'loaded', status:'open', source:'drop_hook_event' },
    ],
  };

  return {
    view:'backup',
    activeDay:'2026-07-06',
    eventsByDay:{
      '2026-06-29':[{ id:'live_1783366359846', status:'OFF', specialMode:'none', startMin:932, endMin:933, city:'chicago', state:'IL', description:'BOL 113NRH53Z', note:'Off Duty', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'Greenfield, IN', destinationState:'IN', source:'live_status' }],
      '2026-06-30':[{ id:'live_1783366337206', status:'OFF', specialMode:'none', startMin:932, endMin:933, city:'chicago', state:'IL', description:'BOL 113NRH53Z', note:'Off Duty', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', destination:'Greenfield, IN', destinationState:'IN', source:'live_status' }],
      '2026-07-05':jul05Events,
      '2026-07-06':jul06Events,
      '2026-07-07':jul07Events,
    },
    routeLegsByDay:clone(routeLegsByDay),
    loadInfo:{
      loadNo:'113NRH53Z', shippingDocs:'113NRH53Z', bol:'113NRH53Z', po:'113NRH53Z', broker:'', pickupCity:'North Baltimore', pickupState:'OH', deliveryCity:'chicago', deliveryState:'IL', appointment:'Mon, Jul 6, 06:30 EDT', truck:'228', currentMoveKind:'loaded', routeLegsByDay:clone(routeLegsByDay),
    },
    currentTrailer:'No equipment',
    equipment:{ type:'intermodal', trailer:'', chassis:'', container:'', seal:'', rail:'', note:'Dropped AZNU203742 / NSPZ135827', updatedAt:1783438869426, source:'drop_off_status' },
    manualMilesByDay:{ '2026-07-05':291, '2026-07-07':198 },
    certifyStatus:{ '2026-07-05':'Active day / Not certified yet', '2026-07-04':'Certified', '2026-06-28':'Certified', '2026-07-01':'Needs signature', '2026-07-03':'Certified', '2026-07-06':'Active day / Not certified yet', '2026-07-02':'Certified', '2026-06-30':'Needs signature', '2026-06-29':'Needs signature', '2026-07-07':'Active day / Not certified yet' },
    driver:{ truck:'228', trailer:'Trailer 53' },
    driverProfile:{ name:'Arben Oruci' },
    carrierName:'Narta Express LLC',
    mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',
    inspectionByDay:{ '2026-07-05':{ complete:true, sourceEventId:'live_1783280230626', sourceStartMin:862 }, '2026-07-06':{ complete:true, sourceEventId:'live_1783312835748', sourceStartMin:40 }, '2026-07-07':{ complete:true, sourceEventId:'live_1783397778992', sourceStartMin:11 } },
    signatureByDay:{ '2026-07-04':{ signed:true }, '2026-07-03':{ signed:true }, '2026-07-02':{ signed:true } },
    _restoredBackupMeta:{ importedAt:'2026-07-06T17:06:40.390Z', filename:'road-ready-backup-20260706-LOAD-ROUTE-FIX.json', sourceVersion:'95.67.0-route-load-repair', schemaVersion:1 },
  };
}

export function loadRealBackupState() {
  const candidates = [
    process.env.ROAD_READY_REAL_BACKUP,
    path.resolve('road-ready-backup-20260707-213526.json'),
    path.resolve('scripts/fixtures/road-ready-backup-20260707-213526.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return clone(parsed.state || parsed);
    } catch {
      // Keep the embedded regression fixture available when the full backup is not mounted.
    }
  }
  return realBackupStateFixture();
}

export { clone as cloneRealBackupFixture };
