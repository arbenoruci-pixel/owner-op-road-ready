import {textObservation} from '../src/index.js';

export const title='CONFIRMATION OF CONTRACT CARRIER VERBAL RATE AGREEMENT';
export const stamp='10/21/2026 4:21 PM ABC';
export const first=[
  'EXAMPLE FREIGHT SOLUTIONS',title,
  'Pursuant to our verbal agreement between Example Broker and Example Carrier',
  'as BROKER, and EXAMPLE CARRIER LLC, hereafter referred to as Common Carrier:',
  'Both parties agree that BROKERS reference number654321-0, moving on 10/21/2026, from EXAMPLE CITY, IL to',
  'EXAMPLE TOWN, NY, will move at the following rate:',
  '1 FLAT RATE 3,500.0000 $ 3,500.00','1 STOPS BILLED @ a rate per STOP of 900.0000 $ 900.00',
  'TOTAL: $ 4,400.00',
  'AFS must be informed of discrepancies between our rate agreement and the BOL prior to leaving the shipper.',
  `${stamp} Page 1 of 3`,
];
const second=['EXAMPLE FREIGHT SOLUTIONS','CARRIER PICKUP & DELIVERY SCHEDULE','654321-0',
  'REFER TO THIS NUMBER FOR BILLING OR INQUIRIES==>',
  '[1] Pickup: EXAMPLE PACKAGING','[2] Delivery: EXAMPLE DISTRIBUTION CENTER',`${stamp} Page 2 of 3`];
const third=['Date: 10/23/2026','Time: 10:00 AM',
  '<<< BILL TO INFORMATION >>> <<< DISPATCH INFORMATION >>>',
  'DRIVER OR DISPATCHER MUST NOTIFY US IF THERE IS A LUMPER OR DRIVER UNLOAD CHARGE.',`${stamp} Page 3 of 3`];
export const contractRateInput=()=>({documentId:'synthetic-contract-rate',pages:[first,second,third].map((lines,index)=>({id:`p${index+1}`,number:index+1,observations:[textObservation(lines.join('\n'))]}))});
