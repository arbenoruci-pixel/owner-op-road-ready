// Anonymized geometry from a receipt whose OCR separates labels and values.
export function receiptColumnsInput(){
  const make=(id,damaged=false)=>{
    const row=(text,x,y,width,height=.011)=>({text,box:{x,y,width,height},confidence:.96});
    const lines=[
      row(damaged?'RECEIPT':'REL EIPT',.11,.13,.3,.035),
      row('RECEIPT # RC-51 DATE: 17-Jul-2026',.13,.18,.28),
      row(damaged?'LOAD DETAI Ls':'LOAD DETAILS',.11,.24,.15,.03),
      row('Carrier:',.12,.288,.06),row('Example Transport',.246,.289,.13),
      row('Location:',.12,.32,.075),row('Example Warehouse',.246,.321,.16),
      row('PO No:',.12,.386,.057),row('PO-51',.246,.387,.046),
      row('Load Description: Breakdown pallets',.519,.388,.29),
      row('Trailer No:',.12,.455,.088),row('T-700',.246,.456,.037),
      row('RELAY PAYMENT DETAILS',.11,.533,.25),
      row('Amount',.68,.567,.07),row('$388.00',.836,.568,.051),
      row('Checkout Fee',.642,.594,.111),row('$10.00',.837,.595,.051,.012),
      row('NET TOTAL',.66,.638,.094),row('$398.00',.837,.639,.051),
      row('Total Amount includes other purchase orders covered by this receipt',.107,.85,.37),
    ].map((line,index)=>({id:`line-${index+1}`,...line}));
    return {id,source:'existing-phone-ocr',sourceImageId:`receipt:${id}`,lines};
  };
  return {documentId:'receipt-columns',pages:[{id:'p1',observations:[make('clean',true),make('table'),make('source')]}]};
}
