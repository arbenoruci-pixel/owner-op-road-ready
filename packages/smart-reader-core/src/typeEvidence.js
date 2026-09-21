// These helpers return original OCR lines. They never verify handwriting or
// infer completion from a blank signature label.
const clean=line=>line.text.trim();
const name=value=>/^[\p{L}][\p{L} .’'-]*$/u.test(value)&&/[\p{L}]/u.test(value)
  &&!/\b(?:unsigned|pending|none|unknown|date|signature|print|name|sign|here|required|not|driver|shipper|carrier)\b|^N\s*A$/i.test(value);

function signatureSection(lines,index){
  // A section owns all following fields until another explicit signature
  // section begins. Date/time/location rows never end pickup ownership.
  for(let i=index-1;i>=0;i--){
    const line=clean(lines[i]);
    if(/^(?:DELIVERY (?:ACKNOWLEDGEMENT|ACKNOWLEDGMENT|ACCEPTANCE)|(?:RECEIVER|CONSIGNEE)(?:'S)? (?:SIGNATURE|ACKNOWLEDGEMENT|ACKNOWLEDGMENT|RECEIPT))\s*:?$/i.test(line))return {role:'delivery',line:lines[i]};
    if(/^(?:(?:PICKUP|PICK UP)(?: ACKNOWLEDGEMENT| ACKNOWLEDGMENT| RECEIPT)?|(?:DRIVER|SHIPPER|CARRIER)(?:'S)? (?:SIGNATURE|ACKNOWLEDGEMENT|ACKNOWLEDGMENT))\s*(?::.*)?$/i.test(line))return {role:'pickup',line:lines[i]};
  }
  return null;
}

export function deliveryEvidence(lines){
  for(let i=0;i<lines.length;i++){
    const value=clean(lines[i]);
    const received=/^(?:RECEIVED BY|ACCEPTED BY|(?:RECEIVER|CONSIGNEE)(?:'S)? SIGNATURE)\s*(?::\s*|\s+)(.+)$/i.exec(value);
    const signed=/^SIGNED BY\s*(?::\s*|\s+)(.+)$/i.exec(value);
    const signature=received||signed;
    if(!signature||!name(signature[1].trim()))continue;
    const section=signatureSection(lines,i);
    if(received&&section?.role!=='pickup')return [...(section?[section.line]:[]),lines[i]];
    // A generic Signed By field belongs to delivery only inside an explicit
    // delivery section. Pickup/driver signatures cannot complete a BOL.
    if(section?.role==='delivery')return [section.line,lines[i]];
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
