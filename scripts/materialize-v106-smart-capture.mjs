import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.0.0';
const RELEASED_AT = '2026-07-19T16:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v106 missing ${label}`);
  return content.replace(before, after);
}
function materializeCompressedAsset(relative, assetName) {
  const encoded = read(`scripts/v106-assets/${assetName}`);
  write(relative, gunzipSync(Buffer.from(encoded, 'base64')));
}

materializeCompressedAsset(
  'source/src/modules/scan/SmartDocumentCaptureV106.jsx',
  'SmartDocumentCaptureV106.jsx.gz.b64',
);
materializeCompressedAsset(
  'source/src/modules/scan/webScannerAdapterV106.js',
  'webScannerAdapterV106.js.gz.b64',
);

// Phase 1 replaces the capture layer while leaving recognition and canonical
// entity logic on the currently pinned release.
const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV100.jsx';
let capture = read(capturePath);
capture = replaceOnce(
  capture,
  "import TurboDocumentScanner from './TurboDocumentScanner.jsx';",
  "import SmartDocumentCaptureV106 from './SmartDocumentCaptureV106.jsx';",
  'smart capture component import',
);
capture = replaceOnce(
  capture,
  '      <TurboDocumentScanner',
  '      <SmartDocumentCaptureV106',
  'smart capture component mount',
);
write(capturePath, capture);

// Add a separate IndexedDB table for versioned capture assets. The primary
// document blob stays unchanged so every existing original-file path remains safe.
const dexiePath = 'lib/local-db/dexie.js';
let dexie = read(dexiePath);
if (!dexie.includes('capture_asset_blobs')) {
  dexie = replaceOnce(
    dexie,
    "  db.version(2).stores({\n    inspections_local: '&local_id, server_id, client_inspection_id, driver_id, log_date, status, updated_at, sync_state'\n  });\n\n  return db;",
    "  db.version(2).stores({\n    inspections_local: '&local_id, server_id, client_inspection_id, driver_id, log_date, status, updated_at, sync_state'\n  });\n\n  db.version(3).stores({\n    capture_asset_blobs: '&local_asset_id, client_document_id, capture_run_id, current, page_index, created_at'\n  });\n\n  return db;",
    'capture asset database schema',
  );
}
write(dexiePath, dexie);

// Persist every capture version after the immutable original succeeds. Failure
// to store optional variants never blocks the original document save.
const scanPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { saveScannedDocument } from './scanStorage.js';",
  "import { saveScannedDocument } from './scanStorage.js';\nimport { persistCaptureAssetsV106 } from './captureAssetStoreV106.js';",
  'capture asset persistence import',
);
if (!scan.includes('const captureStorageV106 = await persistCaptureAssetsV106({')) {
  scan = replaceOnce(
    scan,
    '      const record = buildVaultDocumentV105({',
    `      const captureStorageV106 = await persistCaptureAssetsV106({
        clientDocumentId:stored.localDocument?.client_document_id || '',
        assets:Array.isArray(analysis?.scanMeta?.captureAssets) ? analysis.scanMeta.captureAssets : [],
        captureManifest:analysis?.scanMeta?.captureManifest || null,
        scannerVersion:analysis?.scanMeta?.scannerVersion || '106.0.0',
      });
      stored.capture = captureStorageV106;
      if (stored.localDocument) {
        stored.localDocument.capture_manifest = analysis?.scanMeta?.captureManifest || null;
        stored.localDocument.capture_run_id = captureStorageV106.runId || '';
        stored.localDocument.capture_assets = captureStorageV106.assets || [];
        stored.localDocument.capture_asset_count = Number(captureStorageV106.stored || 0);
      }
      const record = buildVaultDocumentV105({`,
    'capture asset persistence call',
  );
}
write(scanPath, scan);

// Surface capture provenance in the serializable Vault record; no File or Blob
// object is written to the business store.
const foundationPath = 'source/src/modules/documents/documentFoundationV105.js';
let foundation = read(foundationPath);
if (!foundation.includes('captureAssetCount:numberV105(local.capture_asset_count')) {
  foundation = replaceOnce(
    foundation,
    '    originalPreserved:true,',
    `    originalPreserved:analysis?.scanMeta?.originalPreserved !== false,
    captureManifest:local.capture_manifest || analysis?.scanMeta?.captureManifest || existing?.captureManifest || null,
    captureRunId:textV105(local.capture_run_id || existing?.captureRunId),
    captureAssets:Array.isArray(local.capture_assets) ? local.capture_assets : (existing?.captureAssets || []),
    captureAssetCount:numberV105(local.capture_asset_count || existing?.captureAssetCount),`,
    'Vault capture provenance fields',
  );
}
write(foundationPath, foundation);

// Add Original, Cleaned and Compare views to the Vault detail screen. Older
// records continue to show only the original.
const vaultPath = 'source/src/modules/documents/DocumentVaultV105.jsx';
let vault = read(vaultPath);
vault = replaceOnce(
  vault,
  "import { getScannedDocumentBlob } from '../scan/scanStorage.js';",
  "import { getScannedDocumentBlob } from '../scan/scanStorage.js';\nimport { getBestCleanedCaptureBlobV106, getCaptureAssetBlobV106 } from '../scan/captureAssetStoreV106.js';",
  'Vault capture asset import',
);
if (!vault.includes("const [viewer, setViewer] = useState(null); // capture-viewer-v106")) {
  vault = replaceOnce(
    vault,
    "  const [message, setMessage] = useState('');",
    "  const [message, setMessage] = useState('');\n  const [viewer, setViewer] = useState(null); // capture-viewer-v106",
    'Vault capture viewer state',
  );
}
const oldViewOriginal = `  async function viewOriginal() {
    setMessage('Opening original…');
    try {
      const blob = await getScannedDocumentBlob(document.clientDocumentId);
      if (!blob) {
        setMessage('Original is not stored on this device. The metadata remains in the Vault.');
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('');
    } catch (error) {
      setMessage(\`Could not open original: \${String(error?.message || error)}\`);
    }
  }`;
const newViewOriginal = `  useEffect(() => () => {
    [viewer?.originalUrl, viewer?.cleanedUrl].filter(Boolean).forEach(url => URL.revokeObjectURL(url));
  }, [viewer]);

  async function openCaptureVersion(mode = 'original') {
    setMessage(mode === 'compare' ? 'Preparing comparison…' : 'Opening document image…');
    try {
      const needsOriginal = mode !== 'cleaned';
      const needsCleaned = mode !== 'original';
      const originalBlob = needsOriginal
        ? await getCaptureAssetBlobV106(document.clientDocumentId, 'original', 0) || await getScannedDocumentBlob(document.clientDocumentId)
        : null;
      const cleanedAsset = needsCleaned
        ? await getBestCleanedCaptureBlobV106(document.clientDocumentId, 0)
        : null;
      if (needsOriginal && !originalBlob) {
        setMessage('Original is not stored on this device. The metadata remains in the Vault.');
        return;
      }
      if (needsCleaned && !cleanedAsset?.blob) {
        setMessage('A cleaned capture is unavailable for this older document.');
        return;
      }
      setViewer({
        mode,
        originalUrl:originalBlob ? URL.createObjectURL(originalBlob) : '',
        cleanedUrl:cleanedAsset?.blob ? URL.createObjectURL(cleanedAsset.blob) : '',
        cleanedKind:cleanedAsset?.kind || '',
      });
      setMessage('');
    } catch (error) {
      setMessage(\`Could not open document image: \${String(error?.message || error)}\`);
    }
  }`;
if (!vault.includes('async function openCaptureVersion(')) {
  vault = replaceOnce(vault, oldViewOriginal, newViewOriginal, 'Vault capture viewer action');
}
vault = replaceOnce(
  vault,
  '          <button type="button" onClick={viewOriginal}><Icon name="eye" size={17}/> Open</button>',
  `          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button type="button" onClick={() => openCaptureVersion('original')}><Icon name="eye" size={17}/> Original</button>
            {document.captureAssetCount || document.captureManifest ? <button type="button" onClick={() => openCaptureVersion('cleaned')}>Cleaned</button> : null}
            {document.captureAssetCount || document.captureManifest ? <button type="button" onClick={() => openCaptureVersion('compare')}>Compare</button> : null}
          </div>`,
  'Vault original cleaned compare actions',
);
if (!vault.includes('capture-compare-v106')) {
  vault = replaceOnce(
    vault,
    '        <section className="vault-original-card-v105">',
    `        {viewer ? <section data-capture-viewer="capture-compare-v106" style={{ position:'fixed', inset:0, zIndex:1200, background:'rgba(2,6,23,.96)', color:'#fff', display:'grid', gridTemplateRows:'auto 1fr' }}>
          <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'14px 16px', borderBottom:'1px solid rgba(148,163,184,.32)' }}>
            <div><b>{viewer.mode === 'compare' ? 'Original and cleaned' : viewer.mode === 'original' ? 'Original document' : 'Cleaned document'}</b>{viewer.cleanedKind ? <em style={{ display:'block', opacity:.7, marginTop:3 }}>{viewer.cleanedKind.replaceAll('-', ' ')}</em> : null}</div>
            <button type="button" onClick={() => setViewer(null)} style={{ borderRadius:999, padding:'8px 12px' }}>Close</button>
          </header>
          <div style={{ overflow:'auto', padding:12, display:'grid', gridTemplateColumns:viewer.mode === 'compare' ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)', gap:10, alignItems:'start' }}>
            {viewer.mode !== 'cleaned' ? <figure style={{ margin:0 }}><figcaption style={{ marginBottom:6, fontWeight:800 }}>Original</figcaption><img src={viewer.originalUrl} alt="Original captured document" style={{ width:'100%', height:'auto', background:'#fff', borderRadius:10 }}/></figure> : null}
            {viewer.mode !== 'original' ? <figure style={{ margin:0 }}><figcaption style={{ marginBottom:6, fontWeight:800 }}>Cleaned</figcaption><img src={viewer.cleanedUrl} alt="Cleaned captured document" style={{ width:'100%', height:'auto', background:'#fff', borderRadius:10 }}/></figure> : null}
          </div>
        </section> : null}

        <section className="vault-original-card-v105">`,
    'Vault compare viewer',
  );
}
write(vaultPath, vault);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v106-smart-capture-phase-1',
  releasedAt:RELEASED_AT,
  notes:[
    'Introduces a versioned ScannerAdapter contract with a native iOS/Android bridge and deterministic web fallback.',
    'Detects and ranks multiple paper candidates from rectangle, paper segmentation, edge density, text density and saliency signals.',
    'Replaces four isolated crop dots with an editable contour supporting edge snapping, whole-contour movement and additional control points.',
    'Adds planar perspective correction, mesh dewarping, final deskew and objective quality guidance for blur, glare, shadows, clipping and text size.',
    'Keeps sequential multi-page capture and supports scanning several documents from one gallery image.',
    'Stores the untouched original plus deduplicated mask, crop, cleaned, grayscale, high-contrast, OCR-selected and thumbnail assets in versioned local capture runs.',
    'Adds Original, Cleaned and Compare views in Document Vault while retaining prior capture runs for future restore and reprocessing workflows.',
    'Sends only the cleaned OCR-selected image to the pinned reader and leaves classification, load matching and Logbook mutation behavior unchanged.'
  ],
  label:'v106 Smart Capture Phase 1',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [capturePath,"import SmartDocumentCaptureV106 from './SmartDocumentCaptureV106.jsx';"],
  [capturePath,'<SmartDocumentCaptureV106'],
  [dexiePath,'capture_asset_blobs'],
  [scanPath,'persistCaptureAssetsV106'],
  [foundationPath,'captureAssetCount:numberV105(local.capture_asset_count'],
  [vaultPath,'capture-compare-v106'],
  ['source/src/modules/scan/scannerContractsV106.js','ROAD_READY_SCANNER_CONTRACT_V106'],
  ['source/src/modules/scan/captureGeometryV106.js','meshFromContourV106'],
  ['source/src/modules/scan/webScannerAdapterV106.js','class WebScannerAdapterV106'],
  ['source/src/modules/scan/scannerAdapterV106.js','class NativeScannerAdapterV106'],
  ['source/src/modules/scan/captureAssetStoreV106.js','restoreCaptureRunV106'],
  ['source/src/modules/scan/SmartDocumentCaptureV106.jsx','Scan all documents in this photo'],
  ['source/src/modules/scan/SmartDocumentCaptureV106.jsx','Add another page'],
  ['source/src/modules/scan/SmartDocumentCaptureV106.jsx','captureAssets'],
  ['public/app-version.json','106.0.0'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v106 verification missing ${marker} in ${relative}`);
}

console.log('v106 Smart Capture Phase 1 materialized');
await import('./verify-smart-capture-v106.mjs');
