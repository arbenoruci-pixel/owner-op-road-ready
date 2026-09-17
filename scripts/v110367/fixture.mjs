export const pickupDay = '2026-09-14', middleDay = '2026-09-15', deliveryDay = '2026-09-16';
const row = (id, status, startMin, endMin, extra = {}) => ({id, status, startMin, endMin, city:'Chicago', state:'IL', source:'manual', note:status, ...extra});
export function fixture() {
  const pickup = row('pickup-fixture', 'ON', 1236, 1247, {note:'Hook / Pickup Trailer · Trailer UNIT-A · Picked up 123', shippingDocs:'123', loadNo:'123', hookedTrailer:'UNIT-A', destination:'New York, NY'});
  const delivery = row('delivery-fixture', 'ON', 600, 630, {city:'New York', state:'NY', note:'Drop Load / Trailer', shippingDocs:'123', droppedTrailer:'UNIT-A'});
  const route = {id:'fixture-route', day:pickupDay, pickupDay, pickupMin:1236, pickupEventId:pickup.id,
    deliveryDay, deliveryMin:600, deliveryEventId:delivery.id, shippingDocs:'123', loadNo:'123',
    fromCity:'Chicago', fromState:'IL', toCity:'New York', toState:'NY', status:'delivered', kind:'loaded', source:'pickup_event', updatedAt:2000};
  return {
    view:'day', activeDay:middleDay, sheet:null, selectedEventId:null, selectedIds:[], selectMode:false,
    homeTerminalTimeZone:'America/New_York', driver:{truck:'TEST', trailer:'NEW-TRAILER'}, driverProfile:{name:'Test Driver'},
    carrierName:'Example Carrier', mainOfficeAddress:'Example Office', currentTrailer:'NEW-TRAILER', currentStatus:'OFF',
    currentLocation:{city:'Chicago', state:'IL'}, formByDay:{}, signatureByDay:{}, certifyStatus:{}, inspectionByDay:{},
    loadInfo:{loadNo:'NEW-REF', shippingDocs:'NEW-REF'}, loadGuidesById:{}, dotWallet:{documents:{}},
    routeLegsByDay:{[pickupDay]:[route]},
    eventsByDay:{
      [pickupDay]:[row('before-pickup','OFF',0,1236),pickup,row('after-pickup','D',1247,1440)],
      [middleDay]:[row('overnight','D',0,180),row('sleeper','SB',180,780),row('pretrip','ON',780,795,{note:'Pre-trip inspection'}),row('driving','D',795,1200),row('break','OFF',1200,1440)],
      [deliveryDay]:[row('before-delivery','SB',0,600),delivery,row('after-delivery','D',630,1440)],
      '2026-09-17':[row('next-day','OFF',0,1440)],
    },
  };
}
