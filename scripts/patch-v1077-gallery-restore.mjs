import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const runtimePath = 'source/src/modules/scan/scanbotRtuV1076.js';
let runtime = read(runtimePath);
const guidanceBlock = `  if (config.screens?.camera?.topUserGuidance) {
    config.screens.camera.topUserGuidance.visible = true;
    if (config.screens.camera.topUserGuidance.title) config.screens.camera.topUserGuidance.title.text = 'Scan trucking document';
  }`;
const galleryBlock = `${guidanceBlock}
  if (config.screens?.camera?.bottomBar?.importButton) {
    config.screens.camera.bottomBar.importButton.visible = true;
    if (config.screens.camera.bottomBar.importButton.title) {
      config.screens.camera.bottomBar.importButton.title.visible = true;
      config.screens.camera.bottomBar.importButton.title.text = 'Photos';
    }
  }`;
if (!runtime.includes("title.text = 'Photos'")) {
  if (!runtime.includes(guidanceBlock)) throw new Error('v107.7 Scanbot guidance block missing');
  runtime = runtime.replace(guidanceBlock, galleryBlock);
}
write(runtimePath, runtime);

const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let capture = read(capturePath);
const scannerImport = `import {
  assessDocumentFrame,
  captureVideoFile,
  composePageFiles,
  drawVideoSample,
  fileToImage,
  setTrackTorch,
} from './documentScannerEngine.js';`;
const scannerImportWithRestore = `import {
  assessDocumentFrame,
  captureVideoFile,
  composePageFiles,
  drawVideoSample,
  fileToImage,
  renderDocumentFile,
  setTrackTorch,
} from './documentScannerEngine.js';`;
if (!capture.includes('renderDocumentFile,')) {
  if (!capture.includes(scannerImport)) throw new Error('v107.7 documentScannerEngine import block missing');
  capture = capture.replace(scannerImport, scannerImportWithRestore);
}

const oldProcessing = `        const originalOutput = result.originals.length === 1 ? result.originals[0] : await composePageFiles(result.originals, \`road-ready-scanbot-original-packet-\${Date.now()}.jpg\`);
        const ocrFile = result.cleaned.length === 1 ? result.cleaned[0] : await composePageFiles(result.cleaned, \`road-ready-scanbot-cleaned-packet-\${Date.now()}.jpg\`);`;
const newProcessing = `        const originalOutput = result.originals.length === 1 ? result.originals[0] : await composePageFiles(result.originals, \`road-ready-scanbot-original-packet-\${Date.now()}.jpg\`);
        setProfessionalMessageV1076('Cleaning paper and strengthening text…');
        const restoredPagesV1077 = await Promise.all(result.cleaned.map((pageFile, pageIndex) => renderDocumentFile(pageFile, {
          filter:'color',
          maxDimension:2400,
          quality:.985,
          name:\`road-ready-scanbot-restored-\${pageIndex + 1}-\${Date.now()}.jpg\`,
        })));
        const ocrFile = restoredPagesV1077.length === 1 ? restoredPagesV1077[0] : await composePageFiles(restoredPagesV1077, \`road-ready-scanbot-restored-packet-\${Date.now()}.jpg\`);`;
if (!capture.includes('restoredPagesV1077')) {
  if (!capture.includes(oldProcessing)) throw new Error('v107.7 Scanbot completion block missing');
  capture = capture.replace(oldProcessing, newProcessing);
}

capture = capture.replace("source:'scanbot-rtu-v1076'", "source:'scanbot-rtu-v1077-gallery-restore'");
capture = capture.replace("scannerVersion:'107.6.0'", "scannerVersion:'107.7.0'");
capture = capture.replace("scannerVersion:'107.6.0'", "scannerVersion:'107.7.0'");
capture = capture.replace("source:'scanbot-rtu'", "source:'scanbot-rtu-gallery-restore'");

for (const marker of [
  "title.text = 'Photos'",
  'renderDocumentFile,',
  'restoredPagesV1077',
  "filter:'color'",
  'road-ready-scanbot-restored-',
  "source:'scanbot-rtu-v1077-gallery-restore'",
]) {
  if (!`${runtime}\n${capture}`.includes(marker)) throw new Error(`v107.7 missing ${marker}`);
}

write(capturePath, capture);
console.log('v107.7 Scanbot gallery import and Document Restore integrated');
