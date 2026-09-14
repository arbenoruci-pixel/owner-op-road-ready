import {isDocumentParty} from './fieldGuards.js';

// Domain behavior lives in explicit profiles. The engine has no load/business API.
const identifier = label => new RegExp(`^\\s*(?:${label})[ \\t]*(?:NUMBER\\b|NO\\b\\.?|ID\\b|#|:)[ \\t:#]*(.+?)\\s*$`, 'id');
const labeled = label => new RegExp(`^[\\s|]*(?:${label})[ \\t]*[:#]?[ \\t]+(.+?)\\s*$`, 'id');
const field = (label, pattern, kind='text', required=false) => ({label,pattern,kind,required});
const beside=(label,pattern,kind,rightLabel,required=false)=>({...field(label,pattern,kind,required),rightLabel});
const labeledAmount=label=>new RegExp(`^[\\s|]*(?:${label})[ \\t]*:?[ \\t]+([$€£]?[ \\t]*\\d[\\d.,]*(?:[ \\t]+(?:USD|EUR|GBP|CAD|AUD|CHF))?)[ \\t|]*$`,'id');
const dateToken=/^(?:\d{1,4}(?:[-/.][A-Za-z0-9]+){2}|\d{1,2} [A-Za-z]+ \d{4})(?:[ T]\d[^\s|]*)?(?=\s|$)/;

export const PROFILES = Object.freeze([
  {
    id:'invoice', label:'Invoice',partyKeys:['vendor'],
    heading:/^\s*(?:(?:commercial|tax|sales)\s+)?invoice\s*(?:$|[#:]|no\b|number\b)/i,
    signals:[/^\s*(?:subtotal|sub total)\b/im,/^\s*(?:total|amount due|balance due)\b/im],
    identity:'invoiceNumber',
    fields:{
      invoiceNumber:field('Invoice number',identifier('INVOICE'),'identifier',true),
      vendor:field('Vendor',labeled('VENDOR|SELLER|SUPPLIER'),'party'),
      invoiceDate:field('Invoice date',labeled('INVOICE DATE|DATE'),'date'),
      subtotal:field('Subtotal',labeled('SUBTOTAL|SUB TOTAL'),'amount'),
      tax:field('Tax',labeled('TAX|VAT'),'amount'),
      total:field('Total',labeled('GRAND TOTAL|TOTAL AMOUNT|TOTAL|AMOUNT DUE'),'amount',true),
      currency:field('Currency',labeled('CURRENCY'),'currency',true),
    },
  },
  {
    id:'bol', label:'Bill of lading',partyKeys:['shipper','consignee'],heading:/^\s*(?:straight\s+)?bill\s+of\s+lading\b\s*(?:$|[#:]|no\b|number\b|[-–—«»:]?\s*not\s+negotiable\b)/i,
    signals:[/^\s*(?:ship\s*from|shipper)\b/im,/^\s*(?:ship\s*to|consignee)\b/im],
    structuralSignals:[/^\s*(?:SHIP\s*FROM|FROM)\s*:/i,/^\s*CONSIGNED(?:\s+TO)?\s*:?\s*$/i,/^\s*CARRIER\s*:/i,/^\s*TOTAL\s+(?:NET\s+)?WEIGHT\s*:/i,/\b(?:THIS|ORIGINAL)\s+BILL\s+OF\s+LADING\b/i],
    identity:'bolNumber',
    fields:{
      bolNumber:{...field('BOL number',identifier('BOL|B/L|BILL OF LADING'),'identifier',true),maxY:.4,inlineLabel:/(?:^|[\s|])(?:BOL|B\/L|BILL OF LADING)[ \t]*(?:NUMBER\b|NO\b\.?|ID\b|#|:)[ \t:#]*/i},
      shipper:{...beside('Shipper',labeled('SHIP[ \\t]*FROM|SHIPPER|FROM'),'party',/^\s*(?:SHIP\s*FROM|SHIPPER|FROM)\s*:\s*$/i,true),blockLabel:/^\s*(?:SHIP\s*FROM|SHIPPER)\s*[:.]*\s*$/i},
      consignee:{...beside('Consignee',labeled('SHIP[ \\t]*TO|CONSIGNEE|CONSIGNED TO'),'party',/^\s*(?:SHIP\s*TO|CONSIGNEE|CONSIGNED(?:\s+TO)?)\s*:?\s*$/i,true),blockLabel:/^\s*(?:SHIP\s*TO|CONSIGNEE)\s*[:.]*\s*$/i},
      carrier:beside('Carrier',labeled('CARRIER(?: NAME)?'),'party',/^\s*CARRIER(?:\s+NAME)?\s*:\s*$/i),
      trailerNumber:field('Trailer number',identifier('TRAILER'),'identifier'),
      documentDate:{...beside('Document date',labeled('DATE'),'date',/^\s*DATE\s*:\s*$/i),maxY:.4,inlineLabel:/\bDATE\s*:\s*/i,valuePattern:dateToken},
      poNumber:field('PO number',identifier('PO|P\\.O\\.|PURCHASE ORDER'),'identifier'),
      weight:field('Weight',labeled('TOTAL WEIGHT|WEIGHT'),'weight'),
    },
  },
  {
    id:'unloading_receipt',label:'Unloading receipt',partyKeys:['carrier'],joinPages:false,
    heading:/^\s*(?:(?:LUMPER|UNLOADING)\s+)?RECEIPT\b\s*(?:$|#|NO\b|NUMBER\b)/i,
    signals:[/^\s*LOAD\s+DETAILS\b/i,/\b(?:UNLOADING|LUMPER)\b|^\s*LOAD\s+DESCRIPTION\s*:\s*(?:BREAKDOWN|UNLOAD)/i,/^\s*(?:RELAY\s+PAYMENT\s+DETAILS|CHECKOUT\s+FEE|NET\s+TOTAL)\b/i],
    identity:'receiptNumber',
    fields:{
      receiptNumber:field('Receipt number',/^\s*RECEIPT\s*(?:NUMBER\b|NO\b\.?|#|:)[ \t:#]*([A-Z0-9][A-Z0-9._/-]*)(?=\s*(?:$|\||DATE\b))/id,'identifier',true),
      receiptDate:{...beside('Receipt date',labeled('DATE'),'date',/^\s*DATE\s*:\s*$/i),maxY:.4,inlineLabel:/\bDATE\s*:\s*/i,valuePattern:dateToken},
      carrier:beside('Carrier',labeled('CARRIER'),'party',/^\s*CARRIER\s*:\s*$/i),
      location:beside('Location',labeled('LOCATION'),'text',/^\s*LOCATION\s*:\s*$/i),
      poNumber:beside('PO number',identifier('PO|P\\.O\\.'),'identifier',/^\s*(?:PO|P\.O\.)\s*(?:NO\.?|NUMBER|#)\s*:\s*$/i),
      trailerNumber:beside('Trailer number',identifier('TRAILER'),'identifier',/^\s*TRAILER\s*(?:NO\.?|NUMBER|#)\s*:\s*$/i),
      amount:beside('Unloading amount',labeledAmount('AMOUNT'),'amount',/^\s*AMOUNT\s*:?\s*$/i,true),
      fee:beside('Checkout fee',labeledAmount('CHECKOUT FEE'),'amount',/^\s*CHECKOUT\s+FEE\s*:?\s*$/i),
      total:beside('Receipt total',labeledAmount('NET TOTAL|TOTAL'),'amount',/^\s*(?:NET\s+TOTAL|TOTAL)\s*:?\s*$/i,true),
      currency:field('Currency',labeled('CURRENCY'),'currency'),
    },
  },
]);

export function normalizeValue(kind, raw) {
  const value = raw.trim().replace(/[ \t]+/g,' ');
  if (!value) return {value:null,issue:'empty'};
  if (kind==='party') return isDocumentParty(value)?{value}:{value:null,issue:'form_instructions'};
  if (kind==='identifier') return /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(value) ? {value} : {value:null,issue:'invalid_identifier'};
  if (kind==='currency') return /^(?:USD|EUR|GBP|CAD|AUD|CHF)$/.test(value.toUpperCase()) ? {value:value.toUpperCase()} : {value:null,issue:'ambiguous_currency'};
  if (kind==='amount') {
    // Deliberately reject ambiguous separators ("1,234") and arithmetic guesses.
    const clean = value.replace(/^(?:USD|EUR|GBP|CAD|AUD|CHF)\s*/i,'').replace(/\s*(?:USD|EUR|GBP|CAD|AUD|CHF)$/i,'').replace(/^[$€£]\s*/, '');
    let normalized;
    if (/^\d+(?:\.\d{2})?$/.test(clean)) normalized=clean;
    else if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(clean)) normalized=clean.replace(/,/g,'');
    else if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(clean)) normalized=clean.replace(/\./g,'').replace(',','.');
    else if (/^\d+,\d{2}$/.test(clean)) normalized=clean.replace(',','.');
    else return {value:null,issue:'ambiguous_amount'};
    const [whole, fraction='00'] = normalized.split('.');
    const minor = Number(whole)*100 + Number(fraction);
    return Number.isSafeInteger(minor) ? {value:`${Number(whole)}.${fraction}`,minorUnits:minor} : {value:null,issue:'amount_out_of_range'};
  }
  if (kind==='date') {
    const stamp=value.match(/^(\S+)[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(stamp&&(Number(stamp[2])>23||Number(stamp[3])>59||Number(stamp[4]||0)>59))return {value:null,issue:'invalid_date'};
    const dateText=stamp?stamp[1]:value;
    const named=dateText.match(/^(\d{1,2})[- ](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[- ](\d{4})$/i);
    let match=dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/),year,month,day;
    if(match) [,year,month,day]=match.map(Number);
    else if(named){day=Number(named[1]);month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[2].slice(0,3).toLowerCase())+1;year=Number(named[3]);}
    else {
      match=dateText.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
      if (!match) return {value:null,issue:'unrecognized_date'};
      const a=Number(match[1]),b=Number(match[2]);year=Number(match[3]);
      if(a<=12&&b<=12&&a!==b)return {value:null,issue:'ambiguous_date'};
      [month,day]=a>12?[b,a]:[a,b];
    }
    const date=new Date(Date.UTC(year,month-1,day));
    if(year<1900||year>2199||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return {value:null,issue:'invalid_date'};
    return {value:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
  }
  if (kind==='weight') return /^\d[\d,.]*\s*(?:LB|LBS|KG|KGS)$/i.test(value) ? {value} : {value:null,issue:'weight_unit_required'};
  return value.length<=200 ? {value} : {value:null,issue:'field_too_long'};
}
