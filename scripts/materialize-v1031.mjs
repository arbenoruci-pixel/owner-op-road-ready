import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.1.0';
const RELEASED_AT = '2026-07-16T04:20:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.1 missing ${label}`);
  return content.replace(before, after);
}

// ---------------------------------------------------------------------------
// Turbo-style strict lock and flash hysteresis.
// ---------------------------------------------------------------------------
const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(
  turbo,
  "import { captureBestDocumentFileV1030 } from './scannerIntelligenceV1030.js';",
  "import { captureBestDocumentFileV1030 } from './scannerIntelligenceV1030.js';\nimport { nextFlashDecisionV1031, scannerLockDecisionV1031 } from './scannerPolicyV1031.js';",
  'scanner policy import'
);
turbo = replaceOnce(
  turbo,
  '  const darkFramesRef = useRef(0);',
  '  const darkFramesRef = useRef(0);\n  const brightFramesRef = useRef(0);\n  const lastFlashChangeRef = useRef(0);',
  'flash hysteresis refs'
);
turbo = replaceOnce(
  turbo,
  '    darkFramesRef.current = 0;\n    lastCornersRef.current = null;',
  '    darkFramesRef.current = 0;\n    brightFramesRef.current = 0;\n    lastFlashChangeRef.current = 0;\n    lastCornersRef.current = null;',
  'flash hysteresis reset'
);
const flashBefore = `        darkFramesRef.current = nextQuality.autoFlashNeeded
          ? Math.min(8, darkFramesRef.current + 1)
          : Math.max(0, darkFramesRef.current - 2);
        const desiredTorch = flashMode === 'on'
          || (flashMode === 'auto' && darkFramesRef.current >= 4);
        if (torchSupported && desiredTorch !== torchRef.current) {
          const changed = await setTrackTorch(trackRef.current, desiredTorch);
          if (changed) torchRef.current = desiredTorch;
        }`;
const flashAfter = `        darkFramesRef.current = nextQuality.autoFlashNeeded
          ? Math.min(12, darkFramesRef.current + 1)
          : Math.max(0, darkFramesRef.current - 1);
        brightFramesRef.current = !nextQuality.autoFlashNeeded && nextQuality.brightness >= 82
          ? Math.min(16, brightFramesRef.current + 1)
          : Math.max(0, brightFramesRef.current - 2);
        const flashNowV1031 = Date.now();
        const flashDecisionV1031 = nextFlashDecisionV1031({
          mode:flashMode,
          supported:torchSupported,
          torchOn:torchRef.current,
          darkFrames:darkFramesRef.current,
          brightFrames:brightFramesRef.current,
          sinceChangeMs:lastFlashChangeRef.current ? flashNowV1031 - lastFlashChangeRef.current : Infinity,
        });
        if (flashDecisionV1031.change) {
          const changed = await setTrackTorch(trackRef.current, flashDecisionV1031.desired);
          if (changed) {
            torchRef.current = flashDecisionV1031.desired;
            lastFlashChangeRef.current = Date.now();
            stableFramesRef.current = 0;
          }
        }`;
turbo = replaceOnce(turbo, flashBefore, flashAfter, 'stable auto flash');
const lockBefore = `            const stable = Boolean(previous)
              && cornerDelta(previous, detected.corners) < .012
              && nextQuality.good
              && detected.confidence >= .62;
            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;
            lastCornersRef.current = smoothed;
            setLiveCorners(smoothed);
            setFrameDetected(true);
            if (stableFramesRef.current >= 6 && !capturing) {
              stableFramesRef.current = 0;
              void capturePage(smoothed);
            }`;
const lockAfter = `            const deltaV1031 = previous ? cornerDelta(previous, detected.corners) : 1;
            const lockV1031 = scannerLockDecisionV1031({
              quality:{ ...nextQuality, confidence:detected.confidence, coverage:detected.coverage },
              cornerDelta:deltaV1031,
              flashAgeMs:lastFlashChangeRef.current ? Date.now() - lastFlashChangeRef.current : Infinity,
            });
            stableFramesRef.current = Boolean(previous) && lockV1031.ready ? stableFramesRef.current + 1 : 0;
            lastCornersRef.current = smoothed;
            setLiveCorners(smoothed);
            setFrameDetected(true);
            if (stableFramesRef.current >= 7 && !capturing) {
              stableFramesRef.current = 0;
              void capturePage(smoothed);
            }`;
turbo = replaceOnce(turbo, lockBefore, lockAfter, 'strict document lock');
write(turboPath, turbo);

// Tighten the text-in-paper quality gate so a blurry page cannot say "locked".
const qualityPath = 'source/src/modules/scan/documentQualityV985.js';
let quality = read(qualityPath);
quality = quality
  .replace('  const paperDetected = detection.confidence >= .42 && detection.coverage >= .1;', '  const paperDetected = detection.confidence >= .58 && detection.coverage >= .12;')
  .replace('  const blurry = sharpness < 10.5;', '  const blurry = sharpness < 14.5;')
  .replace('  const glareDetected = glareRatio > .075;', '  const glareDetected = glareRatio > .055;')
  .replace('  const tooFar = detection.coverage < .26;', '  const tooFar = detection.coverage < .32;')
  .replace('  const autoFlashNeeded = paperDetected && brightness < 48 && darkRatio > .34 && glareRatio < .025;', '  const autoFlashNeeded = paperDetected && brightness < 68 && darkRatio > .30 && glareRatio < .025;')
  .replace(
    '  const good = paperDetected && score >= 76 && !blurry && !tooDark && !tooBright && !glareDetected && !tooFar;',
    '  const good = paperDetected && score >= 82 && detection.confidence >= .68 && detection.coverage <= .93 && Number(detection.angleScore || .75) >= .70 && !blurry && !tooDark && !tooBright && !glareDetected && !tooFar;'
  );
write(qualityPath, quality);

// ---------------------------------------------------------------------------
// Capture: no surprise still-photo flash, more focus samples, good-frame first.
// ---------------------------------------------------------------------------
const intelligencePath = 'source/src/modules/scan/scannerIntelligenceV1030.js';
let intelligence = read(intelligencePath);
intelligence = intelligence.replace(
  '    good:score >= .48 && sharpness >= 9.5 && glareRatio <= .12 && brightness >= 45 && brightness <= 232,',
  '    good:score >= .54 && sharpness >= 13.5 && glareRatio <= .075 && brightness >= 55 && brightness <= 226,'
);
intelligence = intelligence.replace(
  `.sort((a, b) => (
      Number(b.quality.score || 0) - Number(a.quality.score || 0)
      || Number(b.quality.megapixels || 0) - Number(a.quality.megapixels || 0)
    ))[0] || null;`,
  `.sort((a, b) => (
      Number(Boolean(b.quality.good)) - Number(Boolean(a.quality.good))
      || Number(b.quality.score || 0) - Number(a.quality.score || 0)
      || Number(b.quality.sharpness || 0) - Number(a.quality.sharpness || 0)
      || Number(b.quality.megapixels || 0) - Number(a.quality.megapixels || 0)
    ))[0] || null;`
);
const photoBefore = `async function highResolutionPhotoCandidate(track, options = {}) {
  if (typeof window === 'undefined' || typeof window.ImageCapture !== 'function' || !track) return null;
  try {
    const capture = new window.ImageCapture(track);
    const blob = await capture.takePhoto();
    if (!blob?.size) return null;
    const image = await fileToImage(blob);
    return candidateFromSource(image, 'high-resolution-photo', options);
  } catch {
    return null;
  }
}`;
const photoAfter = `async function highResolutionPhotoCandidate(track, options = {}) {
  if (typeof window === 'undefined' || typeof window.ImageCapture !== 'function' || !track) return null;
  try {
    const capture = new window.ImageCapture(track);
    let modes = [];
    try {
      const capabilities = await capture.getPhotoCapabilities?.();
      modes = Array.isArray(capabilities?.fillLightMode) ? capabilities.fillLightMode.map(String) : [];
    } catch {}
    const requested = options.flashMode === 'on'
      ? 'flash'
      : options.flashMode === 'off'
        ? 'off'
        : options.lowLight
          ? 'flash'
          : 'off';
    let fillLightMode = requested;
    if (modes.length && !modes.includes(fillLightMode)) {
      if (fillLightMode === 'flash' && modes.includes('auto')) fillLightMode = 'auto';
      else if (modes.includes('off')) fillLightMode = 'off';
      else fillLightMode = modes[0] || '';
    }
    // When the browser cannot guarantee OFF, skip the still candidate instead of
    // allowing the operating system to fire an uncontrolled flash.
    if (!modes.length && requested === 'off') return null;
    let blob;
    try {
      blob = fillLightMode ? await capture.takePhoto({ fillLightMode }) : await capture.takePhoto();
    } catch {
      if (requested === 'off') return null;
      blob = await capture.takePhoto();
    }
    if (!blob?.size) return null;
    const image = await fileToImage(blob);
    return candidateFromSource(image, 'high-resolution-photo', options);
  } catch {
    return null;
  }
}`;
intelligence = replaceOnce(intelligence, photoBefore, photoAfter, 'controlled still-photo flash');
intelligence = intelligence.replace(
  `  onStatus('Capturing the sharpest frame…');

  for (let index = 0; index < 3; index += 1) {
    if (index) await wait(90);`,
  `  onStatus('Letting focus settle…');
  await wait(180);
  onStatus('Capturing the sharpest frame…');

  for (let index = 0; index < 5; index += 1) {
    if (index) await wait(110);`
);
intelligence = intelligence.replace(
  `  const photo = await highResolutionPhotoCandidate(track, {
    maxDimension:5600,
    minShortSide:0,
  });`,
  `  const photo = await highResolutionPhotoCandidate(track, {
    maxDimension:5600,
    minShortSide:0,
    flashMode:options.flashMode || 'auto',
    lowLight:Boolean(options.lowLight),
  });`
);
write(intelligencePath, intelligence);

// ---------------------------------------------------------------------------
// POD recognition: manual POD always wins; signed/stamped BOL can auto-promote.
// ---------------------------------------------------------------------------
const readerPath = 'source/src/modules/scan/smartDocumentReaderV1030.js';
let reader = read(readerPath);
reader = replaceOnce(
  reader,
  "import { buildOcrVariantsV1030 } from './scannerIntelligenceV1030.js';",
  "import { buildOcrVariantsV1030 } from './scannerIntelligenceV1030.js';\nimport { resolvePodDecisionV1031 } from './podWorkflowV1031.js';",
  'POD workflow import'
);
reader = replaceOnce(
  reader,
  `  if (isPdfFileV102(file) || !String(file?.type || '').startsWith('image/')) {
    return analyzeSmartDocumentV104(file, options);
  }`,
  `  if (isPdfFileV102(file) || !String(file?.type || '').startsWith('image/')) {
    const importedV1031 = await analyzeSmartDocumentV104(file, options);
    const podDecisionV1031 = resolvePodDecisionV1031({
      preferredType,
      detectedType:importedV1031?.type?.id || 'other',
      text:importedV1031?.text || '',
    });
    if (!podDecisionV1031.isPod) return importedV1031;
    const podFieldsV1031 = {
      ...(importedV1031?.fields || {}),
      podSignedEvidence:podDecisionV1031.signedEvidence,
      podSigned:podDecisionV1031.signedEvidence,
    };
    return {
      ...importedV1031,
      type:documentTypeMeta('pod'),
      detectedType:importedV1031?.detectedType || importedV1031?.type,
      fields:podFieldsV1031,
      podDecision:podDecisionV1031,
      needsReview:importedV1031?.needsReview === true || podFieldsV1031.podSigned !== true,
    };
  }`,
  'POD PDF routing'
);
reader = replaceOnce(
  reader,
  `  const classification = classifyDocument(text || base?.text || '', file?.name || 'scan.jpg');
  const type = selectedType(preferredType, classification, base);`,
  `  const classification = classifyDocument(text || base?.text || '', file?.name || 'scan.jpg');
  const initialTypeV1031 = selectedType(preferredType, classification, base);
  const podDecisionV1031 = resolvePodDecisionV1031({
    preferredType,
    detectedType:initialTypeV1031?.id || classification?.type?.id || 'other',
    text:text || base?.text || '',
  });
  const type = podDecisionV1031.isPod ? documentTypeMeta('pod') : initialTypeV1031;`,
  'POD image routing'
);
reader = replaceOnce(
  reader,
  `  const fields = mergeMeaningful(base?.fields, consensus.fields, {
    fieldConfidence:{ ...(base?.fields?.fieldConfidence || {}), ...consensus.fieldConfidence },
    fieldEvidence:consensus.fieldEvidence,
  });`,
  `  const fields = mergeMeaningful(base?.fields, consensus.fields, {
    fieldConfidence:{ ...(base?.fields?.fieldConfidence || {}), ...consensus.fieldConfidence },
    fieldEvidence:consensus.fieldEvidence,
  }, type.id === 'pod' ? {
    podSignedEvidence:podDecisionV1031.signedEvidence,
    podSigned:podDecisionV1031.signedEvidence,
  } : {});`,
  'POD signed evidence fields'
);
reader = reader.replace(
  `    || confidence < .84
    || fields.needsFieldReview === true`,
  `    || confidence < .84
    || (type.id === 'pod' && fields.podSigned !== true)
    || fields.needsFieldReview === true`
);
reader = reader.replace(
  `    validation,
    method:`,
  `    validation,
    podDecision:podDecisionV1031,
    method:`
);
write(readerPath, reader);

// ---------------------------------------------------------------------------
// Save a confirmed POD into the load's Billing / Factoring workflow.
// ---------------------------------------------------------------------------
const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = replaceOnce(
  sheet,
  "import { addBusinessRecord, localDateKey, readBusinessStore } from '../business/businessStore.js';",
  "import { addBusinessRecord, localDateKey, readBusinessStore, updateBusinessRecord } from '../business/businessStore.js';",
  'business update import'
);
sheet = replaceOnce(
  sheet,
  "import { dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from './smartDocumentLinkV100.js';",
  "import { dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from './smartDocumentLinkV100.js';\nimport { podBillingPatchV1031 } from './podWorkflowV1031.js';",
  'POD billing import'
);
sheet = sheet.replace(
  "    receiver:f.receiver || '',",
  "    receiver:f.receiver || '',\n    podSigned:Boolean(f.podSigned || f.podSignedEvidence),"
);
sheet = sheet.replace(
  `        ...parsedFields,
        title:meta.label,`,
  `        ...parsedFields,
        podSigned:id === 'pod' ? Boolean(current.podSigned || parsed.podSignedEvidence || analysis?.podDecision?.signedEvidence) : false,
        title:meta.label,`
);
sheet = replaceOnce(
  sheet,
  `      const title = String(fields.title || meta.label).trim();
      const stored = await saveScannedDocument({`,
  `      const title = String(fields.title || meta.label).trim();
      if (meta.id === 'pod' && !loadNo) {
        setSaveError('POD needs a Load # before it can enter Billing / Factoring.');
        setStage('review');
        return;
      }
      if (meta.id === 'pod' && fields.podSigned !== true) {
        setSaveError('Confirm that the receiver signature or RECEIVED stamp is visible before saving this as a POD.');
        setStage('review');
        return;
      }
      const stored = await saveScannedDocument({`,
  'POD save gate'
);
sheet = sheet.replace(
  `      nextStore = addBusinessRecord(nextStore, 'documents', { date:fields.date || localDateKey(), type:meta.id, label:meta.label, title, loadNo, amount:total, localDocumentId:stored.localDocument.local_id, clientDocumentId:stored.localDocument.client_document_id, fileName:stored.localDocument.original_file_name, syncState:stored.cloud.status, confidence:analysis?.confidence || 0, linkDay:fields.linkDay || '', source:'smart_scan_v100' });

      const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis, linkSuggestion };`,
  `      nextStore = addBusinessRecord(nextStore, 'documents', { date:fields.date || localDateKey(), type:meta.id, label:meta.label, title, loadNo, amount:total, localDocumentId:stored.localDocument.local_id, clientDocumentId:stored.localDocument.client_document_id, fileName:stored.localDocument.original_file_name, syncState:stored.cloud.status, confidence:analysis?.confidence || 0, linkDay:fields.linkDay || '', podSigned:meta.id === 'pod' ? fields.podSigned === true : undefined, extracted:{ ...fields, type:meta.id }, source:'smart_scan_v100' });

      let billingWorkflowV1031 = null;
      if (meta.id === 'pod') {
        billingWorkflowV1031 = podBillingPatchV1031({
          store:nextStore,
          loadNo,
          date:fields.date || localDateKey(),
          podDocumentId:stored.localDocument.local_id,
        });
        if (billingWorkflowV1031?.loadId) {
          nextStore = updateBusinessRecord(nextStore, 'loads', billingWorkflowV1031.loadId, billingWorkflowV1031.patch);
        }
      }

      const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis, linkSuggestion, billingWorkflow:billingWorkflowV1031 };`,
  'POD billing state update'
);
sheet = replaceOnce(
  sheet,
  `          {!['rate_confirmation','carrier_settlement','fuel_receipt','bol','pod'].includes(selectedType) && <><Field label="Title" wide><input value={fields.title || selectedMeta.label} onChange={event => updateField('title', event.target.value)}/></Field>`,
  `          {selectedType === 'pod' && <label className="smart-link-toggle-v100"><input type="checkbox" checked={fields.podSigned === true} onChange={event => updateField('podSigned', event.target.checked)}/><span><b>Receiver signature / RECEIVED stamp is visible</b><em>Required before this POD enters Billing / Factoring.</em></span></label>}

          {!['rate_confirmation','carrier_settlement','fuel_receipt','bol','pod'].includes(selectedType) && <><Field label="Title" wide><input value={fields.title || selectedMeta.label} onChange={event => updateField('title', event.target.value)}/></Field>`,
  'POD signed confirmation UI'
);
sheet = replaceOnce(
  sheet,
  `{savedResult.type.target && savedResult.type.target !== 'documents' ? <button type="button" className="primary" onClick={() => onOpenBusiness?.(savedResult.type.target)}>Open {savedResult.type.short}</button> : <button type="button" className="primary" onClick={onClose}>Done</button>}`,
  `{savedResult.type.id === 'pod' ? <button type="button" className="primary" onClick={() => onOpenBusiness?.('billing')}>Open Billing / Factoring</button> : savedResult.type.target && savedResult.type.target !== 'documents' ? <button type="button" className="primary" onClick={() => onOpenBusiness?.(savedResult.type.target)}>Open {savedResult.type.short}</button> : <button type="button" className="primary" onClick={onClose}>Done</button>}`,
  'POD billing action'
);
write(sheetPath, sheet);

// Billing readiness must use the selected/extracted type and a confirmed signed POD.
const ownerStorePath = 'source/src/modules/owneros/ownerOpsStoreV102.js';
let ownerStore = read(ownerStorePath);
ownerStore = ownerStore.replace(
  '  return text(document.type || document.extracted?.type || document.classification?.selectedType || document.label).toLowerCase();',
  '  return text(document.extracted?.type || document.classification?.selectedType || document.type || document.label).toLowerCase();'
);
ownerStore = ownerStore.replace(
  `  const hasPod = types.has('pod') || types.has('proof of delivery');`,
  `  const hasPod = docs.some(document => {
    const type = documentType(document);
    return (type === 'pod' || type === 'proof of delivery')
      && document.podSigned !== false
      && document.extracted?.podSigned !== false;
  });`
);
ownerStore = ownerStore.replace(
  `    { id:'delivery', label:'Delivery completed', required:true, complete:delivered },`,
  `    { id:'delivery', label:'Delivery completed', required:true, complete:delivered || hasPod },`
);
write(ownerStorePath, ownerStore);

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
  build:'v103.1-turboscan-pod-factoring',
  releasedAt:RELEASED_AT,
  notes:[
    'Tightens document lock to require sharp in-paper text, stable corners, strong edge confidence, safe coverage and a settled flash before auto-capture.',
    'Adds flash hysteresis so Auto Flash cannot flicker frame by frame and prevents an uncontrolled still-photo flash when the browser cannot guarantee OFF.',
    'Samples five focused video frames plus an explicitly controlled high-resolution still and always prefers a good sharp frame over a blurry high-megapixel frame.',
    'Makes a manually selected POD authoritative and auto-promotes a signed or RECEIVED-stamped BOL to POD only when delivery evidence is present.',
    'Requires confirmation that the receiver signature or RECEIVED stamp is visible, links the POD to the load and updates Billing / Factoring readiness.',
    'Keeps native PDF text, multi-pass OCR, document-type arbitration and manual field review; no Logbook duty-status event is changed.'
  ],
  label:'v103.1 TurboScan Lock & POD Factoring',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  ['source/src/modules/scan/TurboDocumentScanner.jsx','scannerLockDecisionV1031'],
  ['source/src/modules/scan/TurboDocumentScanner.jsx','nextFlashDecisionV1031'],
  ['source/src/modules/scan/scannerIntelligenceV1030.js','requested === \'off\''],
  ['source/src/modules/scan/smartDocumentReaderV1030.js','resolvePodDecisionV1031'],
  ['source/src/modules/scan/SmartScanSheetV100.jsx','Open Billing / Factoring'],
  ['source/src/modules/scan/SmartScanSheetV100.jsx','podBillingPatchV1031'],
  ['source/src/modules/owneros/ownerOpsStoreV102.js','document.extracted?.podSigned !== false'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`v103.1 verification missing ${needle} in ${relative}`);
}
console.log('v103.1 TurboScan lock and POD factoring materialized');
await import('./verify-turboscan-pod-v1031.mjs');
