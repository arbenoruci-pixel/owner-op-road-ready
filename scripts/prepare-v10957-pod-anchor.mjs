import fs from 'node:fs';

const path = 'source/src/modules/scan/truckDocumentCatalogV1040.js';
const source = fs.readFileSync(path, 'utf8');
const pattern = /  t\('pod','Proof of Delivery','POD','load','documents','pod',\['load_folder','billing','factoring','logbook'\],[\s\S]*?(?=\n  t\('delivery_receipt')/;
const baseline = `  t('pod','Proof of Delivery','POD','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/proof\\s+of\\s+delivery/i,90],[/\\bPOD\\b/i,42],[/(?:received|delivered)\\s+by/i,38],[/receiver\\s+signature/i,42],
    [/signed\\s+by/i,34],[/delivery\\s+receipt/i,35],
  ],{ required:['loadNo','signaturePresent'], fileSignals:[/\\bpod\\b|proof.?of.?delivery|signed.?bol/i], priority:50 }),`;

if (!pattern.test(source)) {
  throw new Error('v109.5.7 could not locate the generated POD catalog entry');
}

fs.writeFileSync(path, source.replace(pattern, baseline));
console.log('v109.5.7 POD catalog anchor prepared');
