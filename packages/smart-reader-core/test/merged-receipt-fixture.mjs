// Synthetic receipt with the same multi-column row structure as phone OCR.
export function mergedReceiptInput(){
  const row=(text,y)=>({text,confidence:.96,box:{x:.10,y,width:.80,height:.012}});
  return {documentId:'synthetic-merged-receipt',pages:[{id:'receipt',observations:[{
    id:'clean-page',source:'synthetic-phone-ocr',sourceImageId:'receipt-image',lines:[
      row('Example Unload Services',.09),
      row('RECEIPT # R-17 DATE: 17-Jul-2026',.18),
      row('LOAD DETAILS',.25),
      row('Carrier: Example Transport',.29),
      row('Location: Example City, IL',.32),
      row('Department: Freezer Door No: 32',.35),
      row('PO No: ORDER-22 Load Description: Breakdown',.39),
      row('Truck No: T-22 Bad Pallets: 0',.42),
      row('Trailer No: T-700 Restacks: 0',.45),
      row('Started At: 10:52 AM Completed At: 12:11 PM',.48),
      row('RELAY PAYMENT DETAILS',.53),
      row('Amount $180.00',.57),
      row('Checkout Fee $5.00',.59),
      row('THANK YOU FOR YOUR BUSINESS NET TOTAL $185.00',.64),
      row('TERMS & CONDITIONS',.72),
      row('Total Amount includes other purchase orders.',.85),
      row('NOTE: THIS IS NOT A BILL. PLEASE DO NOT PAY FROM THIS DOCUMENT.',.90),
    ],
  }]}]};
}
