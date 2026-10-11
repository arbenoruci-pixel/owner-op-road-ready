// Entirely synthetic PDF cells with a left appointment/right destination table.
const cell=(text,x,y,width=.15,height=.012)=>({text,confidence:1,box:{x,y,width,height}});
export function routeTableInput(){
 const header=n=>[cell('Page '+n,.07,.016,.04),cell('Shipment ID',.85,.016,.075),cell('Rate Confirmation',.43,.022,.14),cell('Oct 8, 2026',.07,.030,.08),cell('TEST-74123',.84,.030,.085)];
 const primary=[...header(1),
  cell('Route',.08,.178,.04),cell('Pickup',.408,.178,.054),cell('SAMPLE PRESS',.50,.178,.15),
  cell('Oct 8, 2026',.387,.196,.075),cell('123 Example St Albany, NY 12207',.50,.196,.26),cell('08:00 - 16:00 Apt',.35,.210,.112),
  cell('Delivery',.399,.225,.063),cell('SAMPLE TOYS',.50,.225,.14),
  cell('Oct 12, 2026',.378,.243,.084),cell('456 Sample Rd Madison, WI 53703',.50,.243,.27),cell('08:00 - 17:00 Apt',.348,.258,.114),
  cell('Equipment',.08,.315,.08),cell('Van',.196,.315,.04),cell('Carrier',.08,.344,.05),cell('EXAMPLE CARRIER LLC',.196,.344,.20),
  cell('Rate',.08,.430,.04),cell('Freight - flat',.196,.430,.1),cell('$4,250.00',.538,.430,.08),
  cell('Total',.196,.465,.04),cell('$4,250.00',.538,.465,.08),cell('TERMS AND CONDITIONS',.08,.504,.20),
  cell('Carrier must verify temperature with shipper.',.08,.55,.45),cell('Detention $35 per hour. Layover $150 per day.',.08,.58,.47)];
 const secondary=[...header(2),cell('Carrier payment requires a complete billing packet.',.08,.07,.60),cell('Driver Name Driver Signature',.1,.25,.4)];
 return {documentId:'synthetic-route-table',pages:[primary,secondary].map((lines,i)=>({id:'page-'+(i+1),number:i+1,observations:[{id:'native-layout',source:'pdf-text-layer',sourceImageId:'synthetic-'+(i+1),lines:lines.map((l,n)=>({id:'line-'+n,...l}))}]}))};
}
