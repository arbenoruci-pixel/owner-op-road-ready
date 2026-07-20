import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(ROOT, 'public/vendor');
fs.mkdirSync(vendorDir, { recursive:true });

const assets = [
  {
    name:'OpenCV.js',
    target:path.join(vendorDir, 'opencv-4.10.0.js'),
    minimumBytes:7_000_000,
    urls:[
      'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
      'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
      'https://docs.opencv.org/4.10.0/opencv.js',
    ],
  },
  {
    name:'jscanify',
    target:path.join(vendorDir, 'jscanify-1.4.0.min.js'),
    minimumBytes:5_000,
    marker:'jscanify',
    urls:[
      'https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@v1.4.0/src/jscanify.min.js',
      'https://raw.githubusercontent.com/puffinsoft/jscanify/v1.4.0/src/jscanify.min.js',
    ],
  },
];

async function fetchBuffer(url, timeoutMs = 75_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect:'follow',
      signal:controller.signal,
      headers:{ 'user-agent':'Road-Ready-build/107.0' },
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

for (const asset of assets) {
  try {
    const stat = fs.statSync(asset.target);
    if (stat.size >= asset.minimumBytes) {
      console.log(`v107.0 local ${asset.name} already present (${stat.size} bytes)`);
      continue;
    }
  } catch {}

  const failures = [];
  let written = false;
  for (const url of asset.urls) {
    try {
      console.log(`v107.0 downloading ${asset.name} from ${new URL(url).host}`);
      const buffer = await fetchBuffer(url);
      if (buffer.length < asset.minimumBytes) throw new Error(`asset_too_small_${buffer.length}`);
      if (asset.marker && !buffer.toString('utf8').includes(asset.marker)) throw new Error('asset_marker_missing');
      const temporary = `${asset.target}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, buffer);
      fs.renameSync(temporary, asset.target);
      console.log(`v107.0 vendored ${asset.name} (${buffer.length} bytes)`);
      written = true;
      break;
    } catch (error) {
      failures.push(`${url}:${String(error?.message || error)}`);
    }
  }
  if (!written) throw new Error(`v107.0 could not vendor ${asset.name}: ${failures.join(' | ')}`);
}
