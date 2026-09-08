import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.1';
const BUILD='v110301-parts-receipt-reader';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);

function replaceOnce(source,before,after,label){
  if(source.includes(after)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.3.1 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}

// The catalog now recognizes the physical structure of a parts-counter receipt,
// independent of dealer brand. Strong repair/service evidence subtracts score so
// a work order with labor is still a Repair Invoice.
{
  const path='source/src/modules/scan/truckDocumentCatalogV1040.js';
  let source=read(path);
  const before=`  t('parts_receipt','Truck Parts Receipt','Parts','maintenance','maintenance','other',['maintenance','expenses','tax'],[
    [/auto\\s+parts|truck\\s+parts|part\\s+number/i,34],
    [/quantity/i,10],
    [/core\\s+charge/i,18],
  ],{ required:['date','merchant','total'], fileSignals:[/parts/i], priority:8 }),`;
  const after=`  t('parts_receipt','Truck Parts Receipt','Parts','maintenance','maintenance','other',['maintenance','expenses','tax'],[
    [/\\bpart\\s*(?:n[o0]\\.?|number|#)\\b/i,62],
    [/\\bdescription\\b[\\s\\S]{0,180}\\b(?:list|net)\\b[\\s\\S]{0,120}\\bamount\\b/i,40],
    [/\\bpaid\\s+c[o0]unter\\b/i,52],
    [/\\bparts?\\b[\\s\\S]{0,140}\\bsales\\s+tax\\b[\\s\\S]{0,140}\\btotal\\b/i,36],
    [/\\bcustomer\\s+copy\\b/i,18],
    [/\\binvoice\\s*(?:number|no\\.?|#)\\b/i,16],
    [/\\bterms?\\b[\\s\\S]{0,30}\\bcash\\b/i,10],
    [/returned\\s+goods|no\\s+cash\\s+refunds?|electrical\\s+items?.{0,80}non[- ]?returnable/i,14],
  ],{ required:['date','merchant','invoiceNo','total'], fileSignals:[/parts|counter/i], priority:34, minScore:70,
    negativeSignals:[[/repair\\s+(?:order|invoice)|work\\s+order/i,58],[/\\blabor\\b|technician|service\\s+advisor|work\\s+performed|complaint\\s*:|cause\\s*:|correction\\s*:/i,42]] }),`;
  source=replaceOnce(source,before,after,'parts receipt catalog');
  write(path,source);
}

// Add a dedicated field reader after all legacy scanner materializers. This is
// deliberately scoped to parts_receipt so load identity, Rate Con, fuel, POD,
// Logbook and HOS paths cannot be changed by this release.
{
  const path='source/src/modules/scan/truckDocumentEngineV1040.js';
  let source=read(path);
  source=replaceOnce(source,
    `import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';`,
    `import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';\nimport { extractPartsReceiptFieldsV11031 } from './partsReceiptV11031.js';`,
    'parts field reader import');
  source=replaceOnce(source,
    `  const fields = extractCommonFields(text, base.fields || {}, meta.id);`,
    `  let fields = extractCommonFields(text, base.fields || {}, meta.id);\n  if (meta.id === 'parts_receipt') fields = extractPartsReceiptFieldsV11031(text, fields);`,
    'parts field reader integration');
  write(path,source);
}

// Keep the researched template layer aware of the same structural document.
// This prevents future arbitration passes from treating a parts-counter sale as
// a generic invoice while still allowing real labor/work-order evidence to win.
{
  const path='source/src/modules/scan/truckDocumentTemplateIntelligenceV1042.js';
  let source=read(path);
  source=replaceOnce(source,
    `import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';`,
    `import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';\nimport { extractPartsReceiptFieldsV11031 } from './partsReceiptV11031.js';`,
    'template parts import');
  const marker=`function repair(text) {`;
  if(!source.includes('function partsReceipt(text) {')){
    assert.ok(source.includes(marker),'110.3.1 template repair anchor missing');
    const profile=`function partsReceipt(text) {\n  const p = scoreProfile({ id:'truck-parts-counter-receipt', typeId:'parts_receipt', text, threshold:96, positive:[\n    [/\\bpart\\s*(?:n[o0]\\.?|number|#)\\b/i,62,'part-number column'],\n    [/\\bdescription\\b[\\s\\S]{0,180}\\b(?:list|net)\\b[\\s\\S]{0,120}\\bamount\\b/i,40,'parts price table'],\n    [/\\bpaid\\s+c[o0]unter\\b/i,52,'paid counter'],\n    [/\\bparts?\\b[\\s\\S]{0,140}\\bsales\\s+tax\\b[\\s\\S]{0,140}\\btotal\\b/i,36,'parts tax total'],\n    [/\\bcustomer\\s+copy\\b/i,18,'customer copy'], [/\\binvoice\\s*(?:number|no\\.?|#)\\b/i,16,'invoice #'],\n    [/\\b(?:truck\\s+cent(?:er|ers)|fleetpride|truckpro|mack|volvo|freightliner|kenworth|peterbilt|international|western\\s+star)\\b/i,10,'truck parts seller'],\n  ], negative:[\n    [/repair\\s+(?:order|invoice)|work\\s+order/i,58,'repair order'],\n    [/\\blabor\\b|technician|service\\s+advisor|work\\s+performed|complaint\\s*:|cause\\s*:|correction\\s*:/i,42,'repair work'],\n  ] });\n  const structural = p.evidence.filter(x => ['part-number column','parts price table','paid counter','parts tax total'].includes(x)).length;\n  if (structural >= 3) p.score += 30;\n  p.strong = p.score >= p.threshold;\n  p.data = { structural };\n  return p;\n}\n\n`;
    source=source.replace(marker,profile+marker);
  }
  source=replaceOnce(source,
    `return [lumper(source), rateCon(source), fuel(source), repair(source), scale(source)].sort((a,b) => b.score-a.score || Number(b.strong)-Number(a.strong));`,
    `return [lumper(source), rateCon(source), fuel(source), partsReceipt(source), repair(source), scale(source)].sort((a,b) => b.score-a.score || Number(b.strong)-Number(a.strong));`,
    'template candidates');
  source=replaceOnce(source,
    `const rateMistake = currentId === 'rate_confirmation' && ['lumper_receipt','fuel_receipt','fuel_card_statement','repair_invoice','scale_ticket'].includes(top.typeId);`,
    `const rateMistake = currentId === 'rate_confirmation' && ['lumper_receipt','fuel_receipt','fuel_card_statement','parts_receipt','repair_invoice','scale_ticket'].includes(top.typeId);`,
    'rate guess correction list');
  source=replaceOnce(source,
    `  if(typeId==='rate_confirmation')return sanitizeRate(clean(text),fields);`,
    `  if(typeId==='rate_confirmation')return sanitizeRate(clean(text),fields);\n  if(typeId==='parts_receipt')return extractPartsReceiptFieldsV11031(clean(text),fields);`,
    'template parts sanitize');
  source=source.replace("'repair/service invoices','CAT/certified scale tickets'","'truck parts counter receipts','repair/service invoices','CAT/certified scale tickets'");
  write(path,source);
}

// Release metadata. Normal non-forced PWA update; no IndexedDB clearing.
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(read(path));
  Object.assign(meta,{
    version:VERSION,build:BUILD,force:false,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||meta.sourceCommit||null,
    releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    label:'Structural truck parts receipt reader',
    notes:[
      'Recognizes truck parts-counter receipts from part-number, pricing-table, paid-counter, sales-tax and customer-copy structure instead of relying on a dealer name.',
      'Extracts invoice number, date, total, parts amount, sales tax, freight, payment method, account number and first part line when visible.',
      'Repair invoices with labor/work-order evidence remain Repair Invoice; Rate Con, Logbook, HOS, fuel and load identity paths are unchanged.'
    ]
  });
  write(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`)
    .replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  write(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let source=read(path);
  source=source.replace(/App v110\.3\.0/g,`App v${VERSION}`).replace(/APP V110\.3\.0/g,`APP V${VERSION}`);
  write(path,source);
}

console.log('PASS — 110.3.1 structural Truck Parts Receipt reader finalized after all legacy materializers');
