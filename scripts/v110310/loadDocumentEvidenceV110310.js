import {truckDocumentTypeMetaV1040} from './truckDocumentCatalogV1040.js';

const clean = value => String(value || '').replace(/\s+/g,' ').trim();
const moneyKeys = ['total','gross','grossPay','netPay','actualPay','rate','rateAmount','amount','linehaul','fuelSurcharge','baseCharge','additionalCharges','convenienceFee'];
const totalLabel = /\b(?:(?:total\s+(?:carrier\s+)?(?:pay(?:ment)?|rate|charges)|(?:agreed|flat|freight|carrier|all[ -]?in)\s+rate|carrier\s+(?:compensation|cost)|rate\s+to\s+truck|total\s+compensation))\s*(?:\((?:US\$|USD)\))?\s*[:=$-]?\s*(.*)$/i;
const moneyValue = /^\$?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?=\s|$)/;
const negativeMoney = /administrative|fee\b|fees\b|penalt|deduct|detention|layover|per\s+(?:day|hour|mile)|\/(?:hr|mi|day)|ranging|up\s+to|capping|cap\b|damage|rental|subject\s+to|if\b/i;
function dated(value) {
  const m=String(value).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if(!m)return '';
  const y=Number(m[3].length===2?'20'+m[3]:m[3]),mo=Number(m[1]),d=Number(m[2]),date=new Date(Date.UTC(y,mo-1,d));
  return y>=2000&&y<=2100&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
}
function paymentEvidence(text) {
  const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean),found=[];
  for(let i=0;i<lines.length;i++) {
    const label=lines[i].match(totalLabel);
    if(!label || negativeMoney.test(lines[i]))continue;
    const tail=label[1] || lines[i+1] || '', match=tail.match(moneyValue);
    if(!match || negativeMoney.test(tail))continue;
    const extra=[...tail.slice(match[0].length).matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replaceAll(',','')));
    if(extra.some(n=>n!==Number(match[1].replaceAll(',',''))))continue;
    const value=Number(match[1].replaceAll(',',''));
    if(value>0)found.push({value,source:'document_text',status:'read',fieldLabel:'Agreed carrier pay',excerpt:lines[i]+(!label[1]?'\n'+tail:'')});
  }
  const amounts=[...new Set(found.map(x=>x.value))];
  return amounts.length===1?found[0]:null;
}
export function isTqlInstructionsV110310(text='') {
  return /DRIVER\s*\/\s*CARRIER\s+INFORMATION\s+SHEET/i.test(text) && /\bTQL\s+PO\s*#\s*\d+/i.test(text);
}

function scheduleEvidence(text) {
  const lines=String(text).replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
  const out={pickupDate:'',deliveryDates:[],excerpt:''};
  const index=lines.findIndex(x=>/Pickup\s+Dates?/i.test(x));
  if(index<0)return out;
  // The native PDF may yield either a two-column row or one label/value per line.
  const block=lines.slice(index,index+7).join('\n').split(/TQL\s+CONTACT|CARRIER\s+CONTACT/i)[0];
  const dates=[...block.matchAll(/\b\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\b/g)].map(x=>dated(x[0])).filter(Boolean);
  if(dates.length){out.pickupDate=dates[0];out.deliveryDates=[...new Set(dates.slice(1))];out.excerpt=block.slice(0,350);}
  return out;
}

export function qualifyLoadDocumentV110310(result={}) {
  const text=String(result.text||result.rawText||result.ocrText||'');
  const instructions=isTqlInstructionsV110310(text);
  if(!instructions&&!['rate_confirmation','load_tender'].includes(result.type?.id))return result;
  const fields={...(result.fields||{})},evidence={...(result.fieldEvidence||{})};
  const old=result.evidenceReviewV11036||{},issues=[...(old.issues||[])];
  const payment=paymentEvidence(text);
  for(const key of moneyKeys){delete fields[key];delete evidence[key];}
  // A number appearing in a penalty clause is not evidence for carrier compensation.
  if(payment){fields.total=payment.value;fields.gross=payment.value;evidence.total=payment;evidence.gross=payment;}
  else issues.push('Agreed carrier pay was not found under a payment label. Fees and detention amounts are excluded.');
  let type=result.type;
  if(instructions) {
    const mixed=/\b(?:carrier\s+)?rate\s+confirmation\b/i.test(text) && Boolean(payment);
    if(!mixed && !result.userSelectedTypeV11036)type=truckDocumentTypeMetaV1040('load_tender');
    // Only the broker's labeled PO is its load reference. PU and delivery PO remain separate.
    const refs=[...new Set([...text.matchAll(/\bTQL\s+PO\s*#\s*(\d{5,12})\b/gi)].map(x=>x[1]))];
    for(const key of ['loadNo','orderNo','poNumber','purchaseOrder','broker','documentDate','date','pickupDate','deliveryDate','trailerNo','vendor','merchant','receiptCategory','receiptNo','invoiceNo','bolNo','exceptionText']){delete fields[key];delete evidence[key];}
    if(refs.length===1){
      const excerpt=text.split(/\r?\n/).find(x=>/TQL\s+PO\s*#/i.test(x))?.trim()||'';
      for(const key of ['loadNo','orderNo','poNumber']){fields[key]=refs[0];evidence[key]={value:refs[0],source:'document_text',status:'read',fieldLabel:key==='poNumber'?'TQL PO number':'TQL load reference',excerpt};}
      fields.references=[{kind:'load_number',value:refs[0],source:'TQL PO label'}];
    }else{fields.references=[];issues.push('Multiple TQL PO numbers appear in this packet. Choose the load after reviewing each page.');}
    fields.broker='Total Quality Logistics (TQL)';
    evidence.broker={value:fields.broker,source:'document_text',status:'read',fieldLabel:'Broker',excerpt:'TQL CONTACT INFO'};
    const schedule=scheduleEvidence(text);
    if(schedule.pickupDate){
      fields.pickupDate=schedule.pickupDate;fields.documentDate=schedule.pickupDate;fields.date=schedule.pickupDate;fields.filingDateSource='pickup_date';
      evidence.pickupDate={value:schedule.pickupDate,source:'document_text',status:'read',fieldLabel:'Pickup date',excerpt:schedule.excerpt};
      evidence.documentDate={...evidence.pickupDate,fieldLabel:'Filing date (pickup date)'};evidence.date=evidence.documentDate;
    }
    fields.deliveryDates=schedule.deliveryDates;
    if(schedule.deliveryDates[0]){fields.deliveryDate=schedule.deliveryDates[0];evidence.deliveryDate={value:fields.deliveryDate,source:'document_text',status:'read',fieldLabel:'First delivery date',excerpt:schedule.excerpt};}
    if(schedule.deliveryDates.length>1)issues.push('Multiple delivery dates were read. Review delivery and trailer-return stops separately.');
    const pickupBlock=text.split(/\bPICKUPS\b/i)[1]?.split(/\bDROPS\b/i)[0]||'';
    const place=pickupBlock.match(/^\s*([A-Z][A-Z .'-]{1,45}),\s*([A-Z]{2})\s+(\d{5})/im);
    if(place){fields.origin=`${place[1].trim()}, ${place[2]}`;evidence.origin={value:fields.origin,source:'document_text',status:'read',fieldLabel:'Pickup location',excerpt:place[0].trim()};}
    const pickup=pickupBlock.match(/\b[A-Z]{2}\s+\d{5}\s+(\d{5,16})\s+\d{1,2}\/\d{1,2}\/\d{4}/i);
    if(pickup){fields.pickupNumber=pickup[1];evidence.pickupNumber={value:pickup[1],source:'document_text',status:'read',fieldLabel:'Pickup number (PU#)',excerpt:pickup[0]};}
    const carrierBlock=text.split(/CARRIER\s+CONTACT/i)[1]?.split(/LOAD\s+INFORMATION/i)[0]||'';
    const carrier=carrierBlock.match(/^\s*([A-Z][^\n]*?\b(?:LLC|INC|LTD|CORP)\b(?:\s*\([^\n)]+\))?)/im);
    if(carrier){fields.carrierName=carrier[1].trim();evidence.carrierName={value:fields.carrierName,source:'document_text',status:'read',fieldLabel:'Carrier',excerpt:carrier[0].trim()};}
    const weight=text.match(/Estimated\s+Weight\s+(\d[\d,]*)/i);
    if(weight){fields.weight=Number(weight[1].replaceAll(',',''));evidence.weight={value:fields.weight,source:'document_text',status:'read',fieldLabel:'Estimated weight',excerpt:weight[0]};}
    if(!payment)issues.push('Driver/carrier instructions: this sheet does not establish an agreed transport price.');
  }
  delete fields.fieldConfidence;delete fields.fieldEvidence;
  const remainingIssues=issues.filter(x=>!/^\s*(?:total|gross|load No|document Date|date): verify against the image\./i.test(x));
  return {...result,type,detectedType:type,fields,fieldEvidence:evidence,actions:[],routing:{...(result.routing||{}),autoFile:false},
    method:String(result.method||'').includes('load-document-evidence-v110310')?result.method:`${result.method||'reader'}+load-document-evidence-v110310`,
    fieldConfidence:Object.fromEntries(Object.entries(result.fieldConfidence||{}).filter(([key])=>!moneyKeys.includes(key))),
    needsReview:true,loadDocumentEvidenceV110310:{instructions,paymentVerified:Boolean(payment),filingDateSource:fields.filingDateSource||''},
    evidenceReviewV11036:{...old,evidence,issues:[...new Set(remainingIssues)]},
  };
}
