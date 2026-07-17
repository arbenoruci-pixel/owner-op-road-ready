import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v || 0)));
const clean = v => String(v || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const line = v => String(v || '').replace(/^[\s:#\-–—|]+|[\s|]+$/g, '').replace(/\s{2,}/g, ' ').trim();
const test = (p, t) => { try { p.lastIndex = 0; return p.test(t); } catch { return false; } };
const num = v => { const n = Number(String(v ?? '').replace(/[OoQqDd]/g, '0').replace(/[Il|!]/g, '1').replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const first = (text, patterns = [], group = 1) => { for (const p of patterns) { const m = String(text || '').match(p); if (m?.[group]) return line(m[group]); } return ''; };
const label = (text, labels = []) => { for (const l of labels) { const m = String(text || '').match(new RegExp(`(?:^|\\n)\\s*(?:${l})\\s*[:#-]\\s*([^\\n]{1,150})`, 'i')); if (m?.[1]) return line(m[1]); } return ''; };
const date = (text, labels = []) => { for (const l of labels) { const m = String(text || '').match(new RegExp(`(?:${l})\\s*(?:date)?\\s*[:#-]?\\s*(\\d{1,2}[\\/-]\\d{1,2}[\\/-](?:\\d{2}|\\d{4}))`, 'i')); if (m?.[1]) return m[1]; } return ''; };
const money = (text, labels = []) => { for (const l of labels) { const m = String(text || '').match(new RegExp(`(?:${l})\\s*(?:amount|charge|cost|total)?\\s*[:#-]?\\s*\\$?\\s*([0-9OoQqDdIl|!,]+(?:\\.\\d{2,3})?)`, 'i')); const n = num(m?.[1]); if (n > 0 && n < 1e7) return Math.round(n * 100) / 100; } return 0; };
const opId = v => { const x = String(v || '').toUpperCase().replace(/[^A-Z0-9._/-]/g, ''); return x.length >= 3 && x.length <= 48 && /\d/.test(x) ? x : ''; };
const uniqTypes = xs => [...new Map(xs.filter(Boolean).map(x => [x.id, x])).values()];

const VENDORS = [
  ['Capstone Logistics', /capstone\s+logistics|capstonepay|apex\s+security\s+management/i],
  ['Relay Payments', /relay\s+payments?|relaypay/i], ['Comchek / Comdata', /comchek|comdata/i],
  ['EFS', /\bEFS\b|efs\s+(?:check|money|code|payment)/i], ['T-Chek', /t-?chek/i],
  ['Pilot Flying J', /pilot\s+flying\s+j|pilot\s+travel\s+centers?|flying\s+j/i],
  ["Love's", /love'?s\s+(?:travel\s+stops?|truck\s+care)|\blove'?s\b/i],
  ['TA / Petro', /travelcenters\s+of\s+america|\bTA\s+(?:express|travel)|petro\s+stopping\s+centers?|\bPETRO\b/i],
  ['Mudflap', /\bmudflap\b/i], ['Open Roads / TSD', /open\s+roads|tsd\s+logistics/i],
  ['Road Ranger', /road\s+ranger/i], ['Sapp Bros.', /sapp\s+bros/i], ['Maverik', /\bmaverik\b/i],
  ["Casey's", /casey'?s/i], ['Circle K', /circle\s+k/i], ['Kwik Trip', /kwik\s+trip/i],
  ['QuikTrip', /quiktrip|\bQT\b/i], ['CAT Scale', /\bCAT\s+scale\b/i],
];
const vendor = text => VENDORS.find(([, p]) => test(p, text))?.[0] || '';

function scoreProfile({ id, typeId, text, threshold, positive, negative = [], vendorName = '', data = {} }) {
  let score = 0; const evidence = []; const penalties = [];
  for (const [p, w, name] of positive) if (test(p, text)) { score += w; evidence.push(name); }
  for (const [p, w, name] of negative) if (test(p, text)) { score -= w; penalties.push(name); }
  return { id, typeId, vendor:vendorName, score, threshold, strong:score >= threshold,
    confidence:clamp(.44 + Math.max(0, score - threshold) / 145 + evidence.length * .018, .44, .995), evidence, negative:penalties, data };
}

function lumper(text) {
  const v = vendor(text); const capstone = v === 'Capstone Logistics';
  const p = scoreProfile({ id:capstone ? 'capstone-lumper-receipt' : v === 'Relay Payments' ? 'relay-lumper-payment' : 'warehouse-lumper-receipt', typeId:'lumper_receipt', text,
    threshold:capstone ? 78 : 88, vendorName:v, positive:[
      [/capstone\s+logistics|capstonepay/i,92,'Capstone'], [/relay\s+payments?/i,72,'Relay'],
      [/\blumper\b|lumper\s+receipt/i,78,'lumper'], [/unloading\s+(?:receipt|fee|service|charge)|warehouse\s+(?:unloading|service)/i,62,'unloading'],
      [/receipt\s*(?:number|no\.?|#)/i,18,'receipt #'], [/work\s+date/i,20,'work date'], [/\blocation\s*:/i,12,'location'],
      [/bill\s+code/i,16,'bill code'], [/\bdock\s*:/i,12,'dock'], [/\bdoor\s*:/i,12,'door'], [/purchase\s+orders?|\bPO\s*#/i,12,'PO'],
      [/total\s+initial\s+pallets?|total\s+finished\s+pallets?/i,20,'pallets'], [/total\s+case\s+count/i,18,'cases'],
      [/tractor\s+number|trailer\s+number/i,12,'tractor/trailer'], [/base\s+charge/i,22,'base charge'],
      [/total\s+add(?:itional|l)?\s+charges?/i,18,'add charges'], [/total\s+cost/i,24,'total cost'],
      [/convenience\s+fee|restack|pinwheel|breakdown|sort(?:ing)?\s+fee/i,14,'fee detail'],
      [/express\s+code|money\s+code|payment\s+code|authorization\s*(?:number|no\.?|#)/i,18,'payment code'],
    ], negative:[
      [/carrier\s+rate\s+confirmation|rate\s*(?:&|and)\s*load\s+confirmation|\bRATE\s+CONFIRMATION\b/i,115,'rate title'],
      [/total\s+carrier\s+pay|agreed\s+(?:amount|rate)|line\s*haul|fuel\s+surcharge/i,70,'rate fields'],
      [/price\s*(?:per|\/)\s*(?:gal|gallon)|\bgallons?\b.{0,40}\bdiesel\b/is,55,'fuel fields'],
    ] });
  const structure = p.evidence.filter(x => !['Capstone','Relay','lumper','unloading'].includes(x)).length;
  if ((v && structure >= 3) || (capstone && structure >= 2)) p.score += 42;
  p.strong = p.score >= p.threshold; p.confidence = clamp(p.confidence + (p.strong ? .08 : 0)); p.data = { structureCount:structure };
  return p;
}

function rateCon(text) {
  const p = scoreProfile({ id:'carrier-rate-confirmation', typeId:'rate_confirmation', text, threshold:104, positive:[
    [/carrier\s+rate\s+confirmation/i,105,'Carrier Rate Confirmation'], [/\bRATE\s+CONFIRMATION\b/i,96,'Rate Confirmation'],
    [/rate\s*(?:&|and)\s*load\s+confirmation/i,102,'Rate & Load Confirmation'], [/(?:transportation|dispatch|load)\s+confirmation/i,82,'load confirmation'],
    [/broker\s*[-/]?\s*carrier\s+(?:confirmation|agreement)/i,72,'broker-carrier'], [/rate\s+agreement/i,45,'rate agreement'],
    [/(?:load|order|trip|shipment)\s*(?:number|no\.?|#)|\bPO\s*(?:number|no\.?|#)/i,20,'load id'],
    [/\bbroker\b|logistics\s+coordinator|carrier\s+sales|customer\s+contact/i,18,'broker'],
    [/\bcarrier\b\s*(?:name|:)|motor\s+carrier|carrier\s+phone/i,16,'carrier'],
    [/total\s+carrier\s+pay|agreed\s+(?:amount|rate)|rate\s+details|line\s*haul|fuel\s+surcharge|all[- ]?in\s+rate/i,35,'rate block'],
    [/\bpick\s*up\b|\bpickup\b|\bload\s+at\b|\borigin\b|\bshipper\b/i,18,'pickup'],
    [/\bdeliver(?:y|\s+to)?\b|\bdestination\b|\bconsignee\b/i,18,'delivery'],
    [/\bequipment\b|trailer\s+type|dry\s+van|reefer|flatbed|power\s+only/i,12,'equipment'],
    [/quick\s*pay|invoice\s+instructions|payment\s+terms|tracking\s+requirements?|detention\s+terms?|carrier\s+instructions/i,12,'terms'],
  ], negative:[
    [/capstone\s+logistics|capstonepay/i,140,'Capstone'], [/receipt\s*(?:number|no\.?|#)[\s\S]{0,160}work\s+date/i,82,'receipt/work date'],
    [/total\s+initial\s+pallets?|total\s+case\s+count|\bdock\s*:|\bdoor\s*:|base\s+charge|total\s+cost/i,92,'warehouse receipt'],
    [/\bgallons?\b|price\s*(?:per|\/)\s*(?:gal|gallon)|pump\s*(?:number|no\.?|#)/i,65,'fuel receipt'],
    [/bill\s+of\s+lading|\bB\s*\/\s*L\s*(?:NO|NUMBER|#)|product\s+code[\s\S]{0,160}(?:qty|quantity)\s+shipped/is,75,'BOL'],
    [/repair\s+(?:order|invoice)|work\s+performed|parts\s+total|labor\s+total/i,70,'repair'],
  ] });
  const groups = p.evidence.filter(x => ['load id','broker','carrier','rate block','pickup','delivery','equipment','terms'].includes(x)).length;
  if (groups >= 5) p.score += 30; if (groups >= 7) p.score += 28;
  p.strong = p.score >= p.threshold; p.data = { groupCount:groups }; return p;
}

function fuel(text) {
  const v = vendor(text); const known = /Pilot|Love|TA|Petro|Mudflap|Open Roads|Road Ranger|Sapp|Maverik|Casey|Circle K|Kwik Trip|QuikTrip/i.test(v);
  const statement = test(/fuel\s+card\s+statement|statement\s+period|transaction\s+detail/i, text);
  const p = scoreProfile({ id:statement ? 'fuel-card-transaction-statement' : 'retail-digital-fuel-receipt', typeId:statement ? 'fuel_card_statement' : 'fuel_receipt', text, threshold:92, vendorName:v, positive:[
    [/fuel\s+receipt|diesel\s+receipt/i,72,'fuel title'], [/\bdiesel\b|fuel\s+type|product\s*:\s*(?:ULSD|DSL|DIESEL)|\bDEF\b|reefer\s+fuel/i,34,'fuel type'],
    [/\bgallons?\b|\bGAL\b|quantity\s*(?:gal|gallons)?/i,34,'gallons'], [/price\s*(?:per|\/)\s*(?:gal|gallon)|PPG|unit\s+price/i,32,'price/gal'],
    [/pump\s*(?:number|no\.?|#)|fueling\s+location|store\s*(?:number|no\.?|#)|site\s*(?:number|no\.?|#)/i,16,'pump/site'],
    [/transaction\s*(?:id|number|no\.?|#)|authorization\s*(?:id|number|no\.?|#)|receipt\s*(?:number|no\.?|#)/i,14,'transaction'],
    [/truck|tractor|unit\s*(?:number|no\.?|#)|vehicle/i,12,'vehicle'], [/amount\s+paid|fuel\s+total|transaction\s+total|grand\s+total|total\s+sale/i,18,'total'],
    [/fuel\s+card\s+statement|statement\s+period|transaction\s+detail/i,55,'statement'],
  ], negative:[
    [/carrier\s+rate\s+confirmation|total\s+carrier\s+pay|line\s*haul|fuel\s+surcharge/i,90,'rate'],
    [/capstone\s+logistics|total\s+initial\s+pallets?|base\s+charge|unloading\s+fee/i,90,'lumper'],
    [/bill\s+of\s+lading|\bB\s*\/\s*L\s*(?:NO|NUMBER|#)/i,70,'BOL'],
  ] });
  if (known) { p.score += 34; p.evidence.push(`fuel vendor ${v}`); }
  const groups = p.evidence.filter(x => ['fuel type','gallons','price/gal','pump/site','transaction','vehicle','total'].includes(x)).length;
  if (groups >= 4) p.score += 24; if (groups >= 6) p.score += 24;
  p.strong = p.score >= p.threshold; p.data = { groupCount:groups }; return p;
}

function repair(text) {
  const p = scoreProfile({ id:'repair-service-invoice', typeId:'repair_invoice', text, threshold:90, vendorName:vendor(text), positive:[
    [/repair\s+(?:order|invoice)|service\s+invoice|work\s+order/i,80,'repair title'], [/\bVIN\b|vehicle\s+identification/i,18,'VIN'],
    [/odometer|mileage\s*(?:in|out)?/i,18,'odometer'], [/labor\s*(?:hours|total|amount)?|technician/i,24,'labor'],
    [/parts\s*(?:total|amount)?|part\s+number/i,22,'parts'], [/work\s+performed|complaint|cause|correction|service\s+description/i,20,'work'],
    [/invoice\s*(?:number|no\.?|#)|repair\s+order\s*(?:number|no\.?|#)/i,16,'invoice #'], [/amount\s+due|invoice\s+total|grand\s+total|total\s+due/i,18,'total'],
    [/shop\s+supplies|environmental\s+fee|core\s+charge|roadside\s+service|towing/i,12,'shop charges'],
  ], negative:[
    [/carrier\s+rate\s+confirmation|total\s+carrier\s+pay|pickup[\s\S]{0,200}delivery/is,85,'rate'],
    [/\bgallons?\b|price\s*(?:per|\/)\s*(?:gal|gallon)/i,60,'fuel'], [/capstone\s+logistics|unloading\s+fee|total\s+initial\s+pallets?/i,75,'lumper'],
  ] });
  if (p.evidence.length >= 5) p.score += 24; p.strong = p.score >= p.threshold; return p;
}

function scale(text) {
  const p = scoreProfile({ id:'certified-scale-ticket', typeId:'scale_ticket', text, threshold:88, vendorName:vendor(text), positive:[
    [/\bCAT\s+scale\b/i,92,'CAT Scale'], [/certified\s+(?:automated\s+)?truck\s+scale|certified\s+weight/i,70,'certified scale'],
    [/steer\s+axle/i,35,'steer axle'], [/drive\s+axle/i,35,'drive axle'], [/trailer\s+axle/i,35,'trailer axle'], [/gross\s+weight/i,20,'gross weight'], [/reweigh/i,14,'reweigh'],
  ] }); if (p.evidence.length >= 3) p.score += 24; p.strong = p.score >= p.threshold; return p;
}

export function inspectDocumentTemplatesV1042({ text = '', fileName = '' } = {}) {
  const source = clean(`${fileName}\n${text}`);
  return [lumper(source), rateCon(source), fuel(source), repair(source), scale(source)].sort((a,b) => b.score-a.score || Number(b.strong)-Number(a.strong));
}

export function arbitrateDocumentTemplatesV1042(classification = {}, options = {}) {
  const preferred = String(options.preferredType || 'auto');
  const candidates = inspectDocumentTemplatesV1042({ text:options.text || '', fileName:options.fileName || '' });
  const top = candidates[0]; const currentId = classification?.type?.id || 'other';
  if (preferred !== 'auto' || !top) return { ...classification, templateProfileV1042:top, templateCandidatesV1042:candidates.slice(0,5) };
  const currentScore = Number(candidates.find(x => x.typeId === currentId)?.score || 0);
  const protectedType = ['pod','bol','delivery_receipt','osd_report','claim_notice','driver_license','medical_card','registration','insurance','annual_inspection'].includes(currentId);
  const exactLumper = top.typeId === 'lumper_receipt' && top.score >= top.threshold + 60;
  const mayOverride = !protectedType || (exactLumper && !['pod','osd_report','claim_notice'].includes(currentId));
  let nextId = currentId; let reason = '';
  if (top.strong && mayOverride) {
    const rateMistake = currentId === 'rate_confirmation' && ['lumper_receipt','fuel_receipt','fuel_card_statement','repair_invoice','scale_ticket'].includes(top.typeId);
    const generic = ['other','other_expense','load_tender'].includes(currentId);
    if (rateMistake || generic || top.score-currentScore >= 24 || top.score >= top.threshold+34) {
      nextId = top.typeId; reason = rateMistake ? `${top.vendor || top.id} receipt structure overruled the rate-confirmation guess.` : `${top.vendor || top.id} structure was stronger.`;
    }
  }
  if (currentId === 'lumper_receipt' && top.typeId === 'rate_confirmation' && top.strong && top.score-currentScore >= 35) { nextId='rate_confirmation'; reason='Broker, stops and carrier-pay fields identify a rate confirmation.'; }
  if (nextId === currentId) return { ...classification, templateProfileV1042:top, templateCandidatesV1042:candidates.slice(0,5) };
  const type = truckDocumentTypeMetaV1040(nextId);
  return { ...classification, type, confidence:Math.max(Number(classification.confidence||0),top.confidence),
    alternatives:uniqTypes([type, classification.type, ...(classification.alternatives||[]), ...candidates.filter(x=>x.strong).map(x=>truckDocumentTypeMetaV1040(x.typeId))]).slice(0,8),
    lowEvidence:false, autoCorrected:true, templateProfileV1042:top, templateCandidatesV1042:candidates.slice(0,5),
    templateArbitrationV1042:{version:'104.2',from:currentId,to:nextId,reason} };
}

function sanitizeLumper(text, f) {
  const v=vendor(text)||f.merchant||'Lumper / unloading service';
  const receiptNo=opId(first(text,[/receipt\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,48})/i,/transaction\s*(?:number|no\.?|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,48})/i]));
  const workDate=date(text,['work','service','receipt','transaction','date']);
  const po=opId(first(text,[/purchase\s+orders?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i,/\bP\.?O\.?\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i]));
  const bol=opId(first(text,[/(?:B\/?L|BOL|bill\s+of\s+lading)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i]));
  const total=money(text,['total\\s+cost','grand\\s+total','total\\s+charges?','amount\\s+paid','receipt\\s+total'])||f.total||0;
  return {...f,merchant:v,vendor:v,receiptNo:receiptNo||f.receiptNo||'',approvalNo:receiptNo||f.approvalNo||'',date:workDate||f.date||'',workDate:workDate||f.workDate||'',
    location:label(text,['location','facility','warehouse','site'])||f.location||f.cityState||'',billCode:opId(label(text,['bill\\s+code']))||f.billCode||'',
    carrierName:label(text,['carrier'])||f.carrierName||'',dock:label(text,['dock'])||f.dock||'',door:label(text,['door'])||f.door||'',purchaseOrder:po||f.purchaseOrder||'',poNumber:po||f.poNumber||'',
    bolNo:bol||f.bolNo||'',loadNo:bol||po||opId(f.loadNo),trailerNo:opId(label(text,['trailer\\s+number','trailer']))||f.trailerNo||'',unitNumber:opId(label(text,['tractor\\s+number','tractor','truck\\s+number','unit\\s+number']))||f.unitNumber||'',
    initialPallets:num(first(text,[/total\s+initial\s+pallets?\s*[:#-]?\s*([\d,.]+)/i]))||f.initialPallets||0,finishedPallets:num(first(text,[/total\s+finished\s+pallets?\s*[:#-]?\s*([\d,.]+)/i]))||f.finishedPallets||0,
    caseCount:num(first(text,[/total\s+case\s+count\s*[:#-]?\s*([\d,.]+)/i]))||f.caseCount||0,baseCharge:money(text,['base\\s+charge','unloading\\s+(?:fee|charge)','lumper\\s+(?:fee|charge)'])||f.baseCharge||0,
    additionalCharges:money(text,['total\\s+add(?:itional|l)?\\s+charges?','additional\\s+charges?'])||f.additionalCharges||0,convenienceFee:money(text,['convenience\\s+fee','processing\\s+fee'])||f.convenienceFee||0,total,
    gross:'',grossPay:'',netPay:'',linehaul:'',fuelSurcharge:'',broker:'',origin:'',destination:'',receiptCategory:'Lumper / unloading'};
}

function sanitizeFuel(text,f){
  const fuelType=first(text,[/(?:fuel\s+type|product)\s*[:#-]?\s*(ULSD|DIESEL|REEFER\s+FUEL|DEF|GASOLINE|CNG|LNG)/i,/\b(ULSD|DIESEL|REEFER\s+FUEL|DEF)\b/i]).toUpperCase();
  const gallons=num(first(text,[/(?:gallons?|quantity|qty)\s*[:#-]?\s*([\d,.]+)\s*(?:GAL|GALLONS?)?/i,/([\d,.]+)\s*(?:GAL|GALLONS?)\b/i]))||f.gallons||0;
  const ppg=num(first(text,[/(?:price\s*(?:per|\/)\s*(?:gal|gallon)|PPG|unit\s+price)\s*[:#-]?\s*\$?\s*([\d,.]+)/i]))||f.pricePerGallon||0;
  const total=money(text,['amount\\s+paid','fuel\\s+total','transaction\\s+total','grand\\s+total','total\\s+sale','receipt\\s+total'])||f.total||0;
  const merchant=vendor(text)||String(text).split('\n').map(line).find(x=>x.length>=3&&x.length<=70&&/[A-Za-z]{3}/.test(x)&&!/receipt|transaction|invoice|date|time|pump|diesel|gallons|total|amount|auth|card/i.test(x))||f.merchant||'';
  const cityState=first(text,[/\b([A-Za-z][A-Za-z .'-]{2,40},\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/])||f.cityState||''; const state=first(cityState,[/\b([A-Z]{2})\b/])||f.state||'';
  const unit=opId(first(text,[/(?:truck|tractor|unit|vehicle)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{1,16})/i]))||f.unitNumber||f.truckNumber||'';
  const purchaser=label(text,['purchaser','driver','customer'])||f.purchaserName||f.driverName||''; const eligible=!/\bDEF\b/i.test(fuelType)&&!/REEFER/i.test(fuelType);
  const missing=[['date',date(text,['transaction','purchase','receipt','date'])||f.date],['seller',merchant],['jurisdiction',state],['gallons',gallons],['fuelType',fuelType],['priceOrTotal',ppg||total],['unitNumber',unit],['purchaser',purchaser]].filter(([,v])=>!v).map(([k])=>k);
  return {...f,date:date(text,['transaction','purchase','receipt','date'])||f.date||'',merchant,fuelProvider:merchant,cityState,state,gallons,pricePerGallon:ppg,total,unitNumber:unit,fuelType,purchaserName:purchaser,iftaEligible:eligible,iftaMissingFields:missing,iftaReady:eligible&&missing.length===0,gross:'',grossPay:'',netPay:'',linehaul:'',fuelSurcharge:'',broker:'',origin:'',destination:''};
}

function sanitizeRate(text,f){ const labeled=money(text,['total\\s+carrier\\s+pay','agreed\\s+(?:amount|rate)','all[- ]?in\\s+rate','total\\s+rate','carrier\\s+pay']); const lh=money(text,['line\\s*haul']); const fs=money(text,['fuel\\s+surcharge','\\bFSC\\b']); const total=labeled||((lh||fs)?lh+fs:f.total||f.gross||0); return {...f,total,gross:total,grossPay:total,linehaul:lh||f.linehaul||0,fuelSurcharge:fs||f.fuelSurcharge||0,receiptNo:'',workDate:'',billCode:'',dock:'',door:'',initialPallets:0,finishedPallets:0,caseCount:0,baseCharge:0,additionalCharges:0,convenienceFee:0}; }
function sanitizeRepair(text,f){ return {...f,invoiceNo:opId(first(text,[/(?:invoice|repair\s+order|work\s+order)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})/i]))||f.invoiceNo||'',total:money(text,['amount\\s+due','invoice\\s+total','grand\\s+total','total\\s+due'])||f.total||0,labor:money(text,['labor\\s+total','\\blabor\\b'])||f.labor||0,parts:money(text,['parts\\s+total','\\bparts\\b'])||f.parts||0,vin:first(text,[/\bVIN\s*[:#-]?\s*([A-HJ-NPR-Z0-9]{17})\b/i,/\b([A-HJ-NPR-Z0-9]{17})\b/])||f.vin||'',odometer:num(first(text,[/(?:odometer|mileage)\s*[:#-]?\s*([\d,]{2,9})/i]))||f.odometer||0,unitNumber:opId(first(text,[/(?:truck|tractor|unit)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{1,16})/i]))||f.unitNumber||'',serviceDescription:label(text,['work\\s+performed','service\\s+description','complaint','correction'])||f.serviceDescription||'',gross:'',grossPay:'',netPay:'',linehaul:'',fuelSurcharge:'',broker:'',origin:'',destination:''}; }

export function sanitizeTemplateFieldsV1042(typeId='other',text='',fields={}){
  if(typeId==='lumper_receipt')return sanitizeLumper(clean(text),fields);
  if(typeId==='fuel_receipt'||typeId==='fuel_card_statement')return sanitizeFuel(clean(text),fields);
  if(typeId==='rate_confirmation')return sanitizeRate(clean(text),fields);
  if(['repair_invoice','roadside_service','tire_receipt','pm_service_record'].includes(typeId))return sanitizeRepair(clean(text),fields);
  return fields;
}

export const TRUCK_TEMPLATE_LIBRARY_V1042=Object.freeze({version:'104.2.0',profiles:['Capstone/Relay/Comchek/EFS lumper receipts','carrier rate/load confirmations','VICS and signed-BOL POD','IFTA retail/digital fuel receipts','repair/service invoices','CAT/certified scale tickets']});
