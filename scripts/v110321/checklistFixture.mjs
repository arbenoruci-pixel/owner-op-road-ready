import {buildDriverLoadGuideV103} from '../../source/src/modules/loads/loadGuideV103.js';
export function checklistFixture() {
  const guide=buildDriverLoadGuideV103({loadNo:'76543210',orderNo:'76543210',broker:'TQL',equipment:'Power Only',pickupNumber:'PU4321',stops:[
    {id:'pu',type:'pickup',company:'Example Factory',city:'Howe',state:'IN',date:'2026-09-08'},
    {id:'receiver',type:'delivery',company:'Example Receiver',city:'Smithfield',state:'RI',date:'2026-09-10'},
  ]},{documentId:'ratecon-fixture',requirements:{trackingProvider:'FourKites'},createdAt:Date.parse('2026-09-08T11:00:00Z')});
  guide.manualDone={review_load:1,accept_tracking:1};
  const bol={id:'bol-fixture',canonicalLoadNo:guide.loadNo,type:'bol',status:'verified',broker:'TQL',documentDate:'2026-09-08',bolNo:'87654321',extracted:{bolNo:'87654321'},podSigned:false};
  const store={loads:[{id:'load-fixture',loadNo:guide.loadNo,broker:'TQL'}],documents:[bol]};
  const state={homeTerminalTimeZone:'America/New_York',activeLoadGuideId:guide.id,loadGuidesById:{[guide.id]:guide},loadInfo:{guideId:guide.id,loadNo:guide.loadNo},eventsByDay:{
    '2026-09-08':[
      {id:'pretrip-pickup',status:'ON',startMin:420,endMin:435,reasons:['PTI'],shippingDocs:'BOL 87654321',city:'Howe',state:'IN'},
      {id:'pickup-event',status:'ON',startMin:435,endMin:480,reasons:['Pickup / Loading'],shippingDocs:'87654321',city:'Howe',state:'IN'},
      {id:'loaded-drive',status:'D',startMin:480,endMin:600,loadNo:'87654321'},
    ],
    '2026-09-10':[
      {id:'receiver-event',status:'ON',startMin:489,endMin:501,reasons:['Pre-trip inspection','Delivery / Unloading'],shippingDocs:'87654321',city:'Smithfield',state:'RI'},
      {id:'receiver-departure',status:'D',startMin:501,endMin:620,city:'Smithfield',state:'RI'},
    ],
  },documentsByDay:{},routeLegsByDay:{},signatureByDay:{'2026-09-08':{signed:true}},certifyStatus:{},inspectionByDay:{}};
  return {guide,store,state,bol,now:Date.parse('2026-09-10T15:00:00Z')};
}
