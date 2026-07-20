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
const oldExport = `  for (let index = 0; index < result.document.pages.length; index += 1) {
    const page = result.document.pages[index];
    options.onStatus?.(\`Preparing page \${index + 1}…\`);
    const originalImage = await page.loadOriginalImage();
    const finalImage = await page.finalRawImage();
    originals.push(jpegFileV1076(await sdk.imageToJpeg(originalImage), \`road-ready-scanbot-original-\${index + 1}.jpg\`));
    cleaned.push(jpegFileV1076(await sdk.imageToJpeg(finalImage), \`road-ready-scanbot-cleaned-\${index + 1}.jpg\`));
  }`;
const newExport = `  for (let index = 0; index < result.document.pages.length; index += 1) {
    const page = result.document.pages[index];
    options.onStatus?.(\`Preparing page \${index + 1} of \${result.document.pages.length}…\`);
    const originalImage = await timeoutV1076(Promise.resolve(page.loadOriginalImage()), 15000, 'scanbot_original_timeout');
    let finalImage = originalImage;
    try {
      finalImage = await timeoutV1076(Promise.resolve(page.finalRawImage()), 18000, 'scanbot_final_image_timeout');
    } catch (error) {
      options.onStatus?.(\`Using the straightened page for page \${index + 1}…\`);
    }
    const originalBytes = await timeoutV1076(Promise.resolve(sdk.imageToJpeg(originalImage)), 15000, 'scanbot_original_jpeg_timeout');
    let finalBytes;
    try {
      finalBytes = await timeoutV1076(Promise.resolve(sdk.imageToJpeg(finalImage)), 15000, 'scanbot_final_jpeg_timeout');
    } catch (error) {
      finalBytes = originalBytes;
    }
    originals.push(jpegFileV1076(originalBytes, \`road-ready-scanbot-original-\${index + 1}.jpg\`));
    cleaned.push(jpegFileV1076(finalBytes, \`road-ready-scanbot-cleaned-\${index + 1}.jpg\`));
  }`;
if (!runtime.includes('scanbot_final_image_timeout')) {
  if (!runtime.includes(oldExport)) throw new Error('v107.8 Scanbot page export block missing');
  runtime = runtime.replace(oldExport, newExport);
}
write(runtimePath, runtime);

const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let capture = read(capturePath);

const oldRestore = `        setProfessionalMessageV1076('Cleaning paper and strengthening text…');
        const restoredPagesV1077 = await Promise.all(result.cleaned.map((pageFile, pageIndex) => renderDocumentFile(pageFile, {
          filter:'color',
          maxDimension:2400,
          quality:.985,
          name:\`road-ready-scanbot-restored-\${pageIndex + 1}-\${Date.now()}.jpg\`,
        })));
        const ocrFile = restoredPagesV1077.length === 1 ? restoredPagesV1077[0] : await composePageFiles(restoredPagesV1077, \`road-ready-scanbot-restored-packet-\${Date.now()}.jpg\`);`;
const newRestore = `        setProfessionalStateV1076('processing');
        setProfessionalMessageV1076('Straightening, cleaning and improving readability…');
        const restoredPagesV1078 = [];
        for (let pageIndex = 0; pageIndex < result.cleaned.length; pageIndex += 1) {
          setProfessionalMessageV1076(\`Improving page \${pageIndex + 1} of \${result.cleaned.length}…\`);
          const pageFile = result.cleaned[pageIndex];
          try {
            const restored = await Promise.race([
              renderDocumentFile(pageFile, {
                filter:'color',
                maxDimension:2200,
                quality:.975,
                name:\`road-ready-scanbot-pro-restored-\${pageIndex + 1}-\${Date.now()}.jpg\`,
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('document_restore_timeout')), 18000)),
            ]);
            restoredPagesV1078.push(restored);
          } catch (error) {
            restoredPagesV1078.push(pageFile);
          }
        }
        const ocrFile = restoredPagesV1078.length === 1 ? restoredPagesV1078[0] : await composePageFiles(restoredPagesV1078, \`road-ready-scanbot-pro-restored-packet-\${Date.now()}.jpg\`);`;
if (!capture.includes('restoredPagesV1078')) {
  if (!capture.includes(oldRestore)) throw new Error('v107.8 restore block missing');
  capture = capture.replace(oldRestore, newRestore);
}

capture = capture.replace(
  `        setProfessionalStateV1076('complete');
        onComplete?.(`,
  `        setProfessionalStateV1076('handoff');
        setProfessionalMessageV1076('Opening document reader…');
        onComplete?.(`,
);
capture = capture.replaceAll("source:'scanbot-rtu-v1077-gallery-restore'", "source:'scanbot-rtu-v1078-pro-submit'");
capture = capture.replaceAll("scannerVersion:'107.7.0'", "scannerVersion:'107.8.0'");
capture = capture.replaceAll("source:'scanbot-rtu-gallery-restore'", "source:'scanbot-rtu-pro-submit'");

const legacyGuardStart = capture.indexOf("\n  if (professionalStateV1076 !== 'complete') {");
const componentEnd = capture.lastIndexOf('\n}');
if (legacyGuardStart < 0 || componentEnd < legacyGuardStart) throw new Error(`v107.8 legacy render boundaries missing start=${legacyGuardStart} end=${componentEnd}`);
const professionalOnlyRender = `
  const isProfessionalErrorV1078 = professionalStateV1076 === 'error';
  const isProfessionalCancelledV1078 = professionalStateV1076 === 'cancelled';
  return <section data-professional-scanner="scanbot-only-v1078" style={{ minHeight:'100dvh', background:'#171717', color:'#fff', display:'grid', gridTemplateRows:'auto 1fr', paddingBottom:'env(safe-area-inset-bottom)' }}>
    <header style={{ minHeight:92, borderBottom:'1px solid #343434', display:'grid', gridTemplateColumns:'110px 1fr 110px', alignItems:'center', padding:'max(16px, env(safe-area-inset-top)) 22px 16px' }}>
      <button type="button" onClick={onCancel} style={{ border:0, background:'transparent', color:'#fff', fontSize:24, fontWeight:900, textAlign:'left' }}>Cancel</button>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:28, fontWeight:950 }}>Professional Scan</div><div style={{ marginTop:4, color:'#aeb8cc', fontWeight:800 }}>Camera and Photos</div></div>
      <div />
    </header>
    <main style={{ display:'grid', placeItems:'center', padding:28 }}>
      <div style={{ width:'min(560px,100%)', textAlign:'center' }}>
        {!isProfessionalErrorV1078 && !isProfessionalCancelledV1078 ? <div aria-label="Processing professional document" style={{ width:64, height:64, border:'7px solid #3f3f46', borderTopColor:'#60a5fa', borderRadius:'50%', margin:'0 auto 26px', animation:'spin 1s linear infinite' }} /> : null}
        <h1 style={{ margin:'0 0 12px', fontSize:34, lineHeight:1.08 }}>{isProfessionalErrorV1078 ? 'Could not finish the scan' : isProfessionalCancelledV1078 ? 'Scan cancelled' : professionalStateV1076 === 'handoff' ? 'Scan ready' : 'Preparing document'}</h1>
        <p style={{ margin:'0 auto', maxWidth:470, color:isProfessionalErrorV1078 ? '#fecaca' : '#d1d5db', fontSize:20, lineHeight:1.35, fontWeight:750 }}>{professionalMessageV1076}</p>
        {isProfessionalErrorV1078 ? <div style={{ display:'grid', gap:12, marginTop:28 }}><button type="button" onClick={() => window.location.reload()} style={{ minHeight:56, border:0, borderRadius:15, background:'#2563eb', color:'#fff', fontSize:19, fontWeight:900 }}>Try professional scanner again</button><button type="button" onClick={onCancel} style={{ minHeight:52, border:'1px solid #52525b', borderRadius:15, background:'#27272a', color:'#fff', fontSize:18, fontWeight:850 }}>Close</button></div> : null}
      </div>
    </main>
  </section>;
`;
capture = `${capture.slice(0, legacyGuardStart)}${professionalOnlyRender}${capture.slice(componentEnd)}`;

for (const marker of [
  'scanbot_final_image_timeout',
  'restoredPagesV1078',
  "setProfessionalStateV1076('handoff')",
  'data-professional-scanner="scanbot-only-v1078"',
  'Try professional scanner again',
  "source:'scanbot-rtu-v1078-pro-submit'",
]) {
  if (!`${runtime}\n${capture}`.includes(marker)) throw new Error(`v107.8 missing ${marker}`);
}
if (capture.includes('Check document edge') || capture.includes('data-professional-scanner="scanbot-rtu-v1076"')) throw new Error('v107.8 legacy scanner render remains active');
write(capturePath, capture);
console.log('v107.8 Scanbot submit flow patched with legacy render removed');
