// Sanitized fixtures authored for these regressions. No customer document text,
// companies, identifiers, signatures, addresses or dates are reproduced here.
export const damagedShortBol = [
  'BILL OF LADIN',
  'G-SHORT FORM',
  'ORIGINAL-NOT NEGOTIABLE',
  'BOL Number: SYN-BOL-0042',
  'Load Number: SYN-LOAD-9001',
  'FROM SHIPPER: Synthetic Mill LLC',
  'TO CONSIGNEE: Synthetic Market Inc',
  'Carrier: Synthetic Transport LLC',
  'Total Weight: 1200 LB',
  'Date: 04/05/2026',
  '99 Example Road',
  'Example City, ZZ 00000',
].join('\n');

export const rateWithBolTerms = [
  'RATE CONFIRMATION',
  'Load Number: SYN-LOAD-9001',
  'Broker: Synthetic Brokerage LLC',
  'Carrier: Synthetic Transport LLC',
  'Total Rate: $1800.00',
  'Shipper: Synthetic Mill LLC',
  'Consignee: Synthetic Market Inc',
  'BOL Number: SYN-BOL-0042',
  'BILL OF LADING must accompany the invoice.',
  'Please return the ORIGINAL-NOT NEGOTIABLE BILL OF LADIN G-SHORT FORM.',
  'FROM SHIPPER paperwork is required for payment.',
].join('\n');

export const signedCarrierAgreement = [
  'BROKER CARRIER AGREEMENT',
  'BROKER',
  'Company Name: Synthetic Brokerage LLC',
  'Signed by: Synthetic Broker Signer',
  'CARRIER',
  'Company Name: Synthetic Transport LLC',
  'Signed by: Synthetic Carrier Signer',
  'Effective Date: 2026-10-01',
].join('\n');
