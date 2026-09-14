import {shippingLayoutInput} from './shipping-layout-fixture.mjs';
export function mixedPacketInput(){
  const first=shippingLayoutInput().pages[0];first.id='p1';first.observations.splice(1);
  first.observations[0].lines.find(line=>line.text==='Example Foods Ing').text='Example Foods Inc';
  first.observations[0].lines.push(
    {text:'——',box:{x:.07,y:.110,width:.05,height:.002},confidence:.2},
    {text:'UO ———',box:{x:.18,y:.111,width:.17,height:.002},confidence:.08},
    {text:'Shipper Sign. be cand',box:{x:.07,y:.805,width:.15,height:.01},confidence:.55},
    {text:'Carrier acki',box:{x:.63,y:.82,width:.12,height:.01},confidence:.77});
  const row=(text,x,y,width,height=.01)=>({text,box:{x,y,width,height},confidence:.96});
  const page=(id,lines)=>({id,observations:[{id:'layout',source:'generic-phone-fixture',sourceImageId:'image-'+id,lines}]});
  const second=page('p2',[
    row('This Bill of Lading is subject to the shipping terms.',.03,.07,.52),
    row('DATE:',.79,.12,.034),row('07/14/2026 07:41:00',.84,.12,.11),
    row('CARRIER:',.04,.18,.07),row('Example Logistics',.16,.18,.20),
    row('FROM:',.04,.20,.05),row('Northern Foods',.16,.20,.18),
    row('CONSIGNED',.04,.24,.09),row('Western Market',.16,.24,.20),row('TO:',.04,.26,.03),
    row('Carrier acknowledges and agrees to the terms.',.04,.30,.50),
    row('PO#: ORDER-22',.05,.55,.25),
    row('TOTAL NET WEIGHT:',.45,.85,.20),row('3400 LB',.72,.85,.12),
  ]);
  const third=page('p3',[
    row('UNLOADING RECEIPT',.1,.1,.35,.02),row('RECEIPT # R-17',.1,.18,.18),row('DATE: 17-Jul-2026',.3,.18,.18),
    row('LOAD DETAILS',.11,.25,.2),
    row('Carrier:',.12,.29,.07),row('Example Transport',.25,.29,.19),
    row('Location:',.12,.32,.08),row('Example City, IL',.25,.32,.18),
    row('Trailer No:',.12,.45,.09),row('T-700',.25,.45,.07),
    row('RELAY PAYMENT DETAILS',.11,.53,.35),
    row('Amount',.69,.57,.07),row('$180.00',.83,.57,.08),
    row('Checkout Fee',.64,.59,.12),row('$5.00',.83,.59,.06),
    row('NET TOTAL',.66,.64,.10),row('$185.00',.83,.64,.08),
    row('Total Amount includes other purchase orders.',.1,.85,.45),
  ]);
  return {documentId:'generic-mixed-packet',pages:[first,second,third]};
}
