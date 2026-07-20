import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/documentScannerEngine.js');
let source = fs.readFileSync(target, 'utf8');

source = source.replace(
  /const OPENCV_URL = '[^']+';\nconst JSCANIFY_URL = '[^']+';/,
  `const OPENCV_URLS = [
  '/vendor/opencv-4.10.0.js?v=1070',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.10.0/opencv.js',
];
const JSCANIFY_URLS = [
  '/vendor/jscanify-1.4.0.min.js?v=1070',
  'https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@v1.4.0/src/jscanify.min.js',
  'https://raw.githubusercontent.com/puffinsoft/jscanify/v1.4.0/src/jscanify.min.js',
];`,
);

const loaderReplacement = `function clearFailedVisionScript(src, globalName) {
  try { delete window.__roadReadyScriptPromises?.[src]; } catch {}
  for (const script of [...document.scripts]) {
    try {
      if (script.src === new URL(src, window.location.href).href) script.remove();
    } catch {}
  }
  try {
    const value = window[globalName];
    const valid = globalName === 'cv' ? Boolean(value?.Mat) : Boolean(value);
    if (!valid) delete window[globalName];
  } catch {}
}

async function loadOpenCvFromSources(onStatus = () => {}) {
  const failures = [];
  for (let index = 0; index < OPENCV_URLS.length; index += 1) {
    const src = OPENCV_URLS[index];
    try {
      onStatus(index === 0 ? 'Loading local scan engine…' : 'Loading backup scan engine…');
      await loadScript(src, () => Boolean(window.cv));
      return await waitForOpenCv();
    } catch (error) {
      failures.push(\`${'${src}'}:${'${String(error?.message || error)}'}\`);
      clearFailedVisionScript(src, 'cv');
    }
  }
  throw new Error(\`opencv_unavailable:${'${failures.join("|")}'}\`);
}

async function loadJscanifyFromSources(onStatus = () => {}) {
  const failures = [];
  for (let index = 0; index < JSCANIFY_URLS.length; index += 1) {
    const src = JSCANIFY_URLS[index];
    try {
      onStatus(index === 0 ? 'Loading local perspective helper…' : 'Loading backup perspective helper…');
      await loadScript(src, () => Boolean(window.jscanify));
      if (!window.jscanify) throw new Error('jscanify_unavailable');
      return window.jscanify;
    } catch (error) {
      failures.push(\`${'${src}'}:${'${String(error?.message || error)}'}\`);
      clearFailedVisionScript(src, 'jscanify');
    }
  }
  throw new Error(\`jscanify_unavailable:${'${failures.join("|")}'}\`);
}

export async function loadDocumentVision(onStatus = () => {}) {
  if (typeof window === 'undefined') throw new Error('browser_required');
  if (window.cv?.Mat && window.jscanify) return { cv:window.cv, scanner:new window.jscanify() };
  if (!visionPromise) {
    visionPromise = (async () => {
      const cv = await loadOpenCvFromSources(onStatus);
      const Jscanify = await loadJscanifyFromSources(onStatus);
      onStatus('Smart edges ready');
      return { cv, scanner:new Jscanify() };
    })().catch(error => {
      visionPromise = null;
      throw error;
    });
  }
  return visionPromise;
}`;

if (!source.includes('loadOpenCvFromSources')) {
  const startNeedle = 'export async function loadDocumentVision(onStatus = () => {}) {';
  const endNeedle = '\nexport function defaultDocumentCorners';
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`v107.0 loader boundaries missing start=${start} end=${end}`);
  source = `${source.slice(0, start)}${loaderReplacement}${source.slice(end)}`;
}

for (const marker of [
  "'/vendor/opencv-4.10.0.js?v=1070'",
  "'/vendor/jscanify-1.4.0.min.js?v=1070'",
  'loadOpenCvFromSources',
  'loadJscanifyFromSources',
  'clearFailedVisionScript',
]) {
  if (!source.includes(marker)) throw new Error(`v107.0 loader marker missing ${marker}`);
}
if (source.includes('await loadScript(OPENCV_URL,')) throw new Error('v107.0 single remote OpenCV dependency remains');

fs.writeFileSync(target, source);
console.log('v107.0 local-first vision loader patched');
