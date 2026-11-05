// Synthetic document, including unrelated freight/carrier columns and a
// wrapped party. No customer document text or business records are used here.
const cell=(text,x,y,width=.15,height=.012)=>({text,confidence:1,box:{x,y,width,height}});
export function nativeFooterInput(){
 const header=n=>[cell('Page '+n,.063,.017,.05),cell('Shipment ID',.864,.017,.072),cell('Rate confirmation',.432,.024,.14),cell('Nov 9, 2026',.063,.032,.08),cell('TEST-90210',.846,.032,.09)];
 const primary=[...header(1),cell('Route',.081,.178,.05),
  cell('Nov 9, 2026',.203,.206,.077),cell('EXAMPLE FOODS (N.',.363,.206,.17),cell('1 item',.601,.206,.05),cell('SAMPLE CARRIER',.760,.206,.15),
  cell('12:00 Apt',.218,.222,.062),cell('ALBANY)',.363,.222,.098),cell('LLC',.760,.222,.03),cell('Qty.: 1,250 Piece',.601,.229,.12),
  cell('Appointment',.197,.238,.083),cell('123 EXAMPLE WAY NORTH',.363,.240,.208),cell('DOT 0000000',.760,.240,.10),cell('Handling qty 20',.601,.245,.10),
  cell('#PICK-884',.190,.254,.09),cell('ALBANY, NY 12207',.363,.256,.145),cell('Pallets',.601,.261,.05),cell('SCAC: TEST',.760,.263,.10),
  cell('Pickup # 884002',.363,.272,.16),cell('Weight: 38,000 lb',.601,.277,.12),
  cell('Nov 11, 2026',.197,.320,.084),cell('EXAMPLE HUB',.360,.320,.13),cell('1 item',.599,.320,.05),cell('SAMPLE CARRIER',.759,.320,.15),
  cell('07:00 Apt',.217,.336,.063),cell('456 SAMPLE ROAD',.360,.338,.17),cell('LLC',.759,.336,.03),cell('Qty.: 1,250 Piece',.599,.343,.12),
  cell('Appointment',.197,.352,.083),cell('MADISON, WI 53703',.360,.354,.14),cell('DOT 0000000',.759,.354,.10),cell('Handling qty 20',.599,.358,.10),
  cell('#DROP-337',.197,.368,.084),cell('Delivery # 337002',.360,.370,.17),cell('Pallets',.599,.374,.05),cell('SCAC: TEST',.759,.377,.10),cell('Weight: 38,000 lb',.599,.390,.12),
  cell('Equipment',.081,.482,.08),cell('Van or Reefer',.191,.482,.12),cell('Items',.081,.526,.05),cell('PACKAGED GOODS',.191,.526,.20),
  cell('EXAMPLE FOODS (N. ALBANY) (ALBANY, NY) > EXAMPLE HUB (MADISON, WI)',.191,.545,.72),
  cell('Carrier',.081,.624,.05),cell('SAMPLE CARRIER LLC',.191,.624,.20),cell('TEST DRIVER',.536,.624,.15),
  cell('Rate',.081,.713,.04),cell('Freight - flat',.191,.715,.10),cell('$3,200.00',.536,.715,.08),
  cell('Total',.191,.751,.04),cell('$3,200.00',.536,.751,.08),cell('Notes',.081,.80,.05),cell('Late fee $150; detention $25/hour.',.191,.80,.60)];
 const terms=[...header(2),cell('TERMS AND CONDITIONS',.08,.15,.5),cell('Carrier payment requires a complete billing packet.',.08,.20,.70)];
 const tail=[...header(3),cell('Driver must be on tracking in order for detention to be paid.',.08,.10,.80),cell('PODs must be received within 7 days of delivery.',.08,.14,.70),cell('Representative signature',.10,.30,.30),cell('Receiver signature',.60,.30,.25),cell('Title',.10,.35,.10),cell('Date',.60,.35,.10)];
 return {documentId:'synthetic-footer-rate',pages:[primary,terms,tail].map((lines,i)=>({id:'page-'+(i+1),number:i+1,observations:[{id:'native-layout',source:'pdf-text-layer',sourceImageId:'synthetic-'+(i+1),lines:lines.map((line,n)=>({id:'line-'+n,...line}))}]}))};
}
