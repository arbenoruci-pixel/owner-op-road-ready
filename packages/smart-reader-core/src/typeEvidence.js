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

// A received stamp often names the consignee above a generic SIGNATURE field.
// Keep this a reviewable OCR interpretation, with all original source lines.
export function receiverStampEvidence(lines){
  const words=value=>value.toUpperCase().match(/[A-Z]+/g)?.filter(word=>word.length>2&&!['THE','AND','INC','LLC','LTD','CORP'].includes(word))||[];
  const pickupSection=text=>/\b(?:PICK\s*UP|DRIVER|CARRIER|SHIPPER|CONSIGNOR)\b.*\b(?:SIGNATURE|ACKNOWLEDGEMENT|ACKNOWLEDGMENT)\b|^PICK\s*UP\b/i.test(text);
  const sameColumn=(a,b)=>!a.box&&!b.box||!!a.box&&!!b.box&&
    Math.min(a.box.x+a.box.width,b.box.x+b.box.width)-Math.max(a.box.x,b.box.x)>=Math.min(a.box.width,b.box.width)*.5;
  const below=(a,b,max)=>!a.box&&!b.box||!!a.box&&!!b.box&&b.box.y>=a.box.y-a.box.height&&b.box.y-a.box.y<=max;
  const recipients=[];
  for(let i=0;i<lines.length;i++){
    // A colon can disappear in OCR; final E/S confusion is confined to this
    // printed label. The named receiver and local signature are still needed.
    const label=/^(?:CONSIGNE[ES]|SHIP\s+TO)(?=\s|:|$)\s*:?\s*(.*)$/i.exec(clean(lines[i]));
    if(!label)continue;
    if(label[1].trim())recipients.push({label:lines[i],line:lines[i],words:words(label[1])});
    else for(const next of lines.slice(i+1,i+3)){
      // A separately boxed value must sit on the same row, right of its label.
      if(lines[i].box&&next.box&&(Math.abs(lines[i].box.y-next.box.y)>.02||next.box.x<lines[i].box.x+lines[i].box.width-.01))continue;
      if(/\b(?:SHIPPER|CARRIER|SIGNATURE|RECEIVED|ADDRESS)\b|\d/i.test(clean(next)))continue;
      recipients.push({label:lines[i],line:next,words:words(clean(next))});
    }
  }
  for(let i=0;i<lines.length;i++){
    const stamp=lines[i];
    if(!/^(?:RECEIVED|(?:IN|OUT)\b.{0,60}\bRECEIVED)\s*:?$/i.test(clean(stamp)))continue;
    if(signatureSection(lines,i)?.role==='pickup')continue;
    for(let j=i+1;j<Math.min(lines.length,i+5);j++){
      const company=lines[j],tokens=words(clean(company));
      if(pickupSection(clean(company)))break;
      const recipient=recipients.find(item=>item.words.length>=2&&tokens.length>=2&&item.words[0]===tokens[0]&&item.words[1]===tokens[1]);
      if(!recipient||recipient.line===company||!sameColumn(stamp,company)||!below(stamp,company,.07))continue;
      for(let k=j+1;k<Math.min(lines.length,i+10);k++){
        const line=lines[k],text=clean(line);
        if(pickupSection(text))break;
        const signed=/^SIGNATURE\s*(?::\s*|\s+)(.+)$/i.exec(text);
        if(signed&&name(signed[1].trim())&&sameColumn(company,line)&&below(stamp,line,.16))
          return [...new Set([recipient.label,recipient.line,stamp,company,line])];
      }
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
