import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engineModule=await import(new URL('../source/src/modules/scan/truckDocumentEngineV1040.js?v1042',import.meta.url));
const templateModule=await import(new URL('../source/src/modules/scan/truckDocumentTemplateIntelligenceV1042.js?v1042',import.meta.url));
const { classifyTruckDocumentTextV1040 }=engineModule;
const { sanitizeTemplateFieldsV1042, inspectDocumentTemplatesV1042 }=templateModule;
function assert(ok,message){ if(!ok) throw new Error(`v104.2 regression failed: ${message}`); console.log(`PASS ${message}`); }

const capstone=`
Capstone Logistics
Receipt #: 4fdc46cf-83b6-47d0-b510-405eec6015b
Location: SYSCO HARAHAN LA
Work Date: 06/27/2023
Bill Code: RCOD60536
Carrier: ARRIVE
Dock: DRY
Door: 7
Purchase Orders: 24616720
Vendor: JM SMUCKER CO
Total Initial Pallets: 1.00
Total Finished Pallets: 35
Total Case Count: 2240
Trailer Number: 555
Tractor Number: 622
BOL: BOL778833
Breakdown: $40.00
Restack: $60.00
Pinwheeled: $30.00
Total Add Charges: $130.00
Convenience Fee: $10.00
Base Charge: $245.00
Total Cost: $385.00
`;
const capstoneClass=classifyTruckDocumentTextV1040({text:capstone,fileName:'capstone-receipt.pdf',baseTypeId:'rate_confirmation'});
assert(capstoneClass.type.id==='lumper_receipt','Capstone receipt overrules rate confirmation');
assert(capstoneClass.templateProfileV1042?.id==='capstone-lumper-receipt','Capstone template fingerprint is retained');
const capstoneFields=sanitizeTemplateFieldsV1042('lumper_receipt',capstone,{loadNo:'confirmation',total:0});
assert(capstoneFields.receiptNo.startsWith('4FDC46CF'),'Capstone receipt number is extracted');
assert(capstoneFields.loadNo==='BOL778833','Capstone BOL becomes the load link');
assert(capstoneFields.total===385 && capstoneFields.baseCharge===245,'Capstone charges are separated');
assert(capstoneFields.initialPallets===1 && capstoneFields.finishedPallets===35 && capstoneFields.caseCount===2240,'Capstone pallet and case details are extracted');

const relay=`
Relay Payments
Lumper Payment Confirmation
Receipt # RP-883410
Facility: UNFI York PA
Work Date: 07/16/2026
BOL # 9001774
PO # 771199
Unloading Fee $275.00
Express Code 992184
Amount Paid $275.00
`;
assert(classifyTruckDocumentTextV1040({text:relay,fileName:'relay-payment.png',baseTypeId:'rate_confirmation'}).type.id==='lumper_receipt','Relay lumper payment is recognized');

const rate=`
TOTAL QUALITY LOGISTICS
CARRIER RATE CONFIRMATION
Load Number: 511340
Broker: Total Quality Logistics
Carrier: ABC TRUCKING LLC
Equipment: Refrigerated Van
PICKUP: Los Angeles, CA 07/18/2026 08:00
DELIVERY: Chicago, IL 07/20/2026 14:00
Line Haul: $2,300.00
Fuel Surcharge: $150.00
Total Carrier Pay: $2,450.00
Invoice Instructions and Quick Pay Terms
`;
const rateClass=classifyTruckDocumentTextV1040({text:rate,fileName:'TQL-511340-ratecon.pdf'});
assert(rateClass.type.id==='rate_confirmation','carrier rate confirmation remains a rate confirmation');
const rateFields=sanitizeTemplateFieldsV1042('rate_confirmation',rate,{total:275});
assert(rateFields.total===2450 && rateFields.linehaul===2300 && rateFields.fuelSurcharge===150,'rate pay fields are isolated from receipt amounts');

const pilot=`
Pilot Flying J Travel Center #117
Gary, IN 46406
Fuel Receipt
Transaction Date: 07/16/2026
Receipt #: 88442219
Pump # 12
Product: ULSD Diesel
Gallons: 120.456 GAL
Price / Gallon: $3.699
Fuel Total: $445.57
Unit Number: 214
Purchaser: Arben Oruci
`;
const pilotClass=classifyTruckDocumentTextV1040({text:pilot,fileName:'pilot-fuel.jpg',baseTypeId:'rate_confirmation'});
assert(pilotClass.type.id==='fuel_receipt','Pilot fuel receipt overrules rate confirmation');
const pilotFields=sanitizeTemplateFieldsV1042('fuel_receipt',pilot,{});
assert(pilotFields.gallons===120.456 && pilotFields.pricePerGallon===3.699,'fuel gallons and price are extracted');
assert(pilotFields.state==='IN' && pilotFields.unitNumber==='214','fuel jurisdiction and unit are extracted');
assert(pilotFields.iftaEligible===true && pilotFields.iftaReady===true,'complete diesel receipt is IFTA ready');

const mudflap=`
Mudflap Fuel Receipt
Fueling Location: Road Ranger, Rockford, IL
Purchase Date: 07/15/2026
Transaction ID: MF-778812
Diesel
Quantity: 96.200 gallons
Unit Price: $3.499
Amount Paid: $336.60
Truck Number: 88
Purchaser: A Oruci
`;
assert(classifyTruckDocumentTextV1040({text:mudflap,fileName:'mudflap-778812.pdf'}).type.id==='fuel_receipt','Mudflap digital receipt is recognized');

const repair=`
TA TRUCK SERVICE
REPAIR ORDER # RO-551277
SERVICE INVOICE
Date: 07/12/2026
Unit # 214
VIN: 1M1AW07Y1FM012345
Odometer: 495354
Work Performed: Replace steer tire and perform alignment
Labor Total: $185.00
Parts Total: $612.50
Shop Supplies: $28.00
Invoice Total: $825.50
`;
assert(classifyTruckDocumentTextV1040({text:repair,fileName:'repair-order.pdf',baseTypeId:'rate_confirmation'}).type.id==='repair_invoice','repair invoice overrules rate confirmation');
const repairFields=sanitizeTemplateFieldsV1042('repair_invoice',repair,{});
assert(repairFields.invoiceNo==='RO-551277' && repairFields.total===825.5,'repair invoice number and total are extracted');

const bol=`
BILL OF LADING
B/L NO: 0025075693
CARRIER: H AND N LOGISTICS
FROM: TYSON ROCHELLE
CONSIGNED TO: REINHART ROGERS
PRODUCT CODE QTY SHIPPED DESCRIPTION NET WEIGHT
TOTAL UNITS: 693
TOTAL WEIGHT: 6,399.50
`;
assert(classifyTruckDocumentTextV1040({text:bol,fileName:'bol-0025075693.pdf'}).type.id==='bol','standard BOL stays BOL');
const signedPod=`${bol}\nCUSTOMER COPY\nPER\n7-16-26\nThe original bill of lading accepted and signed by Consignee must be presented by Carrier.`;
assert(classifyTruckDocumentTextV1040({text:signedPod,fileName:'signed-bol.jpg'}).type.id==='pod','signed customer-copy BOL stays POD');

const ranked=inspectDocumentTemplatesV1042({text:capstone,fileName:'receipt.pdf'});
assert(ranked[0].typeId==='lumper_receipt' && ranked[0].score>ranked.find(x=>x.typeId==='rate_confirmation').score,'template ranking separates lumper from rate confirmation');

const ui=fs.readFileSync(path.join(ROOT,'source/src/modules/scan/SmartDocumentExtraFieldsV1042.jsx'),'utf8');
assert(ui.includes('Initial pallets')&&ui.includes('Base charge')&&!ui.includes('name="total"'),'lumper review uses specialized non-duplicated fields');
console.log('PASS — v104.2 researched document template regression suite');
