import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx');
let source = fs.readFileSync(target, 'utf8');

const oldFileUrl = `function fileUrl(file) {
  return file ? URL.createObjectURL(file) : '';
}`;
const newFileUrl = `function fileUrl(file) {
  if (!file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  if (typeof Blob !== 'undefined' && !(file instanceof Blob)) return '';
  if (Number(file.size || 0) <= 0) return '';
  return URL.createObjectURL(file);
}`;
if (!source.includes(newFileUrl)) {
  if (!source.includes(oldFileUrl)) throw new Error('v107.3 fileUrl helper missing');
  source = source.replace(oldFileUrl, newFileUrl);
}

const previewState = "  const [previewUrls, setPreviewUrls] = useState({ original:'', cleaned:'' });";
const previewStateV1073 = `${previewState}
  const [previewReadyV1073, setPreviewReadyV1073] = useState(false);
  const [previewErrorV1073, setPreviewErrorV1073] = useState('');`;
if (!source.includes('previewReadyV1073')) {
  if (!source.includes(previewState)) throw new Error('v107.3 preview state marker missing');
  source = source.replace(previewState, previewStateV1073);
}

const effectStart = source.indexOf(`  useEffect(() => {
    revoke(previewUrls.original);
    revoke(previewUrls.cleaned);
    if (!page) {`);
const effectEndNeedle = `
  }, [page]);`;
const effectEnd = source.indexOf(effectEndNeedle, effectStart);
if (effectStart < 0 || effectEnd < 0) throw new Error(`v107.3 preview effect boundaries missing start=${effectStart} end=${effectEnd}`);
const newEffect = `  useEffect(() => {
    setPreviewReadyV1073(false);
    setPreviewErrorV1073('');
    if (!page) {
      setPreviewUrls({ original:'', cleaned:'' });
      return undefined;
    }
    const originalFileV1073 = page.versions?.original?.file || null;
    const cleanedFileV1073 = driverPreviewFileV1072(page);
    const original = fileUrl(originalFileV1073);
    const cleaned = fileUrl(cleanedFileV1073);
    setPreviewUrls({ original, cleaned });
    let disposedV1073 = false;
    const previewProbeV1073 = new Image();
    previewProbeV1073.onload = () => {
      if (!disposedV1073) setPreviewReadyV1073(true);
    };
    previewProbeV1073.onerror = () => {
      if (!disposedV1073) {
        setPreviewReadyV1073(false);
        setPreviewErrorV1073('The cleaned scan could not be displayed. Return to Edges and try again.');
      }
    };
    if (cleaned) previewProbeV1073.src = cleaned;
    else setPreviewErrorV1073('The cleaned scan is empty. Return to Edges and try again.');
    return () => {
      disposedV1073 = true;
      previewProbeV1073.onload = null;
      previewProbeV1073.onerror = null;
      revoke(original);
      revoke(cleaned);
    };
  }, [page]);`;
source = `${source.slice(0, effectStart)}${newEffect}${source.slice(effectEnd + effectEndNeedle.length)}`;

const oldUseScan = `<button type="button" className="next" onClick={finish} disabled={processing || quality?.quality === PAGE_QUALITY_V106.recapture && !qualityOverride}>{processing ? 'Saving…' : 'Use scan'}</button>`;
const newUseScan = `<button type="button" className="next" onClick={finish} disabled={processing || !previewReadyV1073 || quality?.quality === PAGE_QUALITY_V106.recapture && !qualityOverride}>{processing ? 'Saving…' : previewReadyV1073 ? 'Use scan' : 'Preparing…'}</button>`;
if (!source.includes(newUseScan)) {
  if (!source.includes(oldUseScan)) throw new Error('v107.3 Use scan button marker missing');
  source = source.replace(oldUseScan, newUseScan);
}

const previewContainerNeedle = `        <div className="turbo-preview-paper" style={{ width:'100%', minHeight:'42vh', display:previewMode === 'compare' ? 'grid' : 'grid', gridTemplateColumns:previewMode === 'compare' ? '1fr 1fr' : '1fr', gap:8, alignItems:'center', justifyItems:'center', overflow:'auto', background:'#111' }}>`;
const previewContainerReplacement = `${previewContainerNeedle}
          {!previewReadyV1073 && !previewErrorV1073 ? <div style={{ color:'#fff', padding:24, textAlign:'center', fontWeight:800 }}>Preparing document preview…</div> : null}`;
if (!source.includes('Preparing document preview…')) {
  if (!source.includes(previewContainerNeedle)) throw new Error('v107.3 preview container marker missing');
  source = source.replace(previewContainerNeedle, previewContainerReplacement);
}

const previewEndNeedle = `        </div>

        <div style={stripStyle} role="group" aria-label="Preview version">`;
const previewEndReplacement = `        </div>
        {previewErrorV1073 ? <p className="scan-message-v105" style={{ margin:'10px 14px' }}><Icon name="alert" size={17} />{previewErrorV1073}</p> : null}

        <div style={stripStyle} role="group" aria-label="Preview version">`;
if (!source.includes('{previewErrorV1073 ?')) {
  if (!source.includes(previewEndNeedle)) throw new Error('v107.3 preview error marker missing');
  source = source.replace(previewEndNeedle, previewEndReplacement);
}

for (const marker of [
  'const cleanedFileV1073 = driverPreviewFileV1072(page);',
  'const cleaned = fileUrl(cleanedFileV1073);',
  'previewProbeV1073.onload',
  '!previewReadyV1073',
  'Preparing document preview…',
]) {
  if (!source.includes(marker)) throw new Error(`v107.3 missing ${marker}`);
}
if (source.includes('const cleaned = driverPreviewFileV1072(page);')) throw new Error('v107.3 still assigns File directly to img src');

fs.writeFileSync(target, source);
console.log('v107.3 Safari preview object URL lifecycle patched');
