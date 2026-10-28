export const archive={id:'archive-load',loadNo:'ARCHIVE-80001',broker:'Archived Broker',source:'rate_confirmation_v105',status:'invoiced',origin:'Old City, ME',destination:'Other City, NE'};
export const pickup={id:'current-pickup',status:'ON',note:'Pickup / Loading',startMin:775,endMin:810,loadNo:'',bol:'88001234',shippingDocs:'88001234',city:'Origin',state:'OH',destination:'Receiver, IL',loadDetailsExplicit:true};
export const state={activeDay:'2026-10-28',eventsByDay:{'2026-10-27':[pickup],'2026-10-28':[{id:'pretrip',status:'ON',note:'Pre-trip inspection',startMin:500,endMin:515}]},
 loadInfo:{loadNo:archive.loadNo,bol:pickup.bol,po:pickup.bol,stops:[{type:'delivery',bolNumber:pickup.bol}]},loadGuidesById:{},routeLegsByDay:{}};
export const store={loads:[archive],documents:[]};
export const analysis={type:{id:'bol',label:'Bill of Lading'},confidence:.9,needsReview:true,text:'BILL OF LADING\nBill of Lading Number 88001234\nSHIP TO Example Receiver\nDATE 10/27/26',fields:{bolNo:'88001234',documentDate:'2026-10-27',shipTo:'Example Receiver'}};
