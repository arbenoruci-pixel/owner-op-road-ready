import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, content) => { const target = path.join(ROOT, relative); fs.mkdirSync(path.dirname(target), { recursive:true }); fs.writeFileSync(target, content); };
const VERSION = '107.6.0';
const pkg = JSON.parse(read('package.json')); pkg.version = VERSION; pkg.engines = { ...(pkg.engines || {}), node:'24.x' }; write('package.json', JSON.stringify(pkg,null,2)+'\n');
const lock = JSON.parse(read('package-lock.json')); lock.version = VERSION; if (lock.packages?.['']) { lock.packages[''].version = VERSION; lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' }; } write('package-lock.json', JSON.stringify(lock,null,2)+'\n');
const contracts='source/src/modules/scan/scannerContractsV106.js'; write(contracts, read(contracts).replace(/ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`));
write('public/app-version.json', JSON.stringify({ version:VERSION, build:'v1076-real-scanbot-rtu', releasedAt:'2026-07-20T04:30:00.000Z', label:'v107.6 Real Scanbot RTU', notes:['Launches the official Scanbot Ready-to-Use document scanner UI directly from Scan Anything.','Disables the old Road Ready edge UI as a hidden fallback.','Uses Scanbot camera guidance, gallery import, automatic capture, crop, rotation, review and document straightening.','Returns immutable original JPEGs and cleaned OCR JPEGs to the existing Road Ready reader and Vault flow.','Shows an explicit error when the professional SDK cannot initialize.'] },null,2)+'\n');
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));
const capture=read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const runtime=read('source/src/modules/scan/scanbotRtuV1076.js');
for (const [condition,label] of [[capture.includes('data-professional-scanner="scanbot-rtu-v1076"'),'real RTU loading shell is mounted'],[capture.includes('runScanbotRtuV1076({'),'RTU scanner launches on component mount'],[capture.includes('No hidden fallback was used'),'hidden fallback is explicitly disabled'],[runtime.includes('ScanbotSDK.ui2.min.js'),'official RTU UI bundle is loaded'],[runtime.includes('ScanbotSDK.UI.createDocumentScanner(config)'),'official RTU document scanner is called'],[runtime.includes('page.finalRawImage()'),'clean final Scanbot pages are exported'],[runtime.includes('page.loadOriginalImage()'),'immutable original Scanbot pages are exported']]) { if (!condition) throw new Error('v107.6 regression failed: '+label); console.log('PASS '+label); }
if (capture.includes("Professional scanner unavailable — using Road Ready fallback")) throw new Error('v107.6 hidden fallback text remains in active component');
console.log('PASS — v107.6 Real Scanbot RTU regression suite');
