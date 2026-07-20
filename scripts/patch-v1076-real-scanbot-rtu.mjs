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

const runtime = `const SCRIPT_URL_V1076 = 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/bundle/ScanbotSDK.ui2.min.js';
const ENGINE_URL_V1076 = 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/bundle/bin/document-scanner/';
let initializedV1076 = null;
function timeoutV1076(promise, ms, code) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(code)), ms))]); }
function loadUiV1076() {
  if (typeof window === 'undefined') return Promise.reject(new Error('professional_scanner_browser_required'));
  if (window.ScanbotSDK?.UI?.createDocumentScanner) return Promise.resolve(window.ScanbotSDK);
  return new Promise((resolve, reject) => {
    const old = document.querySelector('script[data-road-ready-scanbot-rtu="1076"]');
    if (old) old.remove();
    const script = document.createElement('script');
    script.src = SCRIPT_URL_V1076;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.roadReadyScanbotRtu = '1076';
    script.onload = () => window.ScanbotSDK?.UI?.createDocumentScanner ? resolve(window.ScanbotSDK) : reject(new Error('professional_scanner_ui_missing'));
    script.onerror = () => reject(new Error('professional_scanner_script_failed'));
    document.head.appendChild(script);
  });
}
async function sdkV1076(onStatus) {
  if (!initializedV1076) {
    initializedV1076 = timeoutV1076((async () => {
      onStatus?.('Starting professional document scanner…');
      const ScanbotSDK = await loadUiV1076();
      const sdk = await ScanbotSDK.initialize({ licenseKey:process.env.NEXT_PUBLIC_SCANBOT_LICENSE_KEY || '', enginePath:ENGINE_URL_V1076 });
      if (!ScanbotSDK.UI?.Config?.DocumentScanningFlow) throw new Error('professional_scanner_config_missing');
      return { ScanbotSDK, sdk };
    })(), 25000, 'professional_scanner_initialize_timeout').catch(error => { initializedV1076 = null; throw error; });
  }
  return initializedV1076;
}
function jpegFileV1076(bytes, name) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('professional_scanner_empty_jpeg');
  return new File([bytes], name, { type:'image/jpeg', lastModified:Date.now() });
}
export async function runScanbotRtuV1076(options = {}) {
  const { ScanbotSDK, sdk } = await sdkV1076(options.onStatus);
  options.onStatus?.('Professional scanner ready');
  const config = new ScanbotSDK.UI.Config.DocumentScanningFlow();
  config.outputSettings.pagesScanLimit = 0;
  if (config.screens?.camera?.acknowledgement) config.screens.camera.acknowledgement.acknowledgementMode = 'ALWAYS';
  if (config.screens?.camera?.topUserGuidance) {
    config.screens.camera.topUserGuidance.visible = true;
    if (config.screens.camera.topUserGuidance.title) config.screens.camera.topUserGuidance.title.text = 'Scan trucking document';
  }
  const result = await ScanbotSDK.UI.createDocumentScanner(config);
  if (!result?.document?.pages?.length) return null;
  const originals = [];
  const cleaned = [];
  for (let index = 0; index < result.document.pages.length; index += 1) {
    const page = result.document.pages[index];
    options.onStatus?.(`Preparing page ${index + 1}…`);
    const originalImage = await page.loadOriginalImage();
    const finalImage = await page.finalRawImage();
    originals.push(jpegFileV1076(await sdk.imageToJpeg(originalImage), `road-ready-scanbot-original-${index + 1}.jpg`));
    cleaned.push(jpegFileV1076(await sdk.imageToJpeg(finalImage), `road-ready-scanbot-cleaned-${index + 1}.jpg`));
  }
  return { originals, cleaned, pageCount:cleaned.length, document:result.document };
}
export const SCANBOT_RTU_VERSION_V1076 = '9.0.0';
`;
write('source/src/modules/scan/scanbotRtuV1076.js', runtime);

const target = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let source = read(target);
const importLine = "import { runScanbotRtuV1076, SCANBOT_RTU_VERSION_V1076 } from './scanbotRtuV1076.js'; // real-scanbot-rtu-v1076";
if (!source.includes(importLine)) {
  const directive = "'use client';";
  if (!source.startsWith(directive)) throw new Error('v107.6 use client directive missing');
  source = source.replace(directive, `${directive}\n${importLine}`);
}
const stateMarker = "  const [stage, setStage] = useState(initialFile ? 'detecting' : 'camera');";
const stateReplacement = `${stateMarker}\n  const [professionalStateV1076, setProfessionalStateV1076] = useState('starting');\n  const [professionalMessageV1076, setProfessionalMessageV1076] = useState('Opening professional scanner…');`;
if (!source.includes('professionalStateV1076')) {
  if (!source.includes(stateMarker)) throw new Error('v107.6 state marker missing');
  source = source.replace(stateMarker, stateReplacement);
}
const effectStart = source.indexOf("  useEffect(() => {\n    mountedRef.current = true;\n    if (initialFile)");
const effectEndNeedle = "\n  }, []);";
const effectEnd = source.indexOf(effectEndNeedle, effectStart);
if (effectStart < 0 || effectEnd < 0) throw new Error(`v107.6 initial effect boundaries missing start=${effectStart} end=${effectEnd}`);
const effect = `  useEffect(() => {
    mountedRef.current = true;
    let disposedV1076 = false;
    (async () => {
      try {
        setProfessionalStateV1076('starting');
        const result = await runScanbotRtuV1076({ onStatus:message => !disposedV1076 && setProfessionalMessageV1076(message) });
        if (disposedV1076) return;
        if (!result) { setProfessionalStateV1076('cancelled'); onCancel?.(); return; }
        setProfessionalMessageV1076('Preparing Road Ready document…');
        const originalOutput = result.originals.length === 1 ? result.originals[0] : await composePageFiles(result.originals, \`road-ready-scanbot-original-packet-\${Date.now()}.jpg\`);
        const ocrFile = result.cleaned.length === 1 ? result.cleaned[0] : await composePageFiles(result.cleaned, \`road-ready-scanbot-cleaned-packet-\${Date.now()}.jpg\`);
        if (disposedV1076) return;
        setProfessionalStateV1076('complete');
        onComplete?.(originalOutput, { source:'scanbot-rtu-v1076', scannerVersion:'107.6.0', professionalScanner:'scanbot-web-sdk', professionalScannerVersion:SCANBOT_RTU_VERSION_V1076, originalPreserved:true, ocrFile, pageCount:result.pageCount, scanMeta:{ scannerVersion:'107.6.0', source:'scanbot-rtu', originalPreserved:true, pageCount:result.pageCount, professionalScanner:true } });
      } catch (error) {
        if (disposedV1076) return;
        setProfessionalStateV1076('error');
        setProfessionalMessageV1076(\`Professional scanner unavailable: \${String(error?.message || error)}\`);
      }
    })();
    return () => {
      disposedV1076 = true;
      mountedRef.current = false;
      stopCamera();
      revoke(sourceUrlRef.current);
      revoke(previewUrlsRef.current.original);
      revoke(previewUrlsRef.current.cleaned);
      window.ScanbotSDK?.UI?.abortScanner?.().catch?.(() => {});
    };
  }, []);`;
source = `${source.slice(0, effectStart)}${effect}${source.slice(effectEnd + effectEndNeedle.length)}`;
const returnIndex = source.lastIndexOf('\n  return (');
if (returnIndex < 0) throw new Error('v107.6 component return marker missing');
const guard = `
  if (professionalStateV1076 !== 'complete') {
    return <section data-professional-scanner="scanbot-rtu-v1076" style={{ minHeight:'100dvh', background:'#070707', color:'#fff', display:'grid', placeItems:'center', padding:24 }}>
      <div style={{ width:'min(520px,100%)', textAlign:'center' }}>
        <h1 style={{ margin:'0 0 12px', fontSize:32 }}>Professional Document Scanner</h1>
        <p style={{ margin:'0 0 20px', opacity:.78, fontWeight:700 }}>{professionalMessageV1076}</p>
        {professionalStateV1076 === 'error' ? <><p style={{ color:'#fca5a5', fontWeight:800 }}>The old Road Ready edge scanner is disabled. No hidden fallback was used.</p><button type="button" onClick={onCancel} style={{ marginTop:18, border:0, borderRadius:14, padding:'14px 22px', fontWeight:900 }}>Close</button></> : <div aria-label="Loading professional scanner" style={{ width:52, height:52, border:'5px solid #334155', borderTopColor:'#3b82f6', borderRadius:'50%', margin:'0 auto', animation:'spin 1s linear infinite' }}/>} 
      </div>
    </section>;
  }
`;
source = `${source.slice(0, returnIndex)}${guard}${source.slice(returnIndex)}`;
for (const marker of ['real-scanbot-rtu-v1076','runScanbotRtuV1076({','data-professional-scanner="scanbot-rtu-v1076"','No hidden fallback was used']) if (!source.includes(marker)) throw new Error(`v107.6 missing ${marker}`);
write(target, source);
console.log('v107.6 real Scanbot RTU UI integrated with hidden fallback disabled');
