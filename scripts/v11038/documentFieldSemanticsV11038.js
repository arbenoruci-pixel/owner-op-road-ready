const SHIPPING_TYPES = new Set(['bol','pod','delivery_receipt']);
const ID_LABELS = {
  bolNo:'(?:B[O0]L|B[\\/]L|BILL[ \\t]+OF[ \\t]+LADING)[ \\t]*(?:N[O0]\\.?|NUMBER|#)',
  loadNo:'(?:LOAD|SHIPMENT|TRIP)[ \\t]*(?:N[O0]\\.?|NUMBER|#)',
  orderNo:'(?<!PURCHASE[ \\t])ORDER[ \\t]*(?:N[O0]\\.?|NUMBER|#)',
  poNumber:'(?:CUSTOMER[ \\t]+)?(?:P\\.?[ \\t]*O\\.?|PURCHASE[ \\t]+ORDER)(?:[ \\t]*(?:NUMBERS?|N[O0]\\.?|#))?',
  proNumber:'PRO[ \\t]*(?:N[O0]\\.?|NUMBER|#)',
  pickupNumber:'PICK[ \\t]*UP[ \\t]*(?:N[O0]\\.?|NUMBER|#)',
  trailerNo:'TRAILER(?:[ \\t]*(?:N[O0]\\.?|NUMBER|#))?',
  sealNo:'SEAL(?:[ \\t]*(?:N[O0]\\.?|NUMBER|#))?',
};
const LABELS = {
  bolNo:'BOL number',loadNo:'Load number on document',orderNo:'Order number',poNumber:'PO number',poNumbers:'PO numbers',proNumber:'PRO number',pickupNumber:'Pickup number',trailerNo:'Trailer number',sealNo:'Seal number',
  documentDate:'Document date',date:'Document date',pickupDate:'Ship date',deliveryDate:'Delivery date',weight:'Total weight',weightUnit:'Weight unit',totalPieces:'Total pieces',
  shipper:'Shipper',consignee:'Consignee',origin:'Ship from',destination:'Ship to',carrierName:'Carrier',broker:'Broker',email:'Contact email',phone:'Contact phone',
  freightCharges:'Freight charges',codAmount:'COD amount',total:'Total amount',gross:'Gross pay',gallons:'Gallons',pricePerGallon:'Price per gallon',merchant:'Merchant',vendor:'Vendor',invoiceNo:'Invoice number',receiptNo:'Receipt number',transactionId:'Transaction ID',cityState:'Location',state:'State',unitNumber:'Unit number',truckNumber:'Truck number',vin:'VIN',odometer:'Odometer',commodity:'Commodity',serviceDescription:'Service description',labor:'Labor',parts:'Parts',netPay:'Net pay',actualPay:'Net pay',deductions:'Deductions',receiverName:'Receiver',receivedBy:'Received by',damageNote:'Damage notes',exceptionText:'Document note',fuelType:'Fuel type',equipment:'Equipment',linehaul:'Linehaul',fuelSurcharge:'Fuel surcharge',routeSummary:'Route',stopCount:'Stops',deliveryCount:'Deliveries',carrierName:'Carrier',
};
const internal = /^(?:needs|documentText|intelligence|routing|validation|packet|raw|text|method|source|loadAssignment|field|signature|podSigned)/i;
const isRef = value => /\d/.test(value) && /^[A-Z0-9][A-Z0-9._/-]{2,31}$/i.test(value) &&
  !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d+\.\d{2}$/.test(value);

function labeledValues(lines,label,parse) {
  const re=new RegExp(`(^|[^A-Z0-9])(${label})(?=$|[ \\t:#.\\-])(?:[ \\t]*[:#.-])?[ \\t]*(.*)$`,'i');
  const found=[];
  for(let i=0;i<lines.length;i++) {
    const match=lines[i].match(re);
    if(!match)continue;
    // A next-line value is accepted only when the label's line has no value.
    const tail=match[3].trim(),valueLine=tail || lines[i+1] || '';
    const parsed=parse(valueLine);
    for(const value of Array.isArray(parsed)?parsed:parsed==null?[]:[parsed])found.push({value,source:'document_text',status:'read',label:match[2],excerpt:(lines[i]+(!tail?'\n'+valueLine:'')).slice(0,260)});
  }
  return [...new Map(found.map(item=>[String(item.value),item])).values()];
}
function readRefs(lines,label,multiple=false) {
  return labeledValues(lines,label,line=>{
    const first=line.match(/^([A-Z0-9][A-Z0-9._/-]{2,31})(?=$|[\s,;|])/i)?.[1];
    if(!first||!isRef(first))return [];
    if(!multiple)return first.toUpperCase();
    const values=[first];let remaining=line.slice(first.length);
    while(true){const next=remaining.match(/^\s*(?:[,;|/]|\s{2,})\s*([A-Z0-9][A-Z0-9._/-]{2,31})(?=$|[\s,;|])/i);if(!next||!isRef(next[1]))break;values.push(next[1]);remaining=remaining.slice(next[0].length);}
    return values.map(value=>value.toUpperCase());
  });
}
function dateValue(value) {
  const hit=value.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2}))(?=$|\s)/);
  if(!hit)return null;
  const y=Number(hit[1]|| (hit[6].length===2?'20'+hit[6]:hit[6])),m=Number(hit[2]||hit[4]),d=Number(hit[3]||hit[5]);
  const date=new Date(Date.UTC(y,m-1,d));
  return y>=1990&&y<=2100&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
}
function numberValue(value) {const hit=value.match(/^(?:\$\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)(?=$|\s)/);return hit?Number(hit[1].replaceAll(',','')):null;}

export function qualifyDocumentFieldsV11038(result={}) {
  const type=result.type?.id||'other';
  if(!SHIPPING_TYPES.has(type))return result;
  const text=String(result.text||result.rawText||result.ocrText||'');
  const lines=text.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
  const previous=result.fields||{},fields={},evidence={},issues=[];
  function put(key,items) {
    if(items.length===1){fields[key]=items[0].value;evidence[key]={...items[0],fieldLabel:LABELS[key]||key};}
    else if(items.length>1)issues.push(`More than one ${LABELS[key]||key} was read. Check the original.`);
  }
  for(const [key,label] of Object.entries(ID_LABELS)) {
    const items=readRefs(lines,label,key==='poNumber');
    if(key==='poNumber'&&items.length>1){fields.poNumbers=items.map(item=>item.value);evidence.poNumbers={value:fields.poNumbers.join(', '),source:'document_text',status:'read',fieldLabel:'PO numbers',excerpt:items.map(item=>item.excerpt).join('\n').slice(0,350)};}
    else put(key,items);
  }
  const dates={documentDate:'(?:DOCUMENT[ \\t]+DATE|BOL[ \\t]+DATE|^DATE)',pickupDate:'(?:SHIP(?:MENT)?|PICK[ \\t]*UP)[ \\t]+DATE',deliveryDate:'(?:DELIVERY[ \\t]+DATE|DATE[ \\t]+DELIVERED|DELIVERED[ \\t]+ON)'};
  // Bare DATE must start the line; DELIVERY DATE is a separate field.
  put('documentDate',labeledValues(lines,dates.documentDate,dateValue));
  for(const key of ['pickupDate','deliveryDate'])put(key,labeledValues(lines,dates[key],dateValue));
  if(!fields.documentDate&&fields.pickupDate&&type==='bol'){fields.documentDate=fields.pickupDate;evidence.documentDate={...evidence.pickupDate,fieldLabel:'Document date',status:'read'};}
  if(!fields.documentDate&&fields.deliveryDate&&type==='pod'){fields.documentDate=fields.deliveryDate;evidence.documentDate={...evidence.deliveryDate,fieldLabel:'Document date'};}
  if(fields.documentDate)fields.date=fields.documentDate;
  put('weight',labeledValues(lines,'(?:TOTAL[ \\t]+(?:GROSS[ \\t]+)?WEIGHT|GROSS[ \\t]+WEIGHT)',numberValue));
  if(evidence.weight){const unit=evidence.weight.excerpt.match(/\b(LBS?|POUNDS?|KGS?|KILOGRAMS?)\b/i)?.[1];if(unit)fields.weightUnit=/^K/i.test(unit)?'kg':'lb';}
  put('totalPieces',labeledValues(lines,'TOTAL[ \\t]+(?:PIECES|PACKAGES|PALLETS)',numberValue));
  put('freightCharges',labeledValues(lines,'(?:TOTAL[ \\t]+)?FREIGHT[ \\t]+CHARGES?',numberValue));
  put('codAmount',labeledValues(lines,'C\\.?O\\.?D\\.?[ \\t]+AMOUNT',numberValue));
  for(const [key,label] of Object.entries({shipper:'(?:SHIP[ \\t]+FROM|SHIPPER)',consignee:'(?:SHIP[ \\t]+TO|CONSIGNEE)',carrierName:'(?:MOTOR[ \\t]+)?CARRIER(?:[ \\t]+NAME)?',broker:'BROKER(?:[ \\t]+NAME)?'})) {
    put(key,labeledValues(lines,'^(?:'+label+')',line=>{
      const value=line.split(/\s{2,}|\s+(?:SHIP TO|SHIP FROM|BOL NO|LOAD NO|DATE|CARRIER|BROKER)\s*[:#]/i)[0].replace(/^[^A-Z0-9]+/i,'').trim();
      return /[A-Z]{2}/i.test(value)&&value.length>=3&&value.length<=100&&!/^(?:SIGNATURE|NUMBER|N\/?A|COLLECT|PREPAID|NAME)\b/i.test(value)?value:null;
    }));
  }
  if(fields.shipper)fields.origin=fields.shipper;
  if(fields.consignee)fields.destination=fields.consignee;
  // Contact values can be preserved as contacts, without assigning a party role.
  for(const key of ['email','phone','commodity','receiverName','receivedBy','damageNote','exceptionText']) {
    const value=String(previous[key]||'').trim();
    if(value.length>=4&&lines.some(line=>line.includes(value)))fields[key]=previous[key];
  }
  fields.podSigned=false;fields.podSignedEvidence=false;fields.signaturePresent=false;
  fields.references=Object.entries(ID_LABELS).flatMap(([key])=>fields[key]?[{kind:{bolNo:'bol_number',loadNo:'load_number',orderNo:'order_number',poNumber:'po_number',pickupNumber:'pickup_number',proNumber:'pro_number'}[key]||key,value:fields[key],source:'labeled_document_text'}]:[]);
  for(const value of fields.poNumbers||[])fields.references.push({kind:'po_number',value,source:'labeled_document_text'});
  if(!fields.bolNo)issues.push('BOL number was not verified from its label. Check the original.');
  if(!fields.documentDate)issues.push('Document date was not read. Enter it after checking the original.');
  if(type==='pod')issues.push('Check the receiver signature on the original. OCR does not verify a signature.');
  const removed=Object.keys(previous).filter(key=>previous[key]!==undefined&&previous[key]!==''&&previous[key]!==false&&fields[key]===undefined&&!internal.test(key));
  if(previous.total||previous.gross)issues.push('Unverified payment fields were removed from this shipping document.');
  const oldReview=result.evidenceReviewV11036||{};
  const oldIssues=(oldReview.issues||[]).filter(issue=>!/verify against the image|shipping sections and BOL heading/i.test(issue));
  return {...result,fields,needsReview:result.needsReview===true||issues.length>0,
    fieldEvidence:evidence,fieldConfidence:{},
    semanticFieldsV11038:{version:'110.3.8',removedFields:removed},
    evidenceReviewV11036:{...oldReview,suggestedLoad:null,method:'labeled-fields-v11038',evidence,issues:[...new Set([...oldIssues,...issues])]},
    routing:{...(result.routing||{}),autoFile:false},
  };
}

export function documentFieldRowsV11038(result={}) {
  const fields=result.fields||{};
  return Object.entries(fields).filter(([key,value])=>LABELS[key]&&!internal.test(key)&&value!==''&&value!=null&&typeof value!=='boolean'&&
    (typeof value!=='object'||Array.isArray(value))&&!(key==='date'&&fields.documentDate)&&!(key==='origin'&&fields.shipper===value)&&!(key==='destination'&&fields.consignee===value))
    .map(([key,value])=>({key,label:LABELS[key],value:Array.isArray(value)?value.join(', '):String(value)}));
}
