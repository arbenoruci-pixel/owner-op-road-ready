// These helpers return original OCR lines. They never verify handwriting or
// infer completion from a blank signature label.
const clean=line=>line.text.trim();
const name=value=>/^[\p{L}][\p{L} .’'-]*$/u.test(value)&&/[\p{L}]/u.test(value)
  &&!/\b(?:unsigned|pending|none|unknown|date|signature|print|name|sign|here|required|not|driver|shipper|carrier)\b|^N\s*A$/i.test(value);

function pickupSection(lines,index){
  for(let i=index-1;i>=Math.max(0,index-4);i--){
    const line=clean(lines[i]);
    if(/^(?:DELIVERY|RECEIVER|CONSIGNEE)\b/i.test(line))return false;
    if(/^(?:(?:PICKUP|PICK UP)(?: ACKNOWLEDGEMENT| ACKNOWLEDGMENT| RECEIPT)?|(?:DRIVER|SHIPPER|CARRIER)(?:'S)? (?:SIGNATURE|ACKNOWLEDGEMENT|ACKNOWLEDGMENT))\s*:?$/i.test(line))return true;
  }
  return false;
}

export function deliveryEvidence(lines){
  for(let i=0;i<lines.length;i++){
    const value=clean(lines[i]);
    const received=/^(?:RECEIVED BY|ACCEPTED BY|(?:RECEIVER|CONSIGNEE)(?:'S)? SIGNATURE)\s*(?::\s*|\s+)(.+)$/i.exec(value);
    if(received&&name(received[1].trim())&&!pickupSection(lines,i))return [lines[i]];
    const signed=/^SIGNED BY\s*(?::\s*|\s+)(.+)$/i.exec(value);
    if(!signed||!name(signed[1].trim()))continue;
    // A generic Signed By field belongs to delivery only inside an explicit
    // delivery section. Pickup/driver signatures cannot complete a BOL.
    for(let j=i-1;j>=Math.max(0,i-4);j--){
      if(/^(?:DRIVER|SHIPPER|CARRIER|PICKUP|PICK UP)\b/i.test(clean(lines[j])))break;
      if(/^(?:DELIVERY (?:ACKNOWLEDGEMENT|ACKNOWLEDGMENT|ACCEPTANCE)|RECEIVER ACKNOWLEDGEMENT|CONSIGNEE RECEIPT)\s*:?$/i.test(clean(lines[j])))return [lines[j],lines[i]];
    }
  }
  return null;
}

export function fuelReceiptEvidence(lines){
  const find=pattern=>lines.find(line=>pattern.test(clean(line)));
  const receipt=find(/^(?:(?:FUEL|DIESEL|SALES|PAYMENT) )?RECEIPT\b|^CUSTOMER COPY\b/i);
  const total=find(/^(?:(?:NET|GRAND|FUEL)\s+)?(?:TOTAL(?: AMOUNT)?|AMOUNT PAID)\s*:?\s*[$€£]?\s*\d[\d,.]*\b/i);
  const payment=find(/^(?:PAID|PAYMENT|CARD|VISA|MASTERCARD|TRANSACTION)\b/i);
  const product=find(/\b(?:DIESEL|ULSD|DEF|GASOLINE)\b/i);
  const volume=find(/\b(?:GALLONS?|GAL)\b|^VOLUME\s*:?\s*\d/i);
  const unitPrice=find(/\b(?:PRICE\s*(?:\/|PER)\s*GAL(?:LON)?|PPG)\b/i);
  const pump=find(/^PUMP\s*(?:NO\.?|NUMBER|#|:)?\s*\d+\b/i);
  const groups=[product,volume,unitPrice,pump].filter(Boolean);
  if(!total||!(receipt||payment)||groups.length<2||!(product||unitPrice&&pump))return null;
  return [...new Set([receipt||payment,total,...groups])];
}
