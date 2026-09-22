// Anonymous forms model cropped labels and independent printed structure.
const line=(id,text,x,y,width=.3)=>({id,text,confidence:.96,box:{x,y,width,height:.014}});
export const croppedBolObservation=()=>({id:'original',source:'fixture',sourceImageId:'original-page',lines:[
  line('terms','This Bill of Lading is not subject to any tariffs',.004,.08,.7),
  line('carrier','ARRIER:',.004,.18,.07),line('carrier-value','EXAMPLE TRANSPORT',.16,.18),
  line('from','ROM:',.004,.21,.04),line('from-value','EXAMPLE FOODS',.16,.21),
  line('consigned','CONSIGNED',.004,.26,.09),line('consignee-value','REGIONAL MARKET',.16,.26),
  line('to','TO:',.04,.28,.04),line('branch','TOWN DEPOT',.16,.28),
  line('weight','TOTAL NET WEIGHT:',.48,.84,.2),line('weight-value','1200 LB',.74,.84,.15),
]});
export const croppedPackingObservation=()=>({id:'original',source:'fixture',sourceImageId:'original-page',lines:[
  line('title','Packing Slip',.78,.07,.2),
  line('party','ip To:',.002,.10,.06),line('party-value','EGIONAL MARKET',.002,.12),
  line('number','Packing Slip Number:',.35,.15,.2),line('number-value','PS-2401',.65,.15,.15),
  line('order','Order Number:',.35,.18,.2),line('order-value','SO-2701',.65,.18,.15),
  line('ship-date','Ship Date:',.35,.23,.2),line('date-value','2026-09-22',.65,.23,.15),
  line('description','Description',.24,.36,.2),line('ordered','Ordered',.68,.36,.08),line('shipped','Shipped',.82,.36,.08),
]});
