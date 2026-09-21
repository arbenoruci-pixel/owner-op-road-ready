export const row=(text,x,y,width=.13,height=.012,confidence=.96)=>({text,confidence,box:{x,y,width,height}});
export function packingInput({tilt=0}={}){
  const lines=[row('Packing Slip',.78,.08,.16,.025),row('Ship To:',.05,.19),
    row('Packing Slip Number:',.35,.12,.15),row('700012345',.64,.12+tilt,.08),
    row('Order Number:',.35,.18),row('0012345',.64,.18+tilt,.06),
    row('Order Date:',.35,.20),row('07/08/2026',.64,.20+tilt,.08),
    row('Customer Number:',.35,.22),row('CUSTOMER01',.64,.22+tilt,.08),
    row('Customer PO:',.35,.24),row('902468',.64,.24+tilt,.06),
    row('Ship Date:',.35,.26),row('07/08/2026',.64,.26+tilt,.08)];
  return {documentId:'packing',pages:[{id:'p1',observations:['clean','table'].map(id=>({id,sourceImageId:id+'-image',lines:structuredClone(lines)}))}]};
}

export function identityPacketInput(){
  const textPage=(number,text)=>({id:'p'+number,observations:[{id:'clean',sourceImageId:'p'+number+'-clean',
    lines:text.split('\n').map((text,i)=>row(text,.06,.04+i*.035,.88,.018))}]});
  const packingPage=(number,tilt=0)=>{const page=packingInput({tilt}).pages[0];page.id='p'+number;
    for(const o of page.observations)o.sourceImageId=page.id+'-'+o.id;return page;};
  return {documentId:'identity-packet',pages:[
    textPage(1,'ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM\nShip From: Example Shipping\nShip To: Example Receiving'),
    packingPage(2),packingPage(3),packingPage(4,.012),
    textPage(5,'Below, This Bil of Lading is not subject to filed tariffs.\nCARRIER: Example Carrier\nFROM: Example Shipping\nCONSIGNED\nTO: Example Receiving\nTOTAL NET WEIGHT: 1234.56\nPO#: 2046'),
  ]};
}
