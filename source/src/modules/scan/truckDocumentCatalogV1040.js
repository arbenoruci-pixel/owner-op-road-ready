const FAMILY = Object.freeze({
  load: { id:'load', label:'Load paperwork', icon:'🚛' },
  billing: { id:'billing', label:'Billing & factoring', icon:'💵' },
  fuel_ifta: { id:'fuel_ifta', label:'Fuel & IFTA', icon:'⛽' },
  maintenance: { id:'maintenance', label:'Maintenance', icon:'🔧' },
  driver: { id:'driver', label:'Driver compliance', icon:'🪪' },
  equipment: { id:'equipment', label:'Truck & trailer', icon:'🚚' },
  broker: { id:'broker', label:'Broker & carrier setup', icon:'🤝' },
  business: { id:'business', label:'Business & tax', icon:'🏢' },
  claims: { id:'claims', label:'Claims & incidents', icon:'🛡️' },
  other: { id:'other', label:'Smart Inbox', icon:'📥' },
});

export const TRUCK_DOCUMENT_STACKS_V1040 = Object.freeze({
  smart_inbox:{ id:'smart_inbox', label:'Smart Inbox', short:'Inbox' },
  load_folder:{ id:'load_folder', label:'Load Folder', short:'Load' },
  billing:{ id:'billing', label:'Billing Ready', short:'Billing' },
  factoring:{ id:'factoring', label:'Factoring Packet', short:'Factoring' },
  logbook:{ id:'logbook', label:'Logbook Supporting Docs', short:'Logbook' },
  ifta:{ id:'ifta', label:'IFTA Quarter', short:'IFTA' },
  expenses:{ id:'expenses', label:'Expenses', short:'Expense' },
  maintenance:{ id:'maintenance', label:'Maintenance History', short:'Maintenance' },
  driver_wallet:{ id:'driver_wallet', label:'Driver Wallet', short:'Driver' },
  truck_wallet:{ id:'truck_wallet', label:'Truck / Trailer Wallet', short:'Equipment' },
  broker_profile:{ id:'broker_profile', label:'Broker Profile', short:'Broker' },
  business:{ id:'business', label:'Business Documents', short:'Business' },
  tax:{ id:'tax', label:'Tax Records', short:'Tax' },
  claims:{ id:'claims', label:'Claim Evidence', short:'Claim' },
});

function t(id, label, short, family, target, documentType, stacks, signals, options = {}) {
  return Object.freeze({
    id, label, short, family, target, documentType, stacks,
    signals:signals || [],
    negativeSignals:options.negativeSignals || [],
    fileSignals:options.fileSignals || [],
    required:options.required || [],
    minScore:Number(options.minScore || 22),
    priority:Number(options.priority || 0),
    linkable:options.linkable !== false && stacks.includes('logbook'),
    description:options.description || '',
  });
}

export const TRUCK_DOCUMENT_TYPES_V1040 = Object.freeze([
  t('rate_confirmation','Rate Confirmation','Rate Con','load','loads','other',['load_folder','billing','factoring','logbook'],[
    [/rate\s+confirmation/i,75],[/carrier\s+rate/i,55],[/total\s+(?:carrier\s+)?pay/i,50],[/load\s*(?:number|no\.?|#)/i,20],
    [/(?:pickup|load\s+at).{0,80}(?:deliver|delivery|deliver\s+to)/is,28],[/linehaul/i,16],[/fuel\s+surcharge/i,14],
  ],{ required:['loadNo','broker','total','origin','destination'], fileSignals:[/rate.?con|load.?confirm/i], priority:40 }),
  t('load_tender','Load Tender','Tender','load','loads','other',['load_folder','logbook'],[
    [/load\s+tender/i,70],[/tender\s+(?:offer|details)/i,45],[/accept\s+(?:load|tender)/i,24],[/shipment\s+offer/i,30],
  ],{ required:['loadNo','origin','destination'], fileSignals:[/tender/i], priority:20 }),
  t('bol','Bill of Lading','BOL','load','documents','bol',['load_folder','billing','factoring','logbook'],[
    [/bill\s+of\s+lading/i,80],[/\bB\/?L\b\s*(?:no|number|#)/i,40],[/\bshipper\b.{0,160}\bconsignee\b/is,36],
    [/\bfreight\s+charges\b/i,14],[/\bseal\s*(?:no|number|#)/i,12],
  ],{ required:['loadNo','origin','destination'], fileSignals:[/\bbol\b|bill.?of.?lading/i], priority:35 }),
  t('pod','Proof of Delivery','POD','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/proof\s+of\s+delivery/i,90],[/\bPOD\b/i,42],[/(?:received|delivered)\s+by/i,38],[/receiver\s+signature/i,42],
    [/signed\s+by/i,34],[/delivery\s+receipt/i,35],
  ],{ required:['loadNo','signaturePresent'], fileSignals:[/\bpod\b|proof.?of.?delivery|signed.?bol/i], priority:50 }),
  t('delivery_receipt','Delivery Receipt','Delivery','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/delivery\s+receipt/i,75],[/received\s+in\s+good\s+order/i,35],[/consignee\s+signature/i,32],
  ],{ required:['loadNo'], fileSignals:[/delivery.?receipt/i], priority:28 }),
  t('packing_list','Packing List','Packing','load','documents','other',['load_folder','billing'],[
    [/packing\s+list/i,80],[/carton|pallet|quantity|sku/i,14],[/ship\s+to/i,12],
  ],{ required:['loadNo'], fileSignals:[/packing.?list/i] }),
  t('lumper_receipt','Lumper Receipt','Lumper','load','expenses','other',['load_folder','expenses','billing','factoring','logbook'],[
    [/lumper/i,80],[/capstone\s+logistics/i,48],[/unloading\s+(?:fee|service)/i,35],[/dock\s+fee/i,28],
  ],{ required:['total','date'], fileSignals:[/lumper/i], priority:35 }),
  t('detention_approval','Detention Approval','Detention','load','expenses','other',['load_folder','billing','factoring','logbook'],[
    [/detention/i,62],[/(?:approved|authorization).{0,40}(?:amount|hours|detention)/is,40],[/check\s*in|check\s*out/i,12],
  ],{ required:['loadNo','total'], fileSignals:[/detention/i], priority:26 }),
  t('tonu','Truck Ordered Not Used','TONU','load','expenses','other',['load_folder','billing','factoring','logbook'],[
    [/\bTONU\b/i,90],[/truck\s+ordered\s+not\s+used/i,90],[/cancel(?:led|lation).{0,60}(?:fee|truck)/is,26],
  ],{ required:['loadNo','total'], fileSignals:[/tonu/i], priority:40 }),
  t('layover_approval','Layover Approval','Layover','load','expenses','other',['load_folder','billing','factoring','logbook'],[
    [/layover/i,70],[/(?:approved|authorization).{0,50}layover/is,35],[/overnight\s+delay/i,20],
  ],{ required:['loadNo','total'], fileSignals:[/layover/i], priority:24 }),
  t('scale_ticket','Scale Ticket','Scale','load','expenses','scale_ticket',['load_folder','expenses','logbook'],[
    [/scale\s+(?:ticket|weight)/i,72],[/CAT\s+scale/i,72],[/steer\s+axle/i,35],[/drive\s+axle/i,35],[/trailer\s+axle/i,32],
    [/gross\s+weight/i,18],
  ],{ required:['date','weight'], fileSignals:[/scale|cat.?ticket/i], priority:30 }),
  t('reefer_temperature','Reefer Temperature Record','Reefer Temp','load','documents','other',['load_folder','logbook','claims'],[
    [/temperature\s+(?:record|log)/i,65],[/reefer/i,35],[/set\s*point/i,32],[/return\s+air/i,24],[/\bdegrees?\s*[FC]\b/i,18],
  ],{ required:['loadNo','temperature'], fileSignals:[/temp|reefer/i], priority:18 }),
  t('washout_receipt','Trailer Washout Receipt','Washout','load','expenses','other',['load_folder','expenses','maintenance','logbook'],[
    [/washout/i,72],[/trailer\s+wash/i,55],[/food\s+grade\s+wash/i,35],[/tank\s+wash/i,24],
  ],{ required:['date','total'], fileSignals:[/washout|trailer.?wash/i], priority:20 }),
  t('osd_report','OS&D / Exception Report','OS&D','claims','documents','other',['load_folder','claims','billing','factoring','logbook'],[
    [/\bOS&D\b/i,85],[/overage|shortage|damage/i,34],[/exception\s+report/i,45],[/freight\s+claim/i,25],
  ],{ required:['loadNo','exceptionText'], fileSignals:[/os.?d|exception|damage/i], priority:42 }),
  t('claim_notice','Freight Claim Notice','Claim','claims','documents','other',['load_folder','claims','business'],[
    [/freight\s+claim/i,70],[/claim\s+(?:notice|number|#)/i,50],[/amount\s+claimed/i,30],[/damage\s+claim/i,35],
  ],{ required:['claimNo','loadNo'], fileSignals:[/claim/i], priority:35 }),
  t('load_invoice','Carrier Invoice','Invoice','billing','settlements','other',['load_folder','billing','factoring','business'],[
    [/carrier\s+invoice/i,60],[/\binvoice\b/i,25],[/bill\s+to/i,22],[/remit\s+to/i,24],[/amount\s+due/i,28],
  ],{ required:['invoiceNo','total','loadNo'], fileSignals:[/invoice/i], priority:18 }),

  t('fuel_receipt','Fuel Receipt','Fuel','fuel_ifta','fuel','fuel_receipt',['ifta','expenses','logbook'],[
    [/\bgallons?\b/i,42],[/price\s*(?:per|\/)\s*(?:gal|gallon)/i,38],[/\bdiesel\b/i,28],[/\bDEF\b/i,14],
    [/pilot|flying\s+j|love'?s|ta\s+travel|petro|speedway|mudflap|road\s+ranger/i,24],
  ],{ required:['date','merchant','gallons','total','state'], fileSignals:[/fuel|diesel|mudflap/i], priority:30 }),
  t('fuel_card_statement','Fuel Card Statement','Fuel Card','fuel_ifta','fuel','other',['ifta','expenses','business'],[
    [/fuel\s+card\s+statement/i,75],[/transaction\s+detail/i,25],[/gallons/i,18],[/card\s+number/i,12],
  ],{ required:['date','total'], fileSignals:[/fuel.?card|statement/i], priority:18 }),
  t('toll_parking_receipt','Toll / Parking Receipt','Toll','fuel_ifta','expenses','other',['expenses','logbook','tax'],[
    [/\btoll\b/i,48],[/\bparking\b/i,48],[/turnpike|ez\s*pass|i-?pass|sunpass|prepass/i,32],
  ],{ required:['date','total'], fileSignals:[/toll|parking|ezpass/i], priority:12 }),
  t('trip_permit','Trip / Fuel Permit','Trip Permit','fuel_ifta','documents','permit',['ifta','truck_wallet','tax','logbook'],[
    [/trip\s+permit/i,72],[/fuel\s+permit/i,62],[/temporary\s+permit/i,42],[/jurisdiction/i,14],
  ],{ required:['issuedDate','expirationDate','state'], fileSignals:[/trip.?permit|fuel.?permit/i], priority:25 }),
  t('ifta_license','IFTA License','IFTA License','equipment','documents','permit',['truck_wallet','ifta','tax'],[
    [/\bIFTA\b/i,52],[/license\s+(?:number|no|#)/i,22],[/international\s+fuel\s+tax/i,65],
  ],{ required:['expirationDate','accountNumber'], fileSignals:[/ifta/i], priority:24 }),
  t('ifta_return','IFTA Return / Report','IFTA Return','fuel_ifta','documents','other',['ifta','tax','business'],[
    [/IFTA\s+(?:quarterly\s+)?return/i,80],[/taxable\s+miles/i,35],[/tax\s+paid\s+gallons/i,32],[/quarter/i,14],
  ],{ required:['quarter','totalMiles','gallons'], fileSignals:[/ifta.?return|quarterly.?fuel/i], priority:25 }),
  t('weigh_station_receipt','Weigh Station Receipt','Weigh','fuel_ifta','expenses','scale_ticket',['expenses','logbook','ifta'],[
    [/weigh\s+station/i,55],[/weighmaster/i,48],[/gross\s+weight/i,18],
  ],{ required:['date','total'], fileSignals:[/weigh/i], priority:12 }),

  t('repair_invoice','Repair Invoice','Repair','maintenance','maintenance','other',['maintenance','expenses','truck_wallet','tax'],[
    [/repair\s+(?:order|invoice)/i,65],[/labor/i,20],[/parts/i,18],[/service\s+advisor/i,20],[/work\s+performed/i,25],
    [/\bVIN\b/i,14],[/\bodometer\b/i,14],
  ],{ required:['date','merchant','invoiceNo','total'], fileSignals:[/repair|service.?invoice/i], priority:28 }),
  t('tire_receipt','Tire Receipt','Tires','maintenance','maintenance','other',['maintenance','expenses','truck_wallet','tax'],[
    [/\btires?\b/i,42],[/tread|mount|balance|alignment/i,18],[/michelin|goodyear|bridgestone|continental/i,22],
  ],{ required:['date','merchant','total'], fileSignals:[/tire/i], priority:16 }),
  t('pm_service_record','Preventive Maintenance Record','PM Service','maintenance','maintenance','annual_inspection',['maintenance','truck_wallet'],[
    [/preventive\s+maintenance/i,68],[/\bPM\s+(?:service|inspection)\b/i,55],[/oil\s+change/i,28],[/next\s+service/i,22],
  ],{ required:['date','unitNumber','odometer'], fileSignals:[/pm.?service|maintenance/i], priority:24 }),
  t('roadside_service','Roadside Service Receipt','Roadside','maintenance','maintenance','other',['maintenance','expenses','truck_wallet','claims'],[
    [/roadside\s+(?:service|assistance)/i,65],[/tow(?:ing)?\b/i,38],[/breakdown/i,30],[/service\s+call/i,22],
  ],{ required:['date','merchant','total'], fileSignals:[/roadside|tow/i], priority:22 }),
  t('truck_wash_receipt','Truck Wash Receipt','Truck Wash','maintenance','expenses','other',['expenses','maintenance','tax'],[
    [/truck\s+wash/i,68],[/blue\s+beacon/i,55],[/tractor\s+wash/i,28],
  ],{ required:['date','total'], fileSignals:[/truck.?wash|blue.?beacon/i], priority:14 }),
  t('parts_receipt','Truck Parts Receipt','Parts','maintenance','maintenance','other',['maintenance','expenses','tax'],[
    [/auto\s+parts|truck\s+parts|part\s+number/i,34],[/quantity/i,10],[/core\s+charge/i,18],
  ],{ required:['date','merchant','total'], fileSignals:[/parts/i], priority:8 }),

  t('driver_license','CDL / Driver License','CDL','driver','documents','driver_license',['driver_wallet','logbook'],[
    [/commercial\s+driver'?s?\s+license/i,85],[/\bCDL\b/i,55],[/driver\s+license/i,52],[/class\s+[ABC]\b/i,18],
  ],{ required:['driverName','licenseNumber','expirationDate'], fileSignals:[/cdl|driver.?license/i], priority:45, linkable:false }),
  t('medical_card','DOT Medical Card','Medical','driver','documents','medical_card',['driver_wallet','logbook'],[
    [/medical\s+examiner/i,65],[/medical\s+(?:certificate|card)/i,62],[/qualified\s+under\s+49\s+CFR/i,35],
    [/national\s+registry/i,28],
  ],{ required:['driverName','expirationDate'], fileSignals:[/medical.?card|med.?cert/i], priority:42, linkable:false }),
  t('twic','TWIC Card','TWIC','driver','documents','other',['driver_wallet'],[
    [/\bTWIC\b/i,88],[/transportation\s+worker\s+identification/i,80],
  ],{ required:['driverName','expirationDate'], fileSignals:[/twic/i], priority:45, linkable:false }),
  t('passport','Passport','Passport','driver','documents','other',['driver_wallet'],[
    [/\bpassport\b/i,72],[/nationality/i,20],[/date\s+of\s+birth/i,16],
  ],{ required:['driverName','expirationDate'], fileSignals:[/passport/i], priority:30, linkable:false }),
  t('mvr','Motor Vehicle Record','MVR','driver','documents','other',['driver_wallet','business'],[
    [/motor\s+vehicle\s+record/i,78],[/\bMVR\b/i,60],[/driving\s+record/i,42],
  ],{ required:['driverName','date'], fileSignals:[/mvr|driving.?record/i], priority:32, linkable:false }),
  t('drug_alcohol','Drug & Alcohol Compliance','Drug/Alcohol','driver','documents','other',['driver_wallet','business'],[
    [/drug\s+(?:and|&)\s+alcohol/i,68],[/clearinghouse/i,50],[/consortium/i,35],[/random\s+testing/i,28],
  ],{ required:['driverName','date'], fileSignals:[/drug|alcohol|clearinghouse/i], priority:28, linkable:false }),
  t('training_certificate','Driver Training Certificate','Training','driver','documents','other',['driver_wallet','business'],[
    [/certificate\s+of\s+(?:completion|training)/i,62],[/training\s+certificate/i,62],[/hazmat\s+training/i,35],
  ],{ required:['driverName','date'], fileSignals:[/training|certificate/i], priority:18, linkable:false }),

  t('registration','Vehicle Registration','Registration','equipment','documents','registration',['truck_wallet'],[
    [/vehicle\s+registration/i,78],[/registration\s+(?:card|certificate)/i,55],[/\bVIN\b/i,14],[/license\s+plate/i,18],
  ],{ required:['vin','plate','expirationDate'], fileSignals:[/registration/i], priority:32, linkable:false }),
  t('irp_cab_card','IRP Cab Card','IRP','equipment','documents','registration',['truck_wallet','ifta'],[
    [/\bIRP\b/i,58],[/cab\s+card/i,82],[/apportioned/i,42],[/jurisdiction/i,14],
  ],{ required:['vin','unitNumber','expirationDate'], fileSignals:[/irp|cab.?card/i], priority:42, linkable:false }),
  t('insurance','Insurance Policy / Card','Insurance','equipment','documents','insurance',['truck_wallet','business'],[
    [/certificate\s+of\s+insurance/i,65],[/insurance\s+(?:card|policy)/i,55],[/policy\s+(?:number|no|#)/i,24],
    [/liability\s+coverage/i,22],
  ],{ required:['policyNumber','expirationDate'], fileSignals:[/insurance|coi/i], priority:25, linkable:false }),
  t('annual_inspection','Annual DOT Inspection','DOT Inspect','equipment','documents','annual_inspection',['truck_wallet','maintenance'],[
    [/annual\s+(?:vehicle\s+)?inspection/i,75],[/periodic\s+inspection/i,55],[/49\s+CFR\s+396/i,42],
    [/inspector/i,18],
  ],{ required:['vin','date','expirationDate'], fileSignals:[/annual.?inspection|dot.?inspection/i], priority:40, linkable:false }),
  t('title','Vehicle Title','Title','equipment','documents','registration',['truck_wallet','business'],[
    [/certificate\s+of\s+title/i,78],[/vehicle\s+title/i,62],[/lienholder/i,25],
  ],{ required:['vin','ownerName'], fileSignals:[/title/i], priority:32, linkable:false }),
  t('lease_agreement','Truck / Trailer Lease','Lease','equipment','documents','other',['truck_wallet','business','tax'],[
    [/lease\s+agreement/i,72],[/lessor/i,30],[/lessee/i,30],[/equipment\s+lease/i,42],
  ],{ required:['effectiveDate','expirationDate','unitNumber'], fileSignals:[/lease/i], priority:26, linkable:false }),
  t('oversize_permit','Oversize / Overweight Permit','OS/OW Permit','equipment','documents','permit',['truck_wallet','load_folder','logbook'],[
    [/oversize|overweight/i,62],[/special\s+permit/i,40],[/permitted\s+route/i,35],
  ],{ required:['permitNumber','expirationDate'], fileSignals:[/oversize|overweight|permit/i], priority:28 }),
  t('operating_authority','Operating Authority','Authority','business','documents','other',['business','truck_wallet'],[
    [/operating\s+authority/i,68],[/certificate\s+of\s+authority/i,62],[/\bMC[-\s]?\d+/i,30],[/USDOT/i,18],
  ],{ required:['mcNumber','dotNumber'], fileSignals:[/authority/i], priority:24, linkable:false }),

  t('broker_packet','Broker Packet','Broker Packet','broker','documents','other',['broker_profile','business','factoring'],[
    [/broker\s+(?:setup|packet)/i,72],[/carrier\s+packet/i,58],[/broker-carrier/i,35],[/broker\s+agreement/i,30],
  ],{ required:['broker','mcNumber'], fileSignals:[/broker.?packet|setup.?packet/i], priority:35, linkable:false }),
  t('carrier_agreement','Broker-Carrier Agreement','Agreement','broker','documents','other',['broker_profile','business','factoring'],[
    [/broker[-\s]carrier\s+agreement/i,78],[/carrier\s+agreement/i,48],[/terms\s+and\s+conditions/i,16],
  ],{ required:['broker','effectiveDate'], fileSignals:[/carrier.?agreement|broker.?agreement/i], priority:32, linkable:false }),
  t('w9','Form W-9','W-9','business','documents','other',['business','tax','broker_profile'],[
    [/\bW-?9\b/i,75],[/request\s+for\s+taxpayer/i,70],[/taxpayer\s+identification\s+number/i,55],
  ],{ required:['businessName','taxIdLast4'], fileSignals:[/w-?9/i], priority:45, linkable:false }),
  t('certificate_of_insurance','Certificate of Insurance','COI','broker','documents','insurance',['business','broker_profile','truck_wallet'],[
    [/certificate\s+of\s+insurance/i,88],[/ACORD\s+25/i,65],[/certificate\s+holder/i,38],
  ],{ required:['policyNumber','expirationDate'], fileSignals:[/coi|acord/i], priority:50, linkable:false }),
  t('notice_of_assignment','Notice of Assignment','NOA','broker','documents','other',['factoring','broker_profile','business'],[
    [/notice\s+of\s+assignment/i,90],[/assigned\s+to\s+(?:the\s+)?factor/i,42],[/remit\s+(?:all\s+)?payments/i,38],
  ],{ required:['factorName','remitTo'], fileSignals:[/notice.?of.?assignment|\bnoa\b/i], priority:50, linkable:false }),
  t('factoring_verification','Factoring Verification','Factoring','broker','documents','other',['factoring','broker_profile','business'],[
    [/factoring\s+(?:verification|company|agreement)/i,68],[/factor\s+verification/i,62],[/notice\s+of\s+assignment/i,35],
  ],{ required:['factorName','phone'], fileSignals:[/factoring/i], priority:30, linkable:false }),
  t('ach_form','ACH / Direct Deposit Form','ACH','business','documents','other',['business','broker_profile'],[
    [/\bACH\b/i,55],[/direct\s+deposit/i,55],[/routing\s+number/i,42],[/bank\s+account/i,32],
  ],{ required:['businessName','bankName'], fileSignals:[/ach|direct.?deposit/i], priority:24, linkable:false }),
  t('carrier_setup','Carrier Setup Form','Carrier Setup','broker','documents','other',['broker_profile','business'],[
    [/carrier\s+setup/i,75],[/new\s+carrier/i,28],[/carrier\s+profile/i,34],[/MC\s+number/i,18],
  ],{ required:['businessName','mcNumber'], fileSignals:[/carrier.?setup/i], priority:30, linkable:false }),
  t('carrier_settlement','Carrier Settlement','Settlement','billing','settlements','other',['business','billing','tax'],[
    [/carrier\s+settlement/i,75],[/settlement\s+statement/i,58],[/gross\s+pay/i,34],[/net\s+pay/i,34],[/deductions/i,22],
  ],{ required:['date','grossPay','netPay'], fileSignals:[/settlement/i], priority:35, linkable:false }),

  t('form_2290','IRS Form 2290','2290','business','documents','other',['tax','truck_wallet','business'],[
    [/\bForm\s+2290\b/i,90],[/heavy\s+highway\s+vehicle/i,60],[/schedule\s+1/i,35],
  ],{ required:['taxPeriod','vin'], fileSignals:[/2290/i], priority:50, linkable:false }),
  t('tax_document','Tax Document','Tax','business','documents','other',['tax','business'],[
    [/\b1099\b/i,46],[/\bIRS\b/i,30],[/tax\s+(?:return|statement|document)/i,40],[/taxable\s+income/i,22],
  ],{ required:['taxYear'], fileSignals:[/1099|tax/i], priority:12, linkable:false }),
  t('bank_statement','Bank / Card Statement','Statement','business','documents','other',['business','tax'],[
    [/account\s+statement/i,52],[/statement\s+period/i,40],[/beginning\s+balance/i,35],[/ending\s+balance/i,35],
  ],{ required:['date','bankName'], fileSignals:[/bank.?statement|card.?statement/i], priority:14, linkable:false }),
  t('other_expense','Other Business Receipt','Receipt','business','expenses','other',['expenses','tax'],[
    [/\breceipt\b/i,22],[/\bsubtotal\b/i,14],[/\btax\b/i,8],[/\btotal\b/i,12],
  ],{ required:['date','merchant','total'], fileSignals:[/receipt/i], priority:-10, minScore:18, linkable:false }),

  t('accident_report','Accident / Incident Report','Accident','claims','documents','inspection_photo',['claims','truck_wallet','business','logbook'],[
    [/accident\s+report/i,70],[/incident\s+report/i,62],[/collision/i,35],[/police\s+report/i,28],
  ],{ required:['date','location'], fileSignals:[/accident|incident/i], priority:35 }),
  t('police_report','Police Report','Police','claims','documents','other',['claims','business'],[
    [/police\s+report/i,78],[/case\s+(?:number|no|#)/i,30],[/officer/i,16],
  ],{ required:['caseNumber','date'], fileSignals:[/police.?report/i], priority:36, linkable:false }),
  t('other','Other Document','Other','other','documents','other',['smart_inbox'],[],{ required:[], minScore:999, priority:-100, linkable:false }),
]);

const TYPE_MAP = new Map(TRUCK_DOCUMENT_TYPES_V1040.map(item => [item.id, item]));

export function truckDocumentTypeMetaV1040(id = 'other') {
  return TYPE_MAP.get(String(id || 'other')) || TYPE_MAP.get('other');
}

export function truckDocumentFamilyV1040(id = 'other') {
  return FAMILY[id] || FAMILY.other;
}

export function truckDocumentStackMetaV1040(id = 'smart_inbox') {
  return TRUCK_DOCUMENT_STACKS_V1040[id] || TRUCK_DOCUMENT_STACKS_V1040.smart_inbox;
}

export function backendDocumentTypeV1040(id = 'other') {
  return truckDocumentTypeMetaV1040(id).documentType || 'other';
}

export function documentLinkableV1040(id = 'other') {
  return truckDocumentTypeMetaV1040(id).linkable === true;
}

export function documentStacksV1040(id = 'other') {
  return truckDocumentTypeMetaV1040(id).stacks.map(truckDocumentStackMetaV1040);
}

export const TRUCK_DOCUMENT_FAMILIES_V1040 = FAMILY;
