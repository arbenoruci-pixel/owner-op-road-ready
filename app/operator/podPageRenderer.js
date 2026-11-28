import {recoverPageBoundary} from './podPageBoundary.js';
import {scannerEngineV3} from '../../source/src/modules/scan/v3/ScannerEngineV3.js';
import {podCaptureGeometry} from '../../source/src/modules/scan/v3/captureGeometryV1104110.js';
import {assessDocumentQuality, normalizePaperLighting} from '../../source/src/modules/scan/v3/DocumentQualityV11036.js';
import {autoOrientDocumentV10943} from '../../source/src/modules/scan/v3/DocumentOrientationV10943.js';
import {warpPerspectiveV10934} from '../../source/src/modules/scan/v3/PerspectiveEngineV10934.js';
import {decodeImageFileV3, imageDataToFileV3, rotateImageDataClockwiseV3} from '../../source/src/modules/scan/v3/imageUtilsV3.js';
import {preserveCornerOrderV3, rotateCornersClockwiseV3} from '../../source/src/modules/scan/v3/scannerTypesV3.js';

function rotate(image, degrees) {
  for (let angle = 0; angle < degrees; angle += 90) image = rotateImageDataClockwiseV3(image);
  return image;
}

function rotatePoints(points, degrees) {
  for (let angle = 0; angle < degrees; angle += 90) points = rotateCornersClockwiseV3(points);
  return points;
}

// The PDF embeds this color JPEG. Keep the scanner's resolution, geometry and
// ink-preserving lighting settings, and encode only the image the driver uses.
async function renderPage(source, corners, allowAutoRotation, preserveExposure = false) {
  const quality = assessDocumentQuality(source, {corners});
  let page = preserveExposure ? source : warpPerspectiveV10934(source, corners, {
    maxDimension: scannerEngineV3.maxOutputDimension, maxUpscale: 1,
    snapToStandard: true, snapTolerance: .095, usLetterBias: true, trimRatio: 0,
    bicubicMaxPixels: 6200000,
  });
  let rotation = 0;
  if (allowAutoRotation && !preserveExposure) {
    const oriented = autoOrientDocumentV10943(page, {
      deskew: false, pageFormat: page.pageFormat, pageFormatLabel: page.pageFormatLabel,
    });
    rotation = oriented.rotationDegrees || 0;
    page = oriented.image;
  }

  const displayFile = await imageDataToFileV3(preserveExposure ? page : normalizePaperLighting(page), 'pod-page.jpg', .985);
  return {
    displayFile,
    metadata: {
      documentQualityV11036: quality,
      captureManifest: {autoRotation: rotation, perspective: {width: page.width, height: page.height}, boundary: {}},
    },
  };
}

export async function processPhoto(file, source, capture) {
  const session = await scannerEngineV3.prepare(file, {source, fastProcess: true});
  const image = session.workingImage;
  const initial = podCaptureGeometry(file, image, capture, session.detection);
  const geometry = recoverPageBoundary(image, session.detection, initial, capture);
  const corners = preserveCornerOrderV3(geometry.corners);
  const [first, next] = corners;
  const degrees = Math.abs(Math.atan2((next.y - first.y) * image.height, (next.x - first.x) * image.width) * 180 / Math.PI);
  const tilt = Math.min(degrees % 90, 90 - degrees % 90);
  const result = await renderPage(image, corners, tilt >= 12, geometry.review);
  const manifest = result.metadata.captureManifest;
  const rotation = manifest.autoRotation;
  manifest.boundary = {needsReview: geometry.review, captureGeometry: geometry.reason};
  if (geometry.suggestedCorners) manifest.boundary.suggestedCorners = rotatePoints(geometry.suggestedCorners, rotation);
  return {result, corners: rotatePoints(corners, rotation), rotation};
}

export async function renderCrop(file, rotation, corners, previewOnDecodeFailure) {
  let image;
  try {
    image = await decodeImageFileV3(file, {maxDimension: scannerEngineV3.maxFinalInputDimension});
    image = rotate(image, rotation);
  } catch (error) {
    if (!previewOnDecodeFailure) throw error;
    image = previewOnDecodeFailure; // Already oriented by the manual editor.
  }
  return renderPage(image, preserveCornerOrderV3(corners), false);
}

export async function preparePodCrop(file, rotation, corners, suggestedCorners) {
  const source = await decodeImageFileV3(file, {maxDimension: scannerEngineV3.maxPreviewDimension});
  const workingImage = rotate(source, rotation);
  const reviewFile = await imageDataToFileV3(workingImage, 'pod-edge-review.jpg', .97);
  const editableCorners = suggestedCorners || corners;
  return {
    id: 'pod-edge-review', source: 'page-review', originalFile: file, rotation, workingImage, reviewFile,
    corners: editableCorners, detection: {corners: editableCorners},
  };
}
