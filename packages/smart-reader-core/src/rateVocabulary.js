// Shared label vocabulary. Match whole labels; fee/unit prices never imply
// an agreed total. Every value still retains the original source substring.
export const totalRateLabel=String.raw`(?:TOTAL\s+(?:CARRIER\s+(?:TOTAL\s+)?(?:PAY(?:MENT)?|RATE|COMPENSATION)|RATE|PAY(?:MENT)?|COMPENSATION|FREIGHT(?:\s+(?:CHARGES|RATE))?|CHARGES|AMOUNT(?:\s+DUE)?)|CARRIER\s+(?:TOTAL\s+)?(?:PAY(?:MENT)?|RATE|COMPENSATION)|ALL[ -]IN(?:\s+(?:RATE|TOTAL|PAY))?|AGREED(?:\s+CARRIER)?\s+(?:RATE|PAY)|(?:CONTRACT|CONFIRMED|FLAT)\s+RATE|LOAD\s+(?:RATE|PAY|TOTAL)|RATE\s+TOTAL|GRAND\s+TOTAL|RATE\s*\(\$\)|TOTAL|RATE)`;
export const loadNumberLabel=String.raw`(?:PRO|LOAD|ORDER|SHIPMENT|TRIP|REFERENCE|REF\.?|CONFIRMATION)\s*(?:NUMBER\b|NUM\b|NO\b\.?|ID\b|#|:)`;
export const amountValue=String.raw`(?:[$€£]\s*|(?:USD|EUR|GBP|CAD|AUD|CHF)\s*)?\d[\d.,]*(?:\s+(?:USD|EUR|GBP|CAD|AUD|CHF))?`;
export const totalRatePattern=new RegExp(String.raw`^\s*${totalRateLabel}(?:\s*[:=–—-]\s*|\s+|(?=[$€£]))(${amountValue})\s*$`,'id');
export const totalRateSignal=new RegExp(String.raw`^\s*${totalRateLabel}(?:(?:\s*[:=–—-]\s*|\s+|(?=[$€£]))${amountValue})?\s*:?[ \t]*$`,'i');
export const rateHeading=/^\s*(?:(?:PRO|LOAD|ORDER|SHIPMENT)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)\s*[:#]?\s*[A-Z0-9][A-Z0-9._/-]*\s+)?(?:(?:BROKER\s*[/&-]\s*)?CARRIER\s+)?(?:RATE\s*(?:CONFIRMATION|CON|AGREEMENT)|(?:LOAD|FREIGHT|SHIPMENT)\s+CONFIRMATION)(?:\s+(?:FOR\s+)?(?:LOAD|PRO|ORDER|PO|SHIPMENT)\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)\s*[:#]?\s*[A-Z0-9][A-Z0-9._/-]*)?\s*$/i;
export const pickupLabel=/^\s*(?:ROUTE\s+)?(?:PICK[ -]?UP|PICK|SHIPPER|ORIGIN|LOAD(?:ING)?\s+(?:AT|LOCATION))(?=\s|:|$)/i;
export const deliveryLabel=/^\s*(?:DELIVERY|DELIVER|DROP(?:[ -]?OFF)?|CONSIGNEE|DESTINATION|UNLOAD(?:ING)?\s+(?:AT|LOCATION)|STOP)(?=\s|:|$)/i;
export const namedDate=String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}`;
export const dateValue=new RegExp(String.raw`^(?:${namedDate}|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})$`,'i');
export const hasRateTitle=lines=>lines.slice(0,20).some(line=>rateHeading.test(line.text));
export const hasRateStructure=lines=>hasRateTitle(lines)&&lines.some(l=>pickupLabel.test(l.text))&&lines.some(l=>deliveryLabel.test(l.text))&&lines.some(l=>totalRateSignal.test(l.text));
