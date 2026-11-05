import fs from 'node:fs';
const files={
  'CameraAdapter.jsx':'source/src/modules/scan/v3/CameraAdapterV3.jsx',
  'captureQuality.js':'source/src/modules/scan/v3/captureQualityV1104101.js',
  'DocumentQuality.js':'source/src/modules/scan/v3/DocumentQualityV11036.js',
  'paperQuality.js':'source/src/modules/scan/v3/paperQualityV110345.js',
  'ReaderPreview.jsx':'source/src/modules/scan/OwnedReaderPreview.jsx',
  'ScanSheet.jsx':'source/src/modules/scan/SmartScanSheetV105.jsx',
  'CompactReading.jsx':'source/src/modules/scan/CompactReadingV1104101.jsx',
  'CompactReading.module.css':'source/src/modules/scan/CompactReadingV1104101.module.css',
  'compactReview.js':'source/src/modules/scan/compactReadingV1104101.js',
  'extract.js':'lib/reader-ai/extract.js',
  'extraction.js':'lib/reader-ai/extraction.js',
};
for(const [from,to] of Object.entries(files))fs.copyFileSync('scripts/scanner-clear/'+from,to);
console.log('PASS — focused scanner capture and compact document review installed');
