// Generic names and identifiers, with interleaved columns like phone OCR.
export function shippingLayoutInput(){
  const row=(text,x,y,width,height=.012,confidence=.94)=>({text,box:{x,y,width,height},confidence});
  const lines=[
    ...Array.from({length:24},(_,i)=>row('speck',.01,.001+i*.002,.03,.001,.1)),
    row('BILL OF LADING - NOT NEGOTIABLE',.35,.07,.36,.02),
    row('09/10/2026',.06,.08,.12,.01,.25),
    row('SHIP FROM',.24,.1,.08),
    row('garbled barcode',.52,.103,.14,.026,.18),
    row('Example Foods Inc',.07,.118,.16),
    row('427 Oak Avenue',.07,.134,.16),
    row('SHIPTO',.25,.175,.08,.02,.65),
    row('Carrier',.51,.176,.05,.012,.73),
    row('Example Receiver',.07,.195,.16,.012,.6),
    row('Trailer #',.51,.20,.05,.01,.65),
    row('1200 Oak Road',.07,.21,.16),
    row('Shipper Signature/Date Trailer Loaded: Freight Counted:',.06,.80,.85),
    row('07/07/2027',.60,.60,.12),
  ];
  const observation=(id)=>({id,source:'phone-ocr-fixture',sourceImageId:'image-'+id,lines:structuredClone(lines)});
  const first=observation('clean'),second=observation('source');
  first.lines.find(line=>line.text==='Example Foods Inc').text='Example Foods Ing';
  second.lines.find(line=>line.text==='BILL OF LADING - NOT NEGOTIABLE').text='BILL OF LADING «NOT NEGOTIABLE';
  return {documentId:'generic-shipping-layout',pages:[{id:'p1',observations:[first,second]}]};
}
