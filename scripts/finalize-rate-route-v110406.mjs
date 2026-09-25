import fs from 'node:fs';

const path = 'source/src/modules/scan/truckDocumentEngineV1040.js';
let source = fs.readFileSync(path, 'utf8');
function patch(before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error('Rate route correction anchor changed');
  source = source.replace(before, after);
}

patch(
  "import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';",
  "import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';\nimport { invalidRateRouteLocation, rateRouteLocation } from './rateRouteLocationV110406.js';",
);
patch(
  '  const fields = mergeMeaningful(baseFields);',
  `  const fields = mergeMeaningful(baseFields);
  if (typeId === 'rate_confirmation') {
    for (const key of ['origin', 'destination']) {
      if (invalidRateRouteLocation(fields[key])) delete fields[key];
    }
  }`,
);
patch(
  String.raw`    common.origin = fields.origin || common.origin || cityStateAfterHeadingV10957(source, /^(?:initial\s+pickup|pickup|origin|shipper)\b/i);
    common.destination = fields.destination || common.destination || cityStateAfterHeadingV10957(source, /^(?:stop\s*#?\s*1\s*\(delivery\)|first\s+delivery|delivery|destination|consignee)\b/i);`,
  `    common.origin = rateRouteLocation(source, 'pickup', fields.origin);
    common.destination = rateRouteLocation(source, 'delivery', fields.destination);`,
);
patch(
  String.raw`  common.origin = fields.origin || firstCapture(source, [/(?:ship\s+from|pickup|load\s+at|origin)\s*[:#-]?\s*([^\n]{3,130})/i]);
  common.destination = fields.destination || firstCapture(source, [/(?:ship\s+to|delivery|deliver\s+to|destination)\s*[:#-]?\s*([^\n]{3,130})/i]);`,
  String.raw`  if (typeId !== 'rate_confirmation') {
    common.origin = fields.origin || firstCapture(source, [/(?:ship\s+from|pickup|load\s+at|origin)\s*[:#-]?\s*([^\n]{3,130})/i]);
    common.destination = fields.destination || firstCapture(source, [/(?:ship\s+to|delivery|deliver\s+to|destination)\s*[:#-]?\s*([^\n]{3,130})/i]);
  }`,
);

fs.copyFileSync('scripts/v110406/rateRouteLocation.js', 'source/src/modules/scan/rateRouteLocationV110406.js');
fs.writeFileSync(path, source);
console.log('Rate confirmation routes retain stop locations and reject contract prose.');
