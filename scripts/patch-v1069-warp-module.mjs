import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/opencvDocumentWarpV1069.js');
fs.mkdirSync(path.dirname(target), { recursive:true });

const source = String.raw`const clampV1069 = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value || 0)));

function distanceV1069(a = {}, b = {}) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function polygonAreaV1069(points = []) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function orderedPixelsV1069(image, corners = {}, scale = 1) {
  const width = Number(image?.naturalWidth || image?.width || 0) * scale;
  const height = Number(image?.naturalHeight || image?.height || 0) * scale;
  const point = value => ({
    x:clampV1069(value?.x) * width,
    y:clampV1069(value?.y) * height,
  });
  return [
    point(corners.topLeft),
    point(corners.topRight),
    point(corners.bottomRight),
    point(corners.bottomLeft),
  ];
}

function isUsableQuadV1069(points = [], width = 1, height = 1) {
  if (points.length !== 4 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  const area = polygonAreaV1069(points) / Math.max(1, width * height);
  if (area < .025 || area > .995) return false;
  const sides = points.map((point, index) => distanceV1069(point, points[(index + 1) % points.length]));
  return Math.min(...sides) >= Math.max(24, Math.min(width, height) * .04);
}

function outputSizeV1069(points = []) {
  const top = distanceV1069(points[0], points[1]);
  const right = distanceV1069(points[1], points[2]);
  const bottom = distanceV1069(points[3], points[2]);
  const left = distanceV1069(points[0], points[3]);
  const rawWidth = Math.max(top, bottom, 1);
  const rawHeight = Math.max(left, right, 1);
  const longest = Math.max(rawWidth, rawHeight);
  const shortest = Math.min(rawWidth, rawHeight);
  const qualityScale = Math.min(1.8, Math.max(1, 900 / Math.max(1, shortest)));
  const limitScale = Math.min(1, 3000 / Math.max(1, longest * qualityScale));
  const scale = qualityScale * limitScale;
  return {
    width:Math.max(320, Math.round(rawWidth * scale)),
    height:Math.max(320, Math.round(rawHeight * scale)),
  };
}

export async function warpPerspectiveCanvasV1069(image, corners, cv) {
  if (!image || !cv?.Mat || typeof cv.getPerspectiveTransform !== 'function' || typeof cv.warpPerspective !== 'function') {
    throw new Error('opencv_homography_unavailable');
  }
  const naturalWidth = Number(image.naturalWidth || image.width || 0);
  const naturalHeight = Number(image.naturalHeight || image.height || 0);
  if (!naturalWidth || !naturalHeight) throw new Error('homography_source_dimensions_missing');
  const workingScale = Math.min(1, 3200 / Math.max(naturalWidth, naturalHeight));
  const input = document.createElement('canvas');
  input.width = Math.max(1, Math.round(naturalWidth * workingScale));
  input.height = Math.max(1, Math.round(naturalHeight * workingScale));
  input.getContext('2d', { alpha:false }).drawImage(image, 0, 0, input.width, input.height);
  const points = orderedPixelsV1069(image, corners, workingScale);
  if (!isUsableQuadV1069(points, input.width, input.height)) throw new Error('invalid_perspective_quadrilateral');
  const outputSize = outputSizeV1069(points);
  const output = document.createElement('canvas');
  output.width = outputSize.width;
  output.height = outputSize.height;

  let src;
  let dst;
  let sourcePoints;
  let destinationPoints;
  let matrix;
  try {
    src = cv.imread(input);
    dst = new cv.Mat();
    sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      points[0].x, points[0].y,
      points[1].x, points[1].y,
      points[2].x, points[2].y,
      points[3].x, points[3].y,
    ]);
    destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      output.width - 1, 0,
      output.width - 1, output.height - 1,
      0, output.height - 1,
    ]);
    matrix = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
    cv.warpPerspective(
      src,
      dst,
      matrix,
      new cv.Size(output.width, output.height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    );
    cv.imshow(output, dst);
  } finally {
    try { src?.delete?.(); } catch {}
    try { dst?.delete?.(); } catch {}
    try { sourcePoints?.delete?.(); } catch {}
    try { destinationPoints?.delete?.(); } catch {}
    try { matrix?.delete?.(); } catch {}
  }
  if (!output.width || !output.height) throw new Error('opencv_homography_empty_output');
  return output;
}

function canvasCopyV1069(source) {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  output.getContext('2d', { willReadFrequently:true, alpha:false }).drawImage(source, 0, 0);
  return output;
}

function oddKernelV1069(value) {
  const integer = Math.max(15, Math.min(101, Math.round(value)));
  return integer % 2 === 0 ? integer + 1 : integer;
}

export async function enhanceDocumentCanvasV1069(sourceCanvas, cv, mode = 'color') {
  if (!sourceCanvas || !cv?.Mat) return sourceCanvas;
  const output = canvasCopyV1069(sourceCanvas);
  let src;
  let gray;
  let background;
  let normalized;
  let blurred;
  let sharp;
  let rendered;
  try {
    src = cv.imread(sourceCanvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    background = new cv.Mat();
    const kernel = oddKernelV1069(Math.min(sourceCanvas.width, sourceCanvas.height) * .055);
    cv.GaussianBlur(gray, background, new cv.Size(kernel, kernel), 0, 0, cv.BORDER_REPLICATE);
    normalized = new cv.Mat();
    cv.divide(gray, background, normalized, 255);
    cv.normalize(normalized, normalized, 0, 255, cv.NORM_MINMAX);
    blurred = new cv.Mat();
    cv.GaussianBlur(normalized, blurred, new cv.Size(0, 0), 1.05);
    sharp = new cv.Mat();
    cv.addWeighted(normalized, 1.38, blurred, -0.38, 0, sharp);

    if (mode === 'bw') {
      rendered = new cv.Mat();
      const block = oddKernelV1069(Math.min(sourceCanvas.width, sourceCanvas.height) * .025);
      cv.adaptiveThreshold(sharp, rendered, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, Math.max(15, block), 11);
      cv.imshow(output, rendered);
      return output;
    }

    const grayCanvas = document.createElement('canvas');
    grayCanvas.width = sourceCanvas.width;
    grayCanvas.height = sourceCanvas.height;
    cv.imshow(grayCanvas, sharp);
    if (mode === 'gray') return grayCanvas;

    const originalContext = output.getContext('2d', { willReadFrequently:true, alpha:false });
    const original = originalContext.getImageData(0, 0, output.width, output.height);
    const target = grayCanvas.getContext('2d', { willReadFrequently:true }).getImageData(0, 0, output.width, output.height).data;
    for (let index = 0; index < original.data.length; index += 4) {
      const red = original.data[index];
      const green = original.data[index + 1];
      const blue = original.data[index + 2];
      const luma = Math.max(18, red * .299 + green * .587 + blue * .114);
      const desired = target[index];
      const factor = clampV1069(desired / luma, .68, 1.72);
      const whiteLift = desired > 228 ? Math.min(12, (desired - 228) * .45) : 0;
      original.data[index] = clampV1069(((red * factor - 128) * 1.05) + 128 + whiteLift, 0, 255);
      original.data[index + 1] = clampV1069(((green * factor - 128) * 1.05) + 128 + whiteLift, 0, 255);
      original.data[index + 2] = clampV1069(((blue * factor - 128) * 1.05) + 128 + whiteLift, 0, 255);
    }
    originalContext.putImageData(original, 0, 0);
    return output;
  } catch {
    return sourceCanvas;
  } finally {
    try { src?.delete?.(); } catch {}
    try { gray?.delete?.(); } catch {}
    try { background?.delete?.(); } catch {}
    try { normalized?.delete?.(); } catch {}
    try { blurred?.delete?.(); } catch {}
    try { sharp?.delete?.(); } catch {}
    try { rendered?.delete?.(); } catch {}
  }
}

export const OPENCV_DOCUMENT_WARP_VERSION_V1069 = '106.9.0';
`;

fs.writeFileSync(target, source);
console.log('v106.9 OpenCV homography and enhancement module written');
