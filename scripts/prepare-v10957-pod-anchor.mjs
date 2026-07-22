import fs from 'node:fs';

const path = 'source/src/modules/scan/truckDocumentCatalogV1040.js';
const source = fs.readFileSync(path, 'utf8');
const baseline = `  t('pod','Proof of Delivery','POD','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/proof\\s+of\\s+delivery/i,90],[/\\bPOD\\b/i,42],[/(?:received|delivered)\\s+by/i,38],[/receiver\\s+signature/i,42],
    [/signed\\s+by/i,34],[/delivery\\s+receipt/i,35],
  ],{ required:['loadNo','signaturePresent'], fileSignals:[/\\bpod\\b|proof.?of.?delivery|signed.?bol/i], priority:50 }),`;

const podToken = "t('pod'";
const nextToken = "t('delivery_receipt'";
const tokenStart = source.indexOf(podToken);
const nextStart = tokenStart >= 0 ? source.indexOf(nextToken, tokenStart + podToken.length) : -1;

if (tokenStart < 0 || nextStart < 0 || nextStart <= tokenStart) {
  const nearby = source.match(/Proof of Delivery[\s\S]{0,600}/i)?.[0] || 'no Proof of Delivery snippet';
  throw new Error(`v109.5.7 could not locate the generated POD catalog boundaries: ${nearby}`);
}

const lineStart = source.lastIndexOf('\n', tokenStart) + 1;
const replacementEnd = source.lastIndexOf('\n', nextStart) + 1;
const updated = `${source.slice(0, lineStart)}${baseline}\n${source.slice(replacementEnd)}`;

fs.writeFileSync(path, updated);
console.log('v109.5.7 POD catalog anchor prepared');
