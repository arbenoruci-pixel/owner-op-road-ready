import {textObservation} from '../src/index.js';

// Synthetic layout fixture: never commit customer contracts or signatures.
export const rateText=[
  'PRO # 86420 Rate Confirmation',
  '09/16/26 18:19:54 (EST)',
  'EXAMPLE FREIGHT LLC',
  'Size & Type: POWER ONLY Description: 53FT REEFER Miles: 987',
  'Pieces: Weight: 12000',
  'CHARGES DISPATCH NOTES',
  'LINE HAUL RATE 2300.00 Unit # 123456',
  'TOTAL RATE 2300.00',
  'PICK 1',
  'PICK UP',
  '123 EXAMPLE RD Appointment 09/16/26 08:00 to 09/16/26 16:00',
  'ALBANY NY 12207',
  'STOP 1',
  'EXAMPLE RECEIVING LLC',
  '456 SAMPLE ST Appointment 09/22/26 08:00 to 09/22/26 16:00',
  'MADISON WI 53703',
  '$150 PER DAY LATE FEE, IF DELIVERED AFTER 7 DAYS',
  'Send invoice along with signed POD',
  'Carrier Signature Date / /',
  'Document Ref: SYNTHETIC-REFERENCE Page 1 of 2',
].join('\n');

export function rateInput(text=rateText){
  return {documentId:'synthetic-rate-confirmation',pages:[{id:'page-1',observations:[textObservation(text)]}]};
}
