import {isDocumentParty} from './fieldGuards.js';

// Domain behavior lives in explicit profiles. The engine has no load/business API.
const identifier = label => new RegExp(`^\\s*(?:${label})[ \\t]*(?:NUMBER\\b|NO\\b\\.?|ID\\b|#|:)[ \\t:#]*(.+?)\\s*$`, 'id');
const labeled = label => new RegExp(`^\\s*(?:${label})[ \\t]*[:#]?[ \\t]+(.+?)\\s*$`, 'id');
const field = (label, pattern, kind='text', required=false) => ({label,pattern,kind,required});

export const PROFILES = Object.freeze([
  {
    id:'invoice', label:'Invoice',
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
    id:'bol', label:'Bill of lading',heading:/^\s*(?:straight\s+)?bill\s+of\s+lading\b\s*(?:$|[#:]|no\b|number\b|[-–—«»:]?\s*not\s+negotiable\b)/i,
    signals:[/^\s*(?:ship\s*from|shipper)\b/im,/^\s*(?:ship\s*to|consignee)\b/im],
    identity:'bolNumber',
    fields:{
      bolNumber:field('BOL number',identifier('BOL|B/L|BILL OF LADING'),'identifier',true),
      shipper:{...field('Shipper',labeled('SHIP[ \\t]*FROM|SHIPPER'),'party',true),blockLabel:/^\s*(?:SHIP\s*FROM|SHIPPER)\s*[:.]*\s*$/i},
      consignee:{...field('Consignee',labeled('SHIP[ \\t]*TO|CONSIGNEE'),'party',true),blockLabel:/^\s*(?:SHIP\s*TO|CONSIGNEE)\s*[:.]*\s*$/i},
      carrier:field('Carrier',labeled('CARRIER(?: NAME)?'),'party'),
      trailerNumber:field('Trailer number',identifier('TRAILER'),'identifier'),
      documentDate:field('Document date',labeled('DATE'),'date'),
      poNumber:field('PO number',identifier('PO|P\\.O\\.|PURCHASE ORDER'),'identifier'),
      weight:field('Weight',labeled('TOTAL WEIGHT|WEIGHT'),'weight'),
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
    let match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/),year,month,day;
    if(match) [,year,month,day]=match.map(Number);
    else {
      match=value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
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
