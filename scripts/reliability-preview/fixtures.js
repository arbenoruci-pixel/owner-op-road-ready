// Synthetic examples for the review build. No account data is bundled here.
export const SAMPLE_LOAD='TEST-80173';
export const RATE_PAGES=[
  `RATE CONFIRMATION\nLoad Number: TEST-80173\nBroker: EXAMPLE FREIGHT LLC\nCarrier: EXAMPLE CARRIER LLC\nPickup: SAMPLE PRESS\nPickup Address: 123 Example Rd Albany, NY 12207\nPickup Date: 2026-10-16\nPickup Appointment: 08:00 - 16:00\nDelivery: SAMPLE TOYS\nDelivery Address: 456 Sample St Madison, WI 53703\nDelivery Date: 2026-10-19\nDelivery Appointment: 06:00\nPO Number: PO-64318\nTotal Carrier Pay: $2,350.00 USD\nDocument Ref: SYNTHETIC-TEST-80173\nPage 1 of 2`,
  `RATE CONFIRMATION\nLoad Number: TEST-80173\nCarrier: EXAMPLE CARRIER LLC\nTerms and Conditions\nCarrier must provide complete paperwork for payment.\nDocument Ref: SYNTHETIC-TEST-80173\nPage 2 of 2`,
];
export function sampleReaderInput(weak=false) {
  return {documentId:'review-sample-rate',pages:RATE_PAGES.map((text,i)=>({id:'p'+(i+1),number:i+1,observations:[{id:'source',source:weak?'synthetic-weak-ocr':'pdf-text-layer',lines:text.split('\n').map((text,j)=>({id:'l'+j,text,confidence:weak?0.55:1}))}]}))};
}
const event=(id,status,startMin,endMin,note='')=>({id,status,startMin,endMin,source:'manual',city:'Sample City',state:'IL',note,description:note,locationSource:'manual'});
export function initialSample() {
  return {version:1,loads:[],business:{},logbook:{
    activeDay:'2026-10-17',activeDriverId:'driver_primary',currentStatus:'D',homeTerminalTimeZone:'America/New_York',
    driverProfile:{name:'Sample Driver'},equipment:{type:'dry_van'},
    hosSettings:{cycleHours:70,cycleDays:8,carrierOperatesEveryDay:true,jurisdiction:'US_INTERSTATE_PROPERTY',splitSleeperEnabled:true,source:'Synthetic carrier profile for this example',confirmedAt:'2026-01-01T00:00:00Z'},
    eventsByDay:{
      '2026-10-15':[event('prior-full-rest','OFF',0,1440)],
      '2026-10-16':[event('full-rest','OFF',0,1440)],
      '2026-10-17':[event('prefix','OFF',0,300),event('pretrip','ON',300,480,'Sample pre-trip'),event('drive-a','D',480,720),event('short-rest','OFF',720,900),event('drive-b','D',900,1260),event('long-a','SB',1260,1440)],
      '2026-10-18':[event('long-b','SB',0,300),event('drive-c','D',300,360)],
    },certifyStatus:{'2026-10-17':'Not certified'},signatureByDay:{},logbookEditHistoryByDay:{},
  }};
}

