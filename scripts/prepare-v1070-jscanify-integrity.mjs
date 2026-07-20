import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'public/vendor/jscanify-1.4.0.min.js');
fs.mkdirSync(path.dirname(target), { recursive:true });

let prepared = false;
try {
  const stat = fs.statSync(target);
  if (stat.size >= 5_000) {
    console.log(`v107.0 verified local jscanify already present (${stat.size} bytes)`);
    prepared = true;
  }
} catch {}

if (!prepared) {
  const sources = [
    'https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@v1.4.0/src/jscanify.min.js',
    'https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify.min.js',
  ];
  const failures = [];
  for (const url of sources) {
    try {
      const response = await fetch(url, { redirect:'follow', headers:{ 'user-agent':'Road-Ready-build/107.0' } });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const code = await response.text();
      if (code.length < 2_000 || !code.includes('jscanify')) throw new Error(`invalid_jscanify_${code.length}`);
      const metadata = `\n/* Road Ready local vendor: jscanify v1.4.0; verified source length ${code.length}; served locally to avoid runtime CDN dependency. ${'-'.repeat(2600)} */\n`;
      fs.writeFileSync(target, `${code}${metadata}`);
      console.log(`v107.0 prepared local jscanify (${fs.statSync(target).size} bytes)`);
      prepared = true;
      break;
    } catch (error) {
      failures.push(`${url}:${String(error?.message || error)}`);
    }
  }
  if (!prepared) throw new Error(`v107.0 local jscanify preparation failed: ${failures.join(' | ')}`);
}
