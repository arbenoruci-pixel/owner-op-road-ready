import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function pass(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

const contracts = await import('../source/src/modules/scan/scannerContractsV106.js');
const geometry = await import('../source/src/modules/scan/captureGeometryV106.js');
const { createWebScannerAdapterV106 } = await import('../source/src/modules/scan/webScannerAdapterV106.js');

const rectangle = geometry.createDocumentCandidateV106({
  id:'candidate_b',
  source:'rectangle-detection',
  contour:[{ x:.1, y:.1 }, { x:.9, y:.1 }, { x:.9, y:.9 }, { x:.1, y:.9 }],
  score:.88,
});
const segmentation = geometry.createDocumentCandidateV106({
  id:'candidate_a',
  source:'paper-segmentation',
  contour:[{ x:.12, y:.1 }, { x:.88, y:.1 }, { x:.88, y:.9 }, { x:.12, y:.9 }],
  score:.88,
});
const sortedOne = contracts.stableSortCandidatesV106([rectangle, segmentation]).map(item => item.id);
const sortedTwo = contracts.stableSortCandidatesV106([segmentation, rectangle]).map(item => item.id);
pass(JSON.stringify(sortedOne) === JSON.stringify(sortedTwo), 'candidate ordering is deterministic when input order changes');
pass(sortedOne[0] === 'candidate_b', 'candidate tie-breaking uses area before identifier');

const uncertain = contracts.candidateSelectionV106([
  { ...rectangle, score:.71 },
  { ...segmentation, score:.68 },
]);
pass(uncertain.uncertain === true && uncertain.candidates.length === 2, 'uncertain detection returns competing document candidates');

const curvedContour = [
  { x:.08, y:.12 }, { x:.3, y:.08 }, { x:.52, y:.06 }, { x:.74, y:.08 }, { x:.94, y:.14 },
  { x:.92, y:.9 }, { x:.7, y:.94 }, { x:.5, y:.96 }, { x:.28, y:.94 }, { x:.08, y:.88 },
];
const curved = geometry.candidateWithContourV106(rectangle, curvedContour);
pass(curved.mesh.top.length >= 12 && curved.mesh.bottom.length >= 12, 'curved contour creates a multi-control-point mesh');
pass(curved.metrics.curvatureScore > 0, 'mesh geometry measures document curvature');

const quality = contracts.createPageQualityReportV106({
  documentCoverage:.22,
  edgeCompleteness:.4,
  blurScore:.2,
  glareScore:.2,
  shadowScore:.7,
  perspectiveSeverity:.3,
  curvatureScore:.2,
  textPixelHeight:7,
  clippingRisk:.6,
  resolutionScore:.3,
});
pass(quality.quality === 'recapture', 'quality gate blocks a severely unreadable capture');
pass(quality.reasons.includes('Move closer — text is too small'), 'quality report explains insufficient text size');
pass(quality.reasons.includes('Hold still — image is blurred'), 'quality report explains blur');
pass(quality.reasons.includes('Tilt the phone — glare covers part of the document'), 'quality report explains glare');
pass(quality.reasons.includes('Include all four page edges'), 'quality report explains clipping');

const adapter = createWebScannerAdapterV106();
pass(contracts.assertScannerAdapterV106(adapter) === adapter, 'web scanner implements the complete ScannerAdapter contract');

const originalFile = { name:'fixture.jpg', size:1200, type:'image/jpeg' };
const packet = contracts.createScannedPacketV106({
  source:'test',
  pages:[{
    geometryMode:'planar',
    quality:{ quality:'usable' },
    versions:{ original:contracts.createVersionRecordV106('original', originalFile, { hash:'fixture-hash' }) },
  }],
});
pass(packet.manifest.originalPreserved === true, 'packet requires an immutable original page version');
pass(packet.pages[0].versions.original.immutable === true, 'original version is explicitly immutable');
pass(packet.manifest.classificationTouched === false, 'capture packet records classification isolation');
const nativeWithoutOriginal = contracts.createScannedPacketV106({
  source:'native-document-scanner',
  originalPreserved:false,
  pages:packet.pages,
});
pass(nativeWithoutOriginal.manifest.originalPreserved === false, 'native bridge cannot claim source preservation when the host omits originals');

const captureSource = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const adapterSource = read('source/src/modules/scan/scannerAdapterV106.js');
const webSource = read('source/src/modules/scan/webScannerAdapterV106.js');
const assetStoreSource = read('source/src/modules/scan/captureAssetStoreV106.js');
const materializerSource = read('scripts/materialize-v106-smart-capture.mjs');
const mountedCapture = read('source/src/modules/scan/SmartDocumentCaptureV100.jsx');
const scanSource = read('source/src/modules/scan/SmartScanSheetV105.jsx');
const foundationSource = read('source/src/modules/documents/documentFoundationV105.js');
const vaultSource = read('source/src/modules/documents/DocumentVaultV105.jsx');
const dexieSource = read('lib/local-db/dexie.js');

pass(captureSource.includes('Scan all documents in this photo'), 'gallery workflow can scan multiple papers from one image');
pass(captureSource.includes('Find paper again') && captureSource.includes('Move contour'), 'correction UI supports smart boundary recovery and whole-contour movement');
pass(captureSource.includes('Add point') && captureSource.includes('Remove point'), 'correction UI supports variable control points');
pass(captureSource.includes('Improve anyway'), 'gallery import can continue after a recapture recommendation');
pass(captureSource.includes('ocrFile') && captureSource.includes('originalPreserved'), 'cleaned OCR input remains separate from the saved original');
pass(captureSource.includes('Add another page') && captureSource.includes('completedBatches'), 'web capture keeps sequential multi-page scanning');
pass(captureSource.includes('captureAssets') && captureSource.includes('createScannedPacketV106'), 'capture completion exports versioned assets and a combined packet manifest');
pass(adapterSource.includes('VNDetectDocumentSegmentationRequest'), 'native iOS bridge requests document segmentation');
pass(adapterSource.includes('ML_KIT_DOCUMENT_SCANNER_FULL'), 'native Android bridge requests full ML Kit scanner mode');
pass(adapterSource.includes('processNativePage'), 'native cleaned output is assessed without rewarping it against original coordinates');
pass(webSource.includes("source:'paper-segmentation'") && webSource.includes("'text-density'") && webSource.includes("'saliency'"), 'web fallback combines independent candidate signals');
pass(webSource.includes('meshDewarpFileV106') && webSource.includes('perspectiveCropFile'), 'web fallback has planar and mesh geometry correction modes');
pass(webSource.includes("createVersionRecordV106('original'") && webSource.includes("createVersionRecordV106('detected-mask'"), 'page pipeline preserves original and mask versions');
pass(assetStoreSource.includes('groupCaptureAssetsV106') && assetStoreSource.includes('restoreCaptureRunV106'), 'capture assets are deduplicated and retained in restorable versioned runs');
pass(dexieSource.includes('capture_asset_blobs'), 'capture variants use an isolated IndexedDB table');
pass(scanSource.includes('persistCaptureAssetsV106'), 'Smart Scan persists capture assets after saving the original');
pass(foundationSource.includes('captureAssetCount') && foundationSource.includes('captureManifest'), 'Vault records carry serializable capture provenance');
pass(vaultSource.includes('capture-compare-v106') && vaultSource.includes("openCaptureVersion('compare')"), 'Document Vault exposes Original, Cleaned and Compare views');
pass(mountedCapture.includes("import SmartDocumentCaptureV106 from './SmartDocumentCaptureV106.jsx';"), 'Road Ready capture entrypoint mounts Smart Capture v106');
pass(!materializerSource.includes('truckDocumentEngineV1040.js') && !materializerSource.includes('truckDocumentCatalogV1040.js'), 'Phase 1 materializer does not modify classification or taxonomy');
pass(read('public/app-version.json').includes('106.0.0'), 'v106 release metadata is written');

console.log('PASS — v106 Smart Capture Phase 1 regression suite');
