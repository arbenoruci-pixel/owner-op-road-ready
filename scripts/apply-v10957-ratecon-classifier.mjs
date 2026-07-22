import fs from 'node:fs';

const VERSION = '109.5.7';
const BUILD = 'v10957-ratecon-contract-intelligence';
const CATALOG_PATH = 'source/src/modules/scan/truckDocumentCatalogV1040.js';
const ENGINE_PATH = 'source/src/modules/scan/truckDocumentEngineV1040.js';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v109.5.7 missing ${label}`);
  return content.replace(before, after);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

let catalog = read(CATALOG_PATH);

catalog = replaceRequired(
  catalog,
  `  t('rate_confirmation','Rate Confirmation','Rate Con','load','loads','other',['load_folder','billing','factoring','logbook'],[
    [/rate\\s+confirmation/i,75],[/carrier\\s+rate/i,55],[/total\\s+(?:carrier\\s+)?pay/i,50],[/load\\s*(?:number|no\\.?|#)/i,20],
    [/(?:pickup|load\\s+at).{0,80}(?:deliver|delivery|deliver\\s+to)/is,28],[/linehaul/i,16],[/fuel\\s+surcharge/i,14],
  ],{ required:['loadNo','broker','total','origin','destination'], fileSignals:[/rate.?con|load.?confirm/i], priority:40 }),`,
  `  t('rate_confirmation','Rate Confirmation','Rate Con','load','loads','other',['load_folder','billing','factoring','logbook'],[
    [/load\\s+confirmation\\s+and\\s+payment\\s+agreement/i,120],
    [/rate\\s+confirmation(?:\\s+agreement)?/i,95],
    [/carrier\\s+rate\\s+confirmation/i,100],
    [/confirmation\\s+must\\s+be\\s+signed\\s+and\\s+returned/i,82],
    [/please\\s+sign\\s*(?:&|and)\\s*return/i,62],
    [/broker\\s+signature.{0,140}carrier\\s+signature/is,74],
    [/flat\\s+rate\\s*[:#-]?\\s*\\$/i,46],
    [/broker\\s*\\/\\s*carrier\\s+agreement/i,42],
    [/service\\s+compliance\\s*&\\s*administrative\\s+charges/i,28],
    [/carrier\\s+rate/i,55],[/total\\s+(?:carrier\\s+)?pay/i,50],[/load\\s*(?:number|no\\.?|#)/i,20],
    [/(?:pickup|initial\\s+pickup|load\\s+at).{0,100}(?:deliver|delivery|deliver\\s+to|stop\\s*#?\\s*1)/is,32],
    [/line\\s*haul|linehaul/i,16],[/fuel\\s+surcharge/i,14],
  ],{
    required:['loadNo','broker','total','origin','destination'],
    fileSignals:[
      [/(?:carrier|freight)[-_ ]*confirmation|carrierconfirmation/i,135],
      [/(?:ready[-_ ]*to[-_ ]*sign|sign[-_ ]*and[-_ ]*return)/i,48],
      [/rate[-_ ]?con(?:firmation)?|load[-_ ]?confirm/i,92],
    ],
    priority:48,
  }),`,
  'Rate Confirmation catalog rules',
);

catalog = replaceRequired(
  catalog,
  `  t('pod','Proof of Delivery','POD','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/proof\\s+of\\s+delivery/i,90],[/\\bPOD\\b/i,42],[/(?:received|delivered)\\s+by/i,38],[/receiver\\s+signature/i,42],
    [/signed\\s+by/i,34],[/delivery\\s+receipt/i,35],
  ],{ required:['loadNo','signaturePresent'], fileSignals:[/\\bpod\\b|proof.?of.?delivery|signed.?bol/i], priority:50 }),`,
  `  t('pod','Proof of Delivery','POD','load','documents','pod',['load_folder','billing','factoring','logbook'],[
    [/proof\\s+of\\s+delivery/i,90],[/\\bPOD\\b/i,42],[/(?:received|delivered)\\s+by/i,38],[/receiver\\s+signature/i,42],
    [/consignee\\s+signature/i,42],[/signature\\s+of\\s+(?:receiver|consignee)/i,42],
    [/signed\\s+by/i,34],[/delivery\\s+receipt/i,35],
  ],{
    required:['loadNo','signaturePresent'],
    fileSignals:[/\\bpod\\b|proof.?of.?delivery|signed.?bol/i],
    negativeSignals:[
      [/(?:failure\\s+to\\s+submit|required\\s+documentation|must\\s+be\\s+submitted).{0,220}(?:POD\\s*\\/\\s*BOL|proof\\s+of\\s+delivery).{0,220}(?:billing|administrative|freight\\s+charges?)/is,110],
      [/all\\s+required\\s+documentation.{0,120}including\\s+signed\\s+proof\\s+of\\s+delivery\\s+and\\s+bill\\s+of\\s+lading/is,105],
    ],
    priority:50,
  }),`,
  'POD boilerplate guards',
);

write(CATALOG_PATH, catalog);

let engine = read(ENGINE_PATH);

if (!engine.includes('function rateConClassificationContextV10957')) {
  engine = engine.replace(
    'function scoreType(meta, sourceText, fileName, baseTypeId, preferredType, context) {',
    `function rateConClassificationContextV10957(sourceText = '', fileName = '') {
  const text = plainText(sourceText).toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const rateFile = /(?:carrier|freight)[-_ ]*confirmation|carrierconfirmation|rate[-_ ]?con(?:firmation)?|load[-_ ]?confirmation/.test(name);
  const readyToSignFile = /ready[-_ ]*to[-_ ]*sign|sign[-_ ]*and[-_ ]*return/.test(name);
  const rateHeading = /load\\s+confirmation\\s+and\\s+payment\\s+agreement|rate\\s+confirmation(?:\\s+agreement)?|carrier\\s+rate\\s+confirmation/.test(text);
  const signaturePair = /broker\\s+signature/.test(text) && /carrier\\s+signature/.test(text);
  const signedReturn = /confirmation.{0,80}(?:signed|sign).{0,45}return(?:ed)?|please\\s+sign\\s*(?:&|and)\\s*return/.test(text);
  const rateTerms = /flat\\s+rate\\s*[:#-]?\\s*\\$|all[- ]?in\\s+rate|total\\s+carrier\\s+pay|agreed\\s+rate|line\\s*haul|fuel\\s+surcharge/.test(text);
  const contractTerms = /broker\\s*\\/\\s*carrier\\s+agreement|service\\s+compliance\\s*&\\s*administrative\\s+charges/.test(text);
  const podReceiverEvidence = /receiver\\s+signature|consignee\\s+signature|signature\\s+of\\s+(?:receiver|consignee)|(?:received|delivered)\\s+by|signed\\s+by/.test(text);
  const podCompletionEvidence = /received\\s+in\\s+good\\s+order|date\\s+delivered|delivery\\s+(?:date|time)|delivered\\s+(?:date|time)/.test(text);
  const podTitle = /^(?:.{0,180})?(?:proof\\s+of\\s+delivery|delivery\\s+receipt)/.test(text.slice(0, 900));
  const podBoilerplate = /(?:failure\\s+to\\s+submit|required\\s+documentation|must\\s+be\\s+submitted).{0,240}(?:pod\\s*\\/\\s*bol|proof\\s+of\\s+delivery).{0,240}(?:billing|administrative|freight\\s+charges?)/s.test(text)
    || /all\\s+required\\s+documentation.{0,140}including\\s+signed\\s+proof\\s+of\\s+delivery\\s+and\\s+bill\\s+of\\s+lading/s.test(text);
  const rateContract = (rateHeading && (signaturePair || signedReturn || rateTerms || contractTerms))
    || (rateFile && (rateHeading || rateTerms || signedReturn || signaturePair || readyToSignFile))
    || (rateFile && readyToSignFile);
  const completedPod = podReceiverEvidence || (podTitle && podCompletionEvidence);
  return {
    rateContract,
    completedPod,
    podBoilerplate,
    rateFile,
    readyToSignFile,
    rateHeading,
    signaturePair,
    rateTerms,
  };
}

function scoreType(meta, sourceText, fileName, baseTypeId, preferredType, context) {`,
  );
}

engine = replaceRequired(
  engine,
  `  if (typeEvidence) score += Number(meta.priority || 0);
  return { meta, score, evidence, typeEvidence };`,
  `  const contractContext = rateConClassificationContextV10957(sourceText, fileName);
  if (meta.id === 'rate_confirmation' && contractContext.rateContract) {
    const weight = contractContext.rateFile && contractContext.readyToSignFile ? 150 : 118;
    score += weight;
    typeEvidence = true;
    evidence.push({ source:'contract-structure-v10957', pattern:'rate-confirmation-contract', weight });
  }
  if (meta.id === 'pod' && contractContext.rateContract && !contractContext.completedPod) {
    const weight = contractContext.podBoilerplate ? 135 : 72;
    score -= weight;
    evidence.push({ source:'contract-structure-v10957', pattern:'pod-mentioned-as-required-paperwork', weight:-weight });
  }
  if (typeEvidence) score += Number(meta.priority || 0);
  return { meta, score, evidence, typeEvidence };`,
  'classification structural adjustment',
);

if (!engine.includes('function cityStateAfterHeadingV10957')) {
  engine = engine.replace(
    'function extractCommonFields(text = \'\', baseFields = {}, typeId = \'other\') {',
    `function cityStateAfterHeadingV10957(text = '', headingPattern) {
  const rows = String(text || '').split(/\\r?\\n/).map(cleanValue).filter(Boolean);
  for (let index = 0; index < rows.length; index += 1) {
    headingPattern.lastIndex = 0;
    if (!headingPattern.test(rows[index])) continue;
    const block = rows.slice(index + 1, index + 10).join(' | ');
    const match = block.match(/\\b([A-Z][A-Za-z.' -]{2,40},\\s*[A-Z]{2})(?:\\s+\\d{5}(?:-\\d{4})?)?\\b/i);
    if (match?.[1]) return cleanValue(match[1]);
  }
  return '';
}

function canonicalLoadNumberV10957(value = '') {
  const token = cleanValue(value).toUpperCase().replace(/^#/, '');
  if (!token || !/\\d/.test(token)) return '';
  if (/^(?:CONFIRMATION|AGREEMENT|PAYMENT|CARRIER|LOAD|ORDER|TRIP|NUMBER|NO)$/.test(token)) return '';
  return token.slice(0, 28);
}

function brokerCompanyFromRateConV10957(text = '') {
  return String(text || '').split(/\\r?\\n/)
    .map(cleanValue)
    .find(line => (
      line.length >= 5
      && line.length <= 100
      && /\\b(?:logistics|transportation|freight|brokerage)\\b/i.test(line)
      && /\\b(?:LLC|Inc\\.?|Corp\\.?|Company|Co\\.?)\\b/i.test(line)
      && !/^carrier\\s*:/i.test(line)
    )) || '';
}

function extractCommonFields(text = '', baseFields = {}, typeId = 'other') {`,
  );
}

engine = replaceRequired(
  engine,
  `      /(?:load|order|confirmation|shipment|trip)\\s*(?:number|no\\.?|#)\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,`,
  `      /(?:load|order|confirmation|shipment|trip)\\s*(?:number|no\\.?|#)\\s*[:#-]*\\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,`,
  'LOAD NO punctuation reader',
);

engine = replaceRequired(
  engine,
  `  const sourceUpper = source.toUpperCase();`,
  `  if (typeId === 'rate_confirmation') {
    const rateLoadNo = firstCapture(source, [
      /\\bLOAD\\s*(?:NUMBER|NO\\.?|#)\\s*[:#-]*\\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,
      /\\bCONFIRMATION\\s*(?:NUMBER|NO\\.?|#)\\s*[:#-]*\\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,
    ]);
    const flatRate = moneyCapture(source, 'flat\\\\s+rate|total\\\\s+carrier\\\\s+pay|all[- ]?in\\\\s+rate|agreed\\\\s+rate|total\\\\s+rate');
    common.loadNo = canonicalLoadNumberV10957(rateLoadNo)
      || canonicalLoadNumberV10957(common.loadNo)
      || canonicalLoadNumberV10957(fields.loadNo)
      || canonicalLoadNumberV10957(fields.orderNo)
      || canonicalLoadNumberV10957(common.poNumber);
    common.broker = fields.broker || common.broker || brokerCompanyFromRateConV10957(source);
    common.total = fields.total || fields.gross || flatRate || common.total;
    common.origin = fields.origin || common.origin || cityStateAfterHeadingV10957(source, /^(?:initial\\s+pickup|pickup|origin|shipper)\\b/i);
    common.destination = fields.destination || common.destination || cityStateAfterHeadingV10957(source, /^(?:stop\\s*#?\\s*1\\s*\\(delivery\\)|first\\s+delivery|delivery|destination|consignee)\\b/i);
  }

  const sourceUpper = source.toUpperCase();`,
  'Rate Confirmation field refinements',
);

engine = replaceRequired(
  engine,
  `  common.loadNo = fields.loadNo || fields.orderNo || common.loadNo || common.bolNo || common.poNumber;`,
  `  common.loadNo = typeId === 'rate_confirmation'
    ? (canonicalLoadNumberV10957(common.loadNo) || canonicalLoadNumberV10957(fields.loadNo) || canonicalLoadNumberV10957(fields.orderNo) || canonicalLoadNumberV10957(common.poNumber))
    : (fields.loadNo || fields.orderNo || common.loadNo || common.bolNo || common.poNumber);`,
  'canonical Rate Confirmation load number priority',
);

write(ENGINE_PATH, engine);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) lock.packages[''].version = VERSION;
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.7 Rate Con Intelligence',
  force:true,
  notes:[
    'Recognizes carrier and load confirmation contracts even when their terms mention POD, BOL or proof-of-delivery submission requirements.',
    'Uses the filename, contract heading, signature blocks, payment language and rate terms together instead of treating one POD phrase as the whole document.',
    'Requires real receiver, consignee or received-by evidence before a Rate Confirmation can be overridden as a POD.',
    'Reads LOAD NO: # values, broker company names, first pickup, first delivery and flat-rate amounts more reliably.',
    'Keeps Smart Scan storage, Billing, Logbook and certified duty-status data unchanged.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('v109.5.7 Rate Con contract intelligence applied');
