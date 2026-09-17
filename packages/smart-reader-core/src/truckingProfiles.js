// Shared source-review catalog. A form title plus independent field structure
// establishes a type; a filename, logo or mention in instructions never does.
const re=(s,flags='i')=>new RegExp(s,flags);
const title=s=>re(`^\\s*(?:${s})(?=\\s*(?:$|[:#(]|(?:NO\\.?|NUMBER|ID)\\b))`);
const sig=s=>re(`^\\s*(?:${s})\\b`);
const field=(label,labels,kind='text',required=false)=>({label,kind,required,
  pattern:re(`^\\s*(?:${labels})\\s*(?::|#|\\s)\\s*(.+?)\\s*$`,'id')});
const id=(label,labels,required=false)=>({label,kind:'identifier',required,
  pattern:re(`^\\s*(?:${labels})\\s*(?:NUMBER\\b|NO\\b\\.?|ID\\b|#|:)\\s*[:#]?\\s*([A-Z0-9][A-Z0-9._/-]*)\\s*$`,'id')});
const amount=(label,labels,required=false)=>({label,kind:'amount',required,
  pattern:re(`^\\s*(?:${labels})\\s*:?\\s+([$€£]?\\s*\\d[\\d.,]*(?:\\s+(?:USD|EUR|GBP|CAD|AUD|CHF))?)\\s*$`,'id')});
const date=field('Document date','DOCUMENT DATE|INVOICE DATE|RECEIPT DATE|DATE','date');
const total=amount('Total','GRAND TOTAL|TOTAL AMOUNT|TOTAL DUE|TOTAL|AMOUNT DUE|BALANCE DUE',true);
const loadNumber=id('Load number','LOAD|ORDER|SHIPMENT|PRO');
const bolNumber=id('BOL number','BOL|B/L|BILL OF LADING');
const vin=field('VIN','VIN|VEHICLE IDENTIFICATION NUMBER','vin');
const unit=id('Unit number','UNIT|TRUCK|TRACTOR');
const expiration=field('Expiration date','EXPIRATION DATE|EXPIRES|VALID UNTIL','date');
const effective=field('Effective date','EFFECTIVE DATE|ISSUE DATE|ISSUED','date');
const business=field('Business name','BUSINESS NAME|COMPANY NAME|LEGAL NAME','party');
const carrier=field('Carrier','CARRIER(?: NAME)?','party');
const driver=field('Driver name','DRIVER(?: NAME)?|NAME');
const receipt={receiptNumber:id('Receipt number','RECEIPT|TRANSACTION|TICKET'),date,
  merchant:field('Merchant','MERCHANT|VENDOR|SELLER|SERVICE PROVIDER','party'),
  subtotal:amount('Subtotal','SUBTOTAL|SUB TOTAL'),tax:amount('Tax','TAX|SALES TAX'),total,
  currency:field('Currency','CURRENCY','currency')};
const invoice={invoiceNumber:id('Invoice number','INVOICE',true),date,
  vendor:field('Vendor','VENDOR|SELLER|SUPPLIER','party'),billTo:field('Bill to','BILL TO','party'),
  subtotal:amount('Subtotal','SUBTOTAL|SUB TOTAL'),tax:amount('Tax','TAX|SALES TAX'),total};
const shipping={loadNumber,bolNumber,carrier,date,
  shipper:field('Shipper','SHIPPER|SHIP FROM','party'),consignee:field('Consignee','CONSIGNEE|SHIP TO','party'),
  trailerNumber:id('Trailer number','TRAILER'),sealNumber:id('Seal number','SEAL'),
  weight:field('Weight','GROSS WEIGHT|TOTAL WEIGHT|WEIGHT','weight')};
const equipment={vin,unitNumber:unit,expirationDate:expiration,effectiveDate:effective,
  plate:field('Plate','LICENSE PLATE|PLATE'),owner:field('Owner','OWNER(?: NAME)?','party')};
const company={businessName:business,date,effectiveDate:effective,
  mcNumber:id('MC number','MC|MC/DOT'),dotNumber:id('DOT number','USDOT|DOT'),
  broker:field('Broker','BROKER(?: NAME)?','party'),carrier};
const approval={loadNumber,date,total:amount('Approved amount','APPROVED AMOUNT|AUTHORIZED AMOUNT|AMOUNT|TOTAL',true),
  approvedBy:field('Approved by','APPROVED BY|AUTHORIZED BY'),hours:field('Hours','APPROVED HOURS|HOURS')};
const totalSignal=sig('TOTAL|GRAND TOTAL|AMOUNT DUE|BALANCE DUE');
const receiptSignals=[totalSignal,sig('DATE|RECEIPT|TRANSACTION|SUBTOTAL|TAX|PAID|PAYMENT|CARD')];
const shipmentSignal=sig('BOL|BILL OF LADING|LOAD|SHIPMENT|PRO|TRACKING');
const partySignal=sig('SHIPPER|SHIP FROM|CONSIGNEE|SHIP TO|CARRIER');

function p(id,label,heading,signals,fields,options={}){
  const identity=options.identity||Object.keys(fields).find(key=>fields[key].kind==='identifier')||Object.keys(fields)[0];
  const headingPattern=typeof heading==='string'?title(heading):heading;
  const specs=Object.fromEntries(Object.entries(fields).map(([key,spec])=>[key,
    ['text','party'].includes(spec.kind)?{...spec,excludePattern:headingPattern}:spec]));
  return {id,label,heading:headingPattern,signals,fields:specs,identity,joinPages:false,
    filingType:id,...options};
}
const receiptType=(id,label,heading,signals=[],fields={})=>p(id,label,heading,[...receiptSignals,...signals],{...receipt,...fields},
  {refines:['other_expense','invoice'],family:'expense'});

export function truckingProfiles(base){
  const bol=base.find(p=>p.id==='bol');
  const profiles=[
    p('pod','Proof of delivery','PROOF OF DELIVERY|POD|CUSTOMER DELIVERY COPY',
      [shipmentSignal,sig('RECEIVED BY|DELIVERED TO|DELIVERY DATE|CONSIGNEE|SHIP TO')],
      {...bol.fields,loadNumber,deliveredTo:field('Received by','RECEIVED BY|DELIVERED TO|SIGNED BY'),deliveryDate:field('Delivery date','DELIVERY DATE|DELIVERED ON','date')},{identity:'bolNumber',refines:['bol'],variants:[{
        heading:bol.heading,signals:[...bol.signals,/^\s*(?:RECEIVED BY|SIGNED BY)\s*:\s*[A-Z][A-Z .'-]+\s*$/i,/^\s*(?:DELIVERY DATE|DELIVERED ON)\s*:\s*\d[\d/.-]+\s*$/i],method:'delivery_evidence',
      }]}),
    p('delivery_receipt','Delivery receipt','DELIVERY RECEIPT',[shipmentSignal,partySignal],
      {...shipping,receivedBy:field('Received by','RECEIVED BY|SIGNED BY'),deliveryDate:field('Delivery date','DELIVERY DATE|DELIVERED ON','date')}),
    p('load_tender','Load tender','LOAD TENDER|SHIPMENT TENDER|TENDER OFFER',[shipmentSignal,partySignal],shipping),
    p('packing_list','Packing list','PACKING LIST|PACKING SLIP',[partySignal,sig('QUANTITY|QTY|ITEM|SKU|PALLETS|CARTONS')],
      {...shipping,poNumber:id('PO number','PO|P.O.|PURCHASE ORDER'),quantity:field('Quantity','TOTAL QUANTITY|QUANTITY|QTY')}),
    p('gate_pass','Gate pass','GATE PASS|GATE RECEIPT|DROP LOAD',[sig('TRAILER|CONTAINER'),sig('APPOINTMENT|ARRIVAL|GATE|DOCK|CARRIER')],
      {...shipping,appointment:field('Appointment','APPOINTMENT(?: TIME| DATE| WINDOW)?'),gate:field('Gate','GATE'),door:field('Door','DOOR|DOCK')}),
    p('detention_approval','Detention approval','DETENTION APPROVAL|DETENTION AUTHORIZATION',[shipmentSignal,sig('APPROVED|AUTHORIZED|AMOUNT|HOURS')],approval),
    p('layover_approval','Layover approval','LAYOVER APPROVAL|LAYOVER AUTHORIZATION',[shipmentSignal,sig('APPROVED|AUTHORIZED|AMOUNT|HOURS')],approval),
    p('tonu','Truck ordered not used','TONU|TRUCK ORDERED NOT USED',[shipmentSignal,sig('APPROVED|AUTHORIZED|AMOUNT|TOTAL')],approval),
    p('scale_ticket','Scale ticket','CAT SCALE|CERTIFIED (?:AUTOMATED TRUCK )?SCALE|SCALE TICKET|CERTIFIED WEIGHT TICKET',
      [sig('STEER AXLE|STEER WEIGHT'),sig('DRIVE AXLE|DRIVE WEIGHT'),sig('GROSS WEIGHT|TOTAL WEIGHT')],
      {...receipt,unitNumber:unit,steerWeight:field('Steer axle weight','STEER AXLE|STEER WEIGHT','weight'),driveWeight:field('Drive axle weight','DRIVE AXLE|DRIVE WEIGHT','weight'),
        trailerWeight:field('Trailer axle weight','TRAILER AXLE|TRAILER WEIGHT','weight'),grossWeight:field('Gross weight','GROSS WEIGHT|TOTAL WEIGHT','weight')},{family:'expense'}),
    p('reefer_temperature','Reefer temperature record','(?:REEFER )?TEMPERATURE (?:RECORD|LOG|REPORT)',
      [sig('SET POINT|SETPOINT'),sig('RETURN AIR|SUPPLY AIR|TEMPERATURE|DATE|TRAILER')],
      {...shipping,setPoint:field('Set point','SET POINT|SETPOINT'),returnAir:field('Return air','RETURN AIR'),supplyAir:field('Supply air','SUPPLY AIR')}),
    p('osd_report','OS&D / exception report','OS&D(?: REPORT)?|OVERAGE SHORTAGE (?:AND )?DAMAGE(?: REPORT)?|EXCEPTION REPORT',
      [shipmentSignal,sig('SHORTAGE|DAMAGE|OVERAGE|EXCEPTION')],{...shipping,exception:field('Exception','EXCEPTION|DAMAGE|SHORTAGE|OVERAGE')}),
    p('claim_notice','Freight claim notice','FREIGHT CLAIM(?: NOTICE)?|CARGO CLAIM(?: NOTICE)?|LOSS AND DAMAGE CLAIM',
      [sig('CLAIM|BOL|SHIPMENT|PRO'),sig('AMOUNT CLAIMED|CLAIM AMOUNT|DAMAGE|LOSS')],
      {...shipping,claimNumber:id('Claim number','CLAIM'),claimAmount:amount('Claim amount','AMOUNT CLAIMED|CLAIM AMOUNT')}),
    p('load_invoice','Carrier invoice','CARRIER INVOICE|FREIGHT INVOICE|TRANSPORTATION INVOICE|INVOICE',
      [shipmentSignal,sig('BILL TO|REMIT TO|CARRIER'),totalSignal],{...invoice,loadNumber,bolNumber,carrier,remitTo:field('Remit to','REMIT TO','party')},{identity:'invoiceNumber',refines:['invoice']}),
    receiptType('fuel_receipt','Fuel receipt','FUEL RECEIPT|DIESEL RECEIPT|RECEIPT|CUSTOMER COPY',
      [sig('DIESEL|ULSD|FUEL|DEF'),sig('GALLONS|GAL|VOLUME')],{gallons:field('Gallons','GALLONS|GAL'),pricePerGallon:field('Price per gallon','PRICE PER GALLON|PRICE/GAL|PRICE PER GAL|PPG'),state:field('Fuel state','STATE')}),
    p('fuel_card_statement','Fuel card statement','FUEL CARD STATEMENT|FUEL TRANSACTION (?:DETAIL|STATEMENT|REPORT)',
      [sig('TRANSACTION|STATEMENT PERIOD|CARD'),sig('GALLONS|TOTAL GALLONS|DIESEL')],
      {statementNumber:id('Statement number','STATEMENT'),date,period:field('Statement period','STATEMENT PERIOD'),gallons:field('Total gallons','TOTAL GALLONS'),total}),
    receiptType('toll_parking_receipt','Toll / parking receipt','(?:TOLL|PARKING) (?:RECEIPT|TRANSACTION)|E[ -]?ZPASS RECEIPT|I[ -]?PASS RECEIPT',[],
      {location:field('Location','LOCATION|PLAZA|FACILITY'),entry:field('Entry','ENTRY(?: TIME)?'),exit:field('Exit','EXIT(?: TIME)?')}),
    receiptType('washout_receipt','Trailer washout receipt','(?:TRAILER |TANK )?WASHOUT(?: RECEIPT)?|TRAILER WASH RECEIPT',[],{trailerNumber:id('Trailer number','TRAILER')}),
    receiptType('truck_wash_receipt','Truck wash receipt','TRUCK WASH(?: RECEIPT)?|TRACTOR WASH(?: RECEIPT)?',[],{unitNumber:unit}),
    receiptType('tire_receipt','Tire receipt','TIRE (?:RECEIPT|INVOICE|SALES)|RECEIPT',[sig('TIRE SIZE|TREAD|MOUNT|BALANCE')],{tireSize:field('Tire size','TIRE SIZE'),quantity:field('Quantity','QUANTITY|QTY')}),
    receiptType('parts_receipt','Truck parts receipt','(?:TRUCK |AUTO )?PARTS (?:RECEIPT|INVOICE)|RECEIPT',[sig('PART NUMBER|PART NO|CORE CHARGE|SKU')],{partNumber:id('Part number','PART'),quantity:field('Quantity','QUANTITY|QTY')}),
    p('repair_invoice','Repair / service invoice','REPAIR (?:INVOICE|ORDER)|SERVICE INVOICE|INVOICE',
      [sig('LABOR|WORK PERFORMED'),sig('PARTS|ODOMETER|VIN|SERVICE ADVISOR'),totalSignal],
      {...invoice,vin,unitNumber:unit,odometer:field('Odometer','ODOMETER'),labor:amount('Labor','LABOR'),parts:amount('Parts','PARTS')},{identity:'invoiceNumber',refines:['invoice']}),
    receiptType('roadside_service','Roadside service receipt','ROADSIDE (?:SERVICE|ASSISTANCE)(?: RECEIPT)?|TOWING (?:RECEIPT|INVOICE)',[],{vin,unitNumber:unit,location:field('Service location','SERVICE LOCATION|LOCATION')}),
    p('pm_service_record','Preventive maintenance record','PREVENTIVE MAINTENANCE(?: RECORD| REPORT)?|PM (?:SERVICE|INSPECTION)(?: RECORD)?',
      [sig('UNIT|VIN|TRUCK'),sig('ODOMETER|NEXT SERVICE|OIL CHANGE')],{vin,unitNumber:unit,date,odometer:field('Odometer','ODOMETER'),nextService:field('Next service','NEXT SERVICE')}),
    p('weigh_station_receipt','Weigh station receipt','WEIGH STATION (?:RECEIPT|TICKET)|WEIGHMASTER (?:RECEIPT|TICKET)',
      [sig('GROSS WEIGHT|WEIGHT'),sig('TICKET|DATE|VEHICLE|UNIT')],{...receipt,unitNumber:unit,weight:field('Gross weight','GROSS WEIGHT|WEIGHT','weight')}),
    p('trip_permit','Trip / fuel permit','(?:TEMPORARY )?(?:TRIP|FUEL) PERMIT',
      [sig('PERMIT|JURISDICTION'),sig('EFFECTIVE|VALID|EXPIRATION|EXPIRES|VIN')],{...equipment,permitNumber:id('Permit number','PERMIT'),jurisdiction:field('Jurisdiction','JURISDICTION|STATE')}),
    p('oversize_permit','Oversize / overweight permit','(?:OVERSIZE|OVERWEIGHT|OVERSIZE/OVERWEIGHT|SPECIAL HAULING) PERMIT',
      [sig('PERMIT|PERMITTED ROUTE'),sig('WIDTH|HEIGHT|LENGTH|GROSS WEIGHT|VIN|EXPIRATION')],{...equipment,permitNumber:id('Permit number','PERMIT'),route:field('Permitted route','PERMITTED ROUTE'),dimensions:field('Dimensions','DIMENSIONS')}),
    p('ifta_license','IFTA license','IFTA(?: LICENSE)?|INTERNATIONAL FUEL TAX AGREEMENT(?: LICENSE)?',
      [sig('LICENSE|ACCOUNT'),sig('EXPIRATION|EXPIRES|LICENSEE|BUSINESS NAME|YEAR')],{businessName:business,licenseNumber:id('License number','LICENSE'),expirationDate:expiration,year:field('License year','YEAR')}),
    p('ifta_return','IFTA return / report','IFTA (?:QUARTERLY )?(?:RETURN|REPORT)|INTERNATIONAL FUEL TAX AGREEMENT TAX RETURN',
      [sig('QUARTER|TAX PERIOD'),sig('TAXABLE MILES|TAX PAID GALLONS|TOTAL MILES')],{quarter:field('Quarter','QUARTER|TAX PERIOD'),totalMiles:field('Total miles','TOTAL MILES'),gallons:field('Tax-paid gallons','TAX PAID GALLONS'),total:amount('Tax due','TAX DUE|TOTAL TAX')}),
    p('driver_license','CDL / driver license',"(?:COMMERCIAL )?DRIVER['’]?S? LICENSE|CDL",
      [sig('NAME|DRIVER|LN|FN'),sig('CLASS|EXP|EXPIRES|EXPIRATION|DOB')],{licenseNumber:id('License number','LICENSE|DL'),driverName:driver,expirationDate:expiration,licenseClass:field('Class','CLASS')}),
    p('medical_card','DOT medical card',"MEDICAL EXAMINER['’]?S CERTIFICATE|DOT MEDICAL CARD|MCSA-5876",
      [sig('MEDICAL|NATIONAL REGISTRY|I CERTIFY'),sig('DRIVER|NAME|EXPIRATION|CERTIFICATE EXPIRATION')],{driverName:driver,expirationDate:expiration,examiner:field('Medical examiner','MEDICAL EXAMINER(?: NAME)?'),registryNumber:id('Registry number','NATIONAL REGISTRY')}),
    p('twic','TWIC card','TWIC|TRANSPORTATION WORKER IDENTIFICATION CREDENTIAL',
      [sig('NAME|SURNAME'),sig('EXPIRATION|EXPIRES|CREDENTIAL')],{driverName:driver,expirationDate:expiration,credentialNumber:id('Credential number','CREDENTIAL')}),
    p('passport','Passport','PASSPORT|UNITED STATES OF AMERICA PASSPORT',
      [sig('SURNAME|NAME'),sig('NATIONALITY|DATE OF BIRTH')],{passportNumber:id('Passport number','PASSPORT'),name:field('Name','NAME|SURNAME'),expirationDate:expiration,nationality:field('Nationality','NATIONALITY')}),
    p('mvr','Motor vehicle record','MOTOR VEHICLE RECORD|DRIVING RECORD',
      [sig('DRIVER|NAME|LICENSE'),sig('VIOLATIONS|CONVICTIONS|STATUS|DATE')],{driverName:driver,licenseNumber:id('License number','LICENSE'),date,status:field('License status','LICENSE STATUS|STATUS')}),
    p('drug_alcohol','Drug & alcohol compliance','DRUG (?:AND|&) ALCOHOL(?: (?:COMPLIANCE|TESTING|REPORT))?|CLEARINGHOUSE (?:QUERY(?: RESULT)?|REPORT|RESULT)',
      [sig('DRIVER|NAME|EMPLOYEE'),sig('QUERY|TEST|RESULT|STATUS|DATE')],{driverName:driver,date,result:field('Reported result','RESULT|STATUS|QUERY RESULT')}),
    p('training_certificate','Driver training certificate','CERTIFICATE OF (?:COMPLETION|TRAINING)|TRAINING CERTIFICATE',
      [sig('NAME|DRIVER|AWARDED TO|PRESENTED TO'),sig('COURSE|TRAINING|COMPLETED|DATE')],{name:field('Recipient','NAME|AWARDED TO|PRESENTED TO'),date,course:field('Course','COURSE|TRAINING')}),
    p('registration','Vehicle registration','VEHICLE REGISTRATION|REGISTRATION (?:CARD|CERTIFICATE)',[sig('VIN|VEHICLE IDENTIFICATION'),sig('PLATE|LICENSE PLATE|REGISTRATION|EXPIRATION')],equipment),
    p('irp_cab_card','IRP cab card','IRP(?: CAB CARD)?|(?:APPORTIONED )?CAB CARD|APPORTIONED REGISTRATION',
      [sig('VIN|VEHICLE IDENTIFICATION'),sig('JURISDICTION|APPORTIONED|UNIT|EXPIRATION')],equipment),
    p('insurance','Insurance policy / card','INSURANCE (?:POLICY|CARD)|(?:COMMERCIAL )?AUTO INSURANCE',
      [sig('POLICY'),sig('INSURED|EFFECTIVE|EXPIRATION|EXPIRES')],{policyNumber:id('Policy number','POLICY'),insured:field('Insured','INSURED','party'),effectiveDate:effective,expirationDate:expiration}),
    p('certificate_of_insurance','Certificate of insurance','CERTIFICATE OF (?:LIABILITY )?INSURANCE|ACORD 25',
      [sig('INSURED|PRODUCER'),sig('CERTIFICATE HOLDER|COVERAGES|POLICY')],{policyNumber:id('Policy number','POLICY'),insured:field('Insured','INSURED','party'),holder:field('Certificate holder','CERTIFICATE HOLDER','party'),effectiveDate:effective,expirationDate:expiration}),
    p('annual_inspection','Annual DOT inspection','ANNUAL (?:VEHICLE )?INSPECTION(?: REPORT)?|PERIODIC INSPECTION(?: REPORT)?',
      [sig('VIN|VEHICLE IDENTIFICATION|UNIT'),sig('INSPECTOR|INSPECTION DATE|BRAKES')],{...equipment,date:field('Inspection date','INSPECTION DATE|DATE','date'),inspector:field('Inspector','INSPECTOR')}),
    p('title','Vehicle title','CERTIFICATE OF TITLE|VEHICLE TITLE',[sig('VIN|VEHICLE IDENTIFICATION'),sig('OWNER|LIENHOLDER')],{...equipment,titleNumber:id('Title number','TITLE'),lienholder:field('Lienholder','LIENHOLDER','party')}),
    p('lease_agreement','Truck / trailer lease','(?:TRUCK |TRAILER |EQUIPMENT )?LEASE AGREEMENT',[sig('LESSOR'),sig('LESSEE')],{...equipment,lessor:field('Lessor','LESSOR','party'),lessee:field('Lessee','LESSEE','party')}),
    p('trailer_interchange','Trailer interchange agreement','TRAILER INTERCHANGE AGREEMENT|EQUIPMENT INTERCHANGE (?:AGREEMENT|RECEIPT)',
      [sig('TRAILER|EQUIPMENT|VIN'),sig('CARRIER|OWNER|INTERCHANGE DATE')],{...equipment,carrier,trailerNumber:id('Trailer number','TRAILER'),date}),
    p('operating_authority','Operating authority','OPERATING AUTHORITY|CERTIFICATE OF AUTHORITY|CERTIFICATE OF PUBLIC CONVENIENCE AND NECESSITY',
      [sig('MC|USDOT|DOT'),sig('CARRIER|BUSINESS NAME|LEGAL NAME|AUTHORIZED')],company),
    p('broker_packet','Broker packet','BROKER (?:SETUP )?PACKET|CARRIER PACKET',[sig('BROKER'),sig('CARRIER|MC|USDOT')],company),
    p('carrier_agreement','Broker-carrier agreement','BROKER[ -]CARRIER AGREEMENT|CARRIER AGREEMENT',[sig('BROKER'),sig('CARRIER')],company),
    p('carrier_setup','Carrier setup form','CARRIER SETUP(?: FORM)?|NEW CARRIER PROFILE',[sig('CARRIER|COMPANY NAME|BUSINESS NAME'),sig('MC|USDOT|DOT')],company),
    p('w9','Form W-9','(?:FORM )?W-?9',[sig('REQUEST FOR TAXPAYER|TAXPAYER IDENTIFICATION'),sig('CERTIFICATION|IDENTIFICATION NUMBER|PART I|BUSINESS NAME')],
      {businessName:business,date,taxClassification:field('Tax classification','TAX CLASSIFICATION')}),
    p('notice_of_assignment','Notice of assignment','NOTICE OF ASSIGNMENT',[sig('FACTOR|ASSIGNEE|ASSIGNED TO'),sig('REMIT TO|REMIT ALL PAYMENTS|PAYMENTS')],
      {businessName:business,factorName:field('Factor','FACTOR(?: NAME)?|ASSIGNEE|ASSIGNED TO','party'),remitTo:field('Remit to','REMIT TO'),effectiveDate:effective}),
    p('factoring_verification','Factoring verification','FACTOR(?:ING)? VERIFICATION|FACTORING AGREEMENT',[sig('FACTOR|FACTORING COMPANY'),sig('CARRIER|BUSINESS NAME|CONTACT|PHONE')],
      {...company,factorName:field('Factor','FACTOR(?: NAME)?|FACTORING COMPANY','party')}),
    p('ach_form','ACH / direct deposit form','ACH(?: AUTHORIZATION| FORM)?|DIRECT DEPOSIT(?: AUTHORIZATION| FORM)?',
      [sig('BANK|BANK NAME'),sig('ROUTING NUMBER|ACCOUNT|BUSINESS NAME')],{businessName:business,bankName:field('Bank name','BANK NAME','party'),effectiveDate:effective}),
    p('carrier_settlement','Carrier settlement','CARRIER SETTLEMENT|SETTLEMENT STATEMENT',[sig('GROSS PAY|GROSS EARNINGS'),sig('NET PAY|NET SETTLEMENT')],
      {settlementNumber:id('Settlement number','SETTLEMENT'),date,grossPay:amount('Gross pay','GROSS PAY|GROSS EARNINGS'),deductions:amount('Deductions','DEDUCTIONS|TOTAL DEDUCTIONS'),netPay:amount('Net pay','NET PAY|NET SETTLEMENT')}),
    p('form_2290','IRS Form 2290','(?:FORM )?2290|SCHEDULE 1 \\(FORM 2290\\)',[sig('HEAVY HIGHWAY VEHICLE|SUSPENSION OF TAX|VEHICLES'),sig('TAX|EMPLOYER IDENTIFICATION|NAME|VIN')],
      {businessName:business,vin,taxPeriod:field('Tax period','TAX PERIOD'),tax:amount('Tax','TOTAL TAX|TAX')}),
    p('tax_document','Tax document','(?:FORM )?1099(?:-[A-Z]+)?|TAX (?:RETURN|STATEMENT|DOCUMENT)',[sig('PAYER|RECIPIENT|TAX YEAR'),sig('INCOME|COMPENSATION|AMOUNT|TAX')],
      {taxYear:field('Tax year','TAX YEAR'),payer:field('Payer','PAYER','party'),recipient:field('Recipient','RECIPIENT','party'),income:amount('Reported income','INCOME|NONEMPLOYEE COMPENSATION')}),
    p('bank_statement','Bank / card statement','BANK STATEMENT|ACCOUNT STATEMENT|CREDIT CARD STATEMENT',[sig('STATEMENT PERIOD'),sig('BEGINNING BALANCE|ENDING BALANCE|PREVIOUS BALANCE|NEW BALANCE')],
      {period:field('Statement period','STATEMENT PERIOD'),openingBalance:amount('Opening balance','BEGINNING BALANCE|PREVIOUS BALANCE'),closingBalance:amount('Closing balance','ENDING BALANCE|NEW BALANCE')}),
    p('other_expense','Business receipt',/^\s*(?:RECEIPT|SALES RECEIPT|PAYMENT RECEIPT|CUSTOMER COPY)\s*$/i,receiptSignals,receipt,{family:'expense'}),
    p('accident_report','Accident / incident report','ACCIDENT REPORT|INCIDENT REPORT|COLLISION REPORT',[sig('DATE|INCIDENT DATE'),sig('LOCATION|VEHICLE|DRIVER')],
      {reportNumber:id('Report number','REPORT|INCIDENT'),date,location:field('Location','LOCATION'),driverName:driver,vin}),
    p('police_report','Police report','POLICE REPORT|TRAFFIC CRASH REPORT',[sig('CASE|REPORT'),sig('OFFICER|AGENCY')],
      {caseNumber:id('Case number','CASE'),date,officer:field('Officer','OFFICER'),location:field('Location','LOCATION')}),
    p('signature_page','Signature page','SIGNATURE PAGE',[sig('DOCUMENT REF|DOCUMENT REFERENCE|ENVELOPE ID')],
      {documentReference:{label:'Document reference',kind:'identifier',required:false,pattern:/^\s*(?:DOCUMENT REF|DOCUMENT REFERENCE|ENVELOPE ID)\s*:\s*([A-Z0-9][A-Z0-9-]*)(?=\s*(?:$|PAGE\b))/id}},{role:'supporting',filingType:null}),
    p('signing_certificate','Signing certificate',/^\s*(?:REF\. NUMBER\s+DOCUMENT COMPLETED BY ALL PARTIES ON|CERTIFICATE OF COMPLETION|AUDIT TRAIL)\s*$/i,
      [sig('SIGNER|SIGNATURE'),sig('SIGNED|COMPLETED|SENT')],{documentReference:id('Document reference','DOCUMENT REF|DOCUMENT REFERENCE|ENVELOPE'),date},{role:'supporting',filingType:null}),
  ];
  profiles.find(p=>p.id==='fuel_receipt').structuralSignals=[sig('DIESEL|ULSD|FUEL TYPE'),sig('GALLONS|GAL'),totalSignal,sig('PAID|PAYMENT|CARD|TRANSACTION')];
  profiles.find(p=>p.id==='other_expense').structuralSignals=[sig('SUBTOTAL'),totalSignal,sig('PAYMENT METHOD|CARD TYPE|PAID|CASH|CHANGE')];
  profiles.find(p=>p.id==='other_expense').fallback=true;
  return profiles;
}
