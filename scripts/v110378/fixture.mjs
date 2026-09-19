export const day='2026-01-12';
export function fixture(){return {
 activeDay:day,currentStatus:'OFF',currentLocation:{city:'Current City',state:'IL'},
 signatureByDay:{},certifyStatus:{[day]:'Needs signature'},manualMilesByDay:{[day]:{total:201}},
 eventsByDay:{[day]:[
  {id:'pickup-fixture',status:'ON',startMin:600,endMin:615,city:'Origin',state:'WI',note:'Hook / Pickup Trailer · Trailer T77',description:'Load MOVE-A · To Milwaukee, WI',reasons:[],loadNo:'OTHER-B',shippingDocs:'OTHER-B',bol:'BOL-X',destination:'Dates',destinationState:'WI',pickedUpLoadNo:'OTHER-B',hookedTrailer:'T77',loadDetailsExplicit:true,integrityRepairedAt:1},
  {id:'driving-fixture',status:'D',startMin:615,endMin:900,city:'Origin',state:'WI',note:'Driving'},
  {id:'handoff-fixture',status:'ON',startMin:900,endMin:915,city:'Milwaukee',state:'WI',note:'Drop Load / Trailer · Trailer T77',droppedTrailer:'T77',reasons:[],lat:43,lng:-88,gpsAccuracy:3},
  {id:'off-fixture',status:'OFF',startMin:915,endMin:1440,city:'Milwaukee',state:'WI',note:'Off Duty'}],
  '2026-01-11':[{id:'previous',status:'OFF',startMin:0,endMin:1440,note:'Previous day'}]},
 routeLegsByDay:{[day]:[
  {id:'manual-fixture',day,pickupDay:day,pickupEventId:'',fromCity:'Origin',fromState:'WI',toCity:'Milwaukee',toState:'WI',loadNo:'MOVE-A',shippingDocs:'MOVE-A',status:'open',source:'manual_form'},
  {id:'recorded-fixture',day,pickupDay:day,pickupEventId:'pickup-fixture',pickupMin:600,fromCity:'Origin',fromState:'WI',toCity:'Dates',toState:'WI',shippingDocs:'OTHER-B',loadNo:'OTHER-B',pickedUpLoadNo:'MOVE-A',source:'pickup_event',status:'open'}]},
 loadInfo:{guideId:'guide-B',loadNo:'OTHER-B',sourceEventDay:day,sourceEventId:'pickup-fixture'},activeLoadGuideId:'guide-B',
 loadGuidesById:{'guide-B':{id:'guide-B',status:'active',loadNo:'OTHER-B',pickupDate:day,deliveryDate:day,stops:[{type:'pickup',city:'Origin',state:'WI',date:day},{type:'delivery',city:'Dates',state:'WI',date:day}]}},
 documentsByDay:{[day]:[{id:'original',hash:'immutable',loadNo:'OTHER-B'}]}
};}
