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

runtime = runtime.replace(
  "  if (config.screens?.camera?.acknowledgement) config.screens.camera.acknowledgement.acknowledgementMode = 'ALWAYS';",
  `  // v108.0: skip the intermediate acknowledgement loop. One camera or Photos page
  // moves straight into the Scanbot review screen, where Crop/Rotate/Retake/Submit remain available.
  if (config.screens?.camera?.acknowledgement) config.screens.camera.acknowledgement.acknowledgementMode = 'NONE';`,
);

runtime = runtime.replace(
  "  if (config.screens?.review) config.screens.review.enabled = true;",
  `  if (config.screens?.review) {
    config.screens.review.enabled = true;
    if (config.screens.review.bottomBar?.addButton) config.screens.review.bottomBar.addButton.visible = false;
  }`,
);

const scannerCall = "  const result = await ScanbotSDK.UI.createDocumentScanner(config);";
const scannerCallWithStatus = `  const result = await timeoutV1076(
    Promise.resolve(ScanbotSDK.UI.createDocumentScanner(config)),
    70000,
    'scanbot_ui_session_timeout',
  );`;
if (!runtime.includes('scanbot_ui_session_timeout')) {
  if (!runtime.includes(scannerCall)) throw new Error('v108.0 scanner call marker missing');
  runtime = runtime.replace(scannerCall, scannerCallWithStatus);
}

const pageExportStart = runtime.indexOf('  for (let index = 0; index < result.document.pages.length; index += 1) {');
const pageExportEnd = runtime.indexOf('\n  return { originals, cleaned, pageCount:cleaned.length, document:result.document };', pageExportStart);
if (pageExportStart < 0 || pageExportEnd < 0) throw new Error('v108.0 page export boundaries missing');

const robustExport = `  for (let index = 0; index < result.document.pages.length; index += 1) {
    const page = result.document.pages[index];
    options.onStatus?.(\`Preparing page \${index + 1} of \${result.document.pages.length}…\`);

    const loadOriginal = typeof page?.loadOriginalImage === 'function'
      ? () => page.loadOriginalImage()
      : typeof page?.originalRawImage === 'function'
        ? () => page.originalRawImage()
        : null;
    const loadFinal = typeof page?.finalRawImage === 'function'
      ? () => page.finalRawImage()
      : typeof page?.loadDocumentImage === 'function'
        ? () => page.loadDocumentImage()
        : typeof page?.documentRawImage === 'function'
          ? () => page.documentRawImage()
          : null;

    if (!loadOriginal && !loadFinal) throw new Error('scanbot_page_image_api_missing');

    let originalImage = null;
    if (loadOriginal) {
      try {
        originalImage = await timeoutV1076(Promise.resolve(loadOriginal()), 18000, 'scanbot_original_timeout');
      } catch (error) {
        originalImage = null;
      }
    }

    let finalImage = null;
    if (loadFinal) {
      try {
        finalImage = await timeoutV1076(Promise.resolve(loadFinal()), 22000, 'scanbot_final_image_timeout');
      } catch (error) {
        finalImage = null;
      }
    }

    if (!finalImage && originalImage) finalImage = originalImage;
    if (!originalImage && finalImage) originalImage = finalImage;
    if (!finalImage || !originalImage) throw new Error('scanbot_page_export_empty');

    const originalBytes = await timeoutV1076(Promise.resolve(sdk.imageToJpeg(originalImage)), 18000, 'scanbot_original_jpeg_timeout');
    const finalBytes = await timeoutV1076(Promise.resolve(sdk.imageToJpeg(finalImage)), 18000, 'scanbot_final_jpeg_timeout');

    originals.push(jpegFileV1076(originalBytes, \`road-ready-scanbot-original-\${index + 1}.jpg\`));
    cleaned.push(jpegFileV1076(finalBytes, \`road-ready-scanbot-cleaned-\${index + 1}.jpg\`));
  }`;
runtime = `${runtime.slice(0, pageExportStart)}${robustExport}${runtime.slice(pageExportEnd)}`;

for (const marker of [
  "acknowledgementMode = 'NONE'",
  'config.outputSettings.pagesScanLimit = 1;',
  'config.screens.review.enabled = true;',
  "title.text = 'Photos'",
  'scanbot_ui_session_timeout',
  'scanbot_page_image_api_missing',
  'scanbot_page_export_empty',
]) {
  if (!runtime.includes(marker)) throw new Error(`v108.0 missing ${marker}`);
}
if (runtime.includes("acknowledgementMode = 'ALWAYS'")) throw new Error('v108.0 acknowledgement loop remains');
write(runtimePath, runtime);

const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let capture = read(capturePath);
capture = capture.replaceAll("scannerVersion:'107.8.0'", "scannerVersion:'108.0.0'");
capture = capture.replaceAll("source:'scanbot-rtu-v1078-pro-submit'", "source:'scanbot-rtu-v1080-auto-review'");
capture = capture.replaceAll("source:'scanbot-rtu-pro-submit'", "source:'scanbot-rtu-auto-review'");
capture = capture.replace(
  "setProfessionalMessageV1076('Opening document reader…');",
  "setProfessionalMessageV1076('Scan complete — opening document reader…');",
);
if (!capture.includes("source:'scanbot-rtu-v1080-auto-review'")) throw new Error('v108.0 completion source missing');
write(capturePath, capture);

console.log('v108.0 Scanbot auto-review and robust export patched');
