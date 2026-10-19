// Synthetic document; no driver data or source-report extracts are stored here.
const cell=(text,x,y,width=.15,height=.012)=>({text,confidence:1,box:{x,y,width,height}});
export function carrierTableInput({source='pdf-text-layer',confidence=1,attachments=true}={}){
  const main=[
    cell('TQL RATE CONFIRMATION FOR PO# TEST-90210',.44,.041,.50),
    cell('CARRIER CONTACT',.09,.235,.17),
    cell('MC#/DOT#',.047,.269,.10),cell('Name',.220,.269,.05),cell('Phone',.507,.269,.06),cell('Terms',.682,.269,.06),
    cell('000000 / 0000000',.047,.289,.14),cell('EXAMPLE CARRIER LLC',.220,.289,.20),cell('555-010-0100',.507,.289,.12),cell('28 DAYS',.682,.289,.09),
    cell('Address',.220,.315,.08),cell('999 Billing Rd, Atlanta, GA 30303',.220,.336,.36),
    cell('LOAD INFORMATION',.09,.405,.18),
    cell('Total: $2,350.00 USD',.752,.476,.21),
    cell('Mode',.047,.512,.05),cell('Trailer Type',.147,.512,.10),cell('Trailer Size',.254,.512,.09),cell('Linear Feet',.361,.512,.09),
    cell('FTL',.047,.537,.03),cell('Van',.147,.537,.04),cell('53 ft',.254,.537,.05),
    cell('Pick-up Location',.047,.590,.11),cell('Date',.489,.590,.04),cell('Time',.718,.590,.04),
    cell('Albany, NY',.047,.610,.11),cell('10/16/2026',.489,.610,.09),cell('Appt 13:30 Note:CONF',.718,.610,.23),
    cell('Commodity: SAMPLES',.047,.645,.21),
    cell('Delivery Location',.047,.695,.13),cell('Date',.489,.695,.04),cell('Time',.718,.695,.04),
    cell('Appt 06:00 Note:CONF',.718,.712,.23),cell('Madison, WI',.047,.719,.12),cell('10/18/2026',.489,.719,.09),
    cell('777888999',.718,.729,.09),
  ];
  const rows=[main];
  if(attachments)rows.push([cell('Payment and paperwork instructions',.1,.1,.5)],[cell('Carrier agreement addendum',.1,.1,.5)],[cell('Carrier requirements',.1,.1,.4),cell('TQL PO# TEST-90210',.5,.9,.3)]);
  return {documentId:'synthetic-carrier-rate',pages:rows.map((lines,i)=>({id:'p'+(i+1),number:i+1,observations:[{id:'source',source,sourceImageId:'synthetic-source-'+i,lines:lines.map((line,j)=>({...line,id:'l'+j,confidence}))}]}))};
}
export function labeledRateInput(){
  const primary=`RATE CONFIRMATION\nLoad Number: TEST-80173\nBroker: EXAMPLE FREIGHT LLC\nCarrier: EXAMPLE CARRIER LLC\nPickup: SAMPLE PRESS\nPickup Address: 123 Example Rd Albany, NY 12207\nPickup Date: 2026-10-12\nPickup Appointment: 08:00 - 16:00\nDelivery: SAMPLE TOYS\nDelivery Address: 456 Sample St Madison, WI 53703\nDelivery Date: 2026-10-14\nDelivery Appointment: 06:00\nPO Number: PO-64318\nTotal Carrier Pay: $2,350.00 USD\nDocument Ref: SYNTHETIC-TEST-80173\nPage 1 of 2`;
  const terms=`RATE CONFIRMATION\nLoad Number: TEST-80173\nCarrier: EXAMPLE CARRIER LLC\nTerms and Conditions\nCarrier must provide complete paperwork for payment.\nDocument Ref: SYNTHETIC-TEST-80173\nPage 2 of 2`;
  return {documentId:'synthetic-labeled-rate',pages:[primary,terms].map((text,i)=>({id:'p'+(i+1),number:i+1,observations:[{id:'text',source:'pdf-text-layer',lines:text.split('\n').map((text,j)=>({id:'l'+j,text,confidence:1}))}]}))};
}
