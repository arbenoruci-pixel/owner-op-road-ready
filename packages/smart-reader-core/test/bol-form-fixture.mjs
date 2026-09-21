// Synthetic company names and identifiers; OCR shapes mirror reported forms.
export const formRow=(text,x=.04,y=.1,width=.4,height=.012,confidence=.95)=>({text,confidence,box:{x,y,width,height}});
const observation=(id,lines)=>({id,source:'fixture-ocr',sourceImageId:'form-'+id,lines});
export function shortFormInput(){
  const rows=[
    formRow('STRAIGHT BILL OF LADING - SHORT FORM',.2,.057,.5),
    formRow('Name of Carrier: SUPPLY CHAIN SOLUTIO KEEP FROZEN Shipper’s No:',.04,.073,.85),
    formRow('AT Lakeville, MN 55044 07/10/2026 from Example Kitchen',.04,.112,.7),
    formRow('Consigned to: REGIONAL FOODS (ABC)',.04,.18,.5),
    formRow('Requested Due Date: 07/14/2026',.04,.21),
    formRow('PO No: 246810-002',.04,.23),
    formRow('20,188 LB',.799,.378,.08),
    formRow('TOTAL WEIGHT:',.600,.395,.066,.009),
    formRow('20,188',.799,.397,.034,.008),
    formRow('LB',.866,.397,.013,.007),
    formRow('Weight subject to',.04,.45,.1),formRow('correction',.2,.45,.1),
    formRow('carrier on the route to said destination',.04,.50,.5),
    formRow('SHIPPERS CERTIFICATION:',.04,.59),
    formRow('Shipper hereby certifies the shipment',.04,.61),
    formRow('Shipper Temperature Verification / 0 degrees',.04,.65,.6),
    formRow('SHIPPER F / g -',.04,.747)
  ];
  const source=structuredClone(rows);source.splice(2,1,formRow('AT Lakeville, MN 55044',.04,.112,.2),
    formRow('07/10/2026',.24,.112,.08),formRow('from Example Kitchen',.34,.112,.2));
  return {documentId:'short-form-fixture',pages:[{id:'p1',observations:[observation('table',rows),observation('source',source)]}]};
}
export function damagedUnitInput(){
  const common=[formRow('BILL OF LADING',.05,.02),formRow('SHIP FROM: Example Foods',.04,.14),
    formRow('SHIP TO: Western DC',.04,.25),formRow('Carrier Ngme:',.6,.17,.18),
    formRow('PO No: 7654321098',.04,.4),
    formRow('Net Weight',.28,.371,.1),formRow('Commodity Description',.40,.371,.09),
    formRow('Total Qty Units: 4',.04,.457),formRow('Total Qty Pieces: 320',.4,.48),
    formRow('Total Weight: 2377.44 Ibs',.659,.457,.139,.01,.926)];
  return {documentId:'damaged-unit-fixture',pages:[{id:'p1',observations:[
    observation('clean',[...structuredClone(common),formRow('Bill of Lading Number: AB8565',.525,.086,.30,.011,.857)]),
    observation('table',[...structuredClone(common),formRow('Number: ABB565',.608,.086,.093,.009,.724)])
  ]}]};
}
