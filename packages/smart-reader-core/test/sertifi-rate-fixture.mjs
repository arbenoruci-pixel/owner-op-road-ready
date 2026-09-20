import {textObservation} from '../src/index.js';
const cell=(id,text,x,y,width=.2,height=.011)=>({id,text,confidence:1,box:{x,y,width,height}});
const ref='20250711111222333';
export function sertifiRateInput(){
  const lines=[
    cell('title','PRO # 86420 Rate Confirmation',.5,.02,.45),
    cell('rate','TOTAL RATE 500.00',.04,.33,.3),
    cell('pick','PICK 1',.037,.364,.066,.013),
    cell('shipper','SAMPLE RAIL TERMINAL',.111,.381,.24),
    cell('street','123 EXAMPLE RD',.111,.396,.24),
    cell('pickup-time','Appointment 07/12/25',.647,.396,.24),
    cell('pickup-city','ELWOOD IL 60421',.111,.411,.24),
    cell('notes','Appt Notes: LFD 07/12',.647,.411,.24),
    cell('ref-label','Ref',.688,.426,.025),
    cell('pickup-ref','# PU# SYNTHETIC1',.729,.426,.22),
    cell('drop','STOP 1',.037,.455,.063,.013),
    cell('consignee','EXAMPLE RECEIVING LLC',.111,.472,.24),
    cell('delivery-city','LINCOLNWOOD IL 60712',.111,.487,.24),
    cell('delivery-time','Appointment 07/14/25 @ 07:00',.647,.487,.3),
    cell('terms','ALL LOADS MUST BE ON MACROPOINT OR $250 FINE WILL APPLY!',.108,.517,.7),
    cell('envelope',`Doc ID: ${ref}`,.04,.97,.3),
  ];
  const first=['PRO # 86420 Rate Confirmation','TOTAL RATE 500.00','Weight: 36000',
    'PICK 1','SAMPLE RAIL TERMINAL','123 EXAMPLE RD Appointment 07/12/25','ELWOOD IL 60421 Appt Notes: LFD 07/12',
    'Ref # PU# SYNTHETIC1','STOP 1','EXAMPLE RECEIVING LLC','LINCOLNWOOD IL 60712 Appointment 07/14/25 @ 07:00',
    'ALL LOADS MUST BE ON MACROPOINT OR $250 FINE WILL APPLY!',
    '- Detention paid after 3h at a rate of $30 per hour, not exceeding $150 per 24h',
    '- ALL PAGES OF PODs MUST BE TURNED IN WITHIN 48h OF DELIVERY',`Doc ID: ${ref}`].join('\n');
  return {documentId:'synthetic-sertifi-rate',pages:[
    {id:'page-1',observations:[textObservation(first,{id:'native',source:'pdf-text-layer'}),
      {id:'native-layout',source:'pdf-text-layer',sourceImageId:'synthetic-page-1',lines}]},
    {id:'page-2',observations:[textObservation(['PRO # 86420 Rate Confirmation',
      '- Please send all billing to billing@example.test','The confirmation governs the movement of the',
      'above-referenced freight as of the date specified.',`Doc ID: ${ref}`].join('\n'))]},
    {id:'page-3',observations:[textObservation(`E-Signed : 07/11/2025 03:55 PM CDT\nSample Signer\nsigner@example.test\nIP: 192.0.2.1\nSertifi Electronic Signature\nDocID: ${ref}\nDoc ID: ${ref}\nSertifi Electronic Signature`)]}
  ]};
}
