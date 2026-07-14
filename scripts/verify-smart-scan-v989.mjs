import { extractProDocumentFieldsV989 } from '../source/src/modules/scan/smartScanExtractionV989.js';

const fieldResults = {
  DATE:{ text:'07/10/2026', confidence:.96 },
  HEADER_RIGHT:{ text:'Bill of Lading Number: IF8564\nCustomer P.O. Number: 7520262581\nCarrier Name:\nSeal #: 585020\nTrailer #:', confidence:.82 },
  BOL_VALUE:{ text:'Bill of Lading Number: IF8564', confidence:.86 },
  BOL_BAR_TEXT:{ text:'IF8564', confidence:.91 },
  CUSTOMER_PO:{ text:'7520262581', confidence:.89 },
  SEAL:{ text:'585020', confidence:.67 },
  TRAILER:{ text:'', confidence:0 },
  SHIP_FROM:{
    text:'I of 1 adding Mumba\\E nee, Page 1 oft, I Garden of Light Inc., 127 Park Avenue\nEast Hartford CT 06108\nUnited States',
    confidence:.61,
    lines:[
      { text:'I of 1 adding Mumba E nee, Page 1 oft, I Garden of Light Inc., 127 Park Avenue', confidence:55 },
      { text:'East Hartford CT 06108', confidence:88 },
      { text:'United States', confidence:92 },
    ],
  },
  SHIP_TO:{
    text:'HEIRS, ss, Carrlar H, in, Greenwood DC\n486 E Stop 18 Road\nGreenwood IN 46143-9537\nUnited States',
    confidence:.58,
    lines:[
      { text:'HEIRS, ss, Carrlar H, in, Greenwood DC', confidence:44 },
      { text:'486 E Stop 18 Road', confidence:87 },
      { text:'Greenwood IN 46143-9537', confidence:90 },
      { text:'United States', confidence:91 },
    ],
  },
  PIECES:{ text:'720', confidence:.84 },
  WEIGHT:{ text:'5533.88 lbs', confidence:.91 },
  COMMODITY:{ text:"ALD-GRA-001 - Aldi's Superfoods Dark Chocolate Sea Salt Coconut Cacao", confidence:.76 },
  STOP_TIMES:{ text:'Check In (Guard): 12:06\nAppointment Time: 1 AM\nUnloaded & Signed Out: 1:45', confidence:.62 },
};

const fields = extractProDocumentFieldsV989('BILL OF LADING - NOT NEGOTIABLE', 'bol', fieldResults, []);
const expected = {
  date:'07/10/2026',
  loadNo:'IF8564',
  poNumber:'7520262581',
  seal:'585020',
  origin:'East Hartford, CT',
  destination:'Greenwood, IN',
  weight:5533.88,
  totalPieces:720,
  checkIn:'12:06',
  appointmentTime:'1 AM',
  checkOut:'1:45',
};

for (const [key, value] of Object.entries(expected)) {
  if (fields[key] !== value) throw new Error(`v98.9 ${key} failed: expected ${value}, got ${fields[key]}`);
}
if (!fields.shipFromDetails.startsWith('Garden of Light Inc.')) throw new Error(`v98.9 ship from noise not removed: ${fields.shipFromDetails}`);
if (!fields.shipToDetails.startsWith('Greenwood DC')) throw new Error(`v98.9 ship to noise not removed: ${fields.shipToDetails}`);

const rejected = extractProDocumentFieldsV989('Bill of Lading Number: 6273', 'bol', { BOL_VALUE:{ text:'6273', confidence:.95 } }, []);
if (rejected.loadNo) throw new Error(`v98.9 numeric-only false BOL accepted: ${rejected.loadNo}`);

console.log('verify-smart-scan-v989 passed');
