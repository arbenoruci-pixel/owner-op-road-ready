import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/scan/',path=root+'SmartScanSheetV105.jsx';
let sheet=fs.readFileSync(path,'utf8');
const patch=(before,after)=>{if(sheet.includes(after))return;assert.equal(sheet.split(before).length,2,'Load picker anchor: '+before.slice(0,90));sheet=sheet.replace(before,()=>after);};
fs.copyFileSync('scripts/reader-foundation/LoadFolderPicker.jsx',root+'LoadFolderPicker.jsx');
fs.copyFileSync('scripts/reader-foundation/loadPicker.js',root+'loadPickerV110472.js');
patch("import AnalysisSummary from './AnalysisSummary.jsx';", "import AnalysisSummary from './AnalysisSummary.jsx';\nimport LoadFolderPicker from './LoadFolderPicker.jsx';\nimport {loadPickerCandidates,podReadingMessage} from './loadPickerV110472.js';");
patch('const candidates = useMemo(() => collectLoadCandidatesV105(state, store), [state, store]);',
 'const candidates = useMemo(() => loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store), [state, store]);');
if(!sheet.includes('<LoadFolderPicker candidates={candidates}')){
 const pattern=/\{requiresLoad \? <label>[\s\S]*?<\/label> : <ConfirmCard label="2 · Filing area"/g;
 assert.equal([...sheet.matchAll(pattern)].length,1,'Exactly one native load-folder select');
 sheet=sheet.replace(pattern,`{requiresLoad ? <LoadFolderPicker candidates={candidates} value={selectedLoadNo || ''} onChange={chooseLoad} createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(analysis) : ''}/> : <ConfirmCard label="2 · Filing area"`);
}
patch('<section className="scan-three-v105">',`{selectedType === 'pod' ? <p className="reader-pod-reading-note" role="status">{podReadingMessage(selectedType,sourceAnalysisV110393?.fields?.readerAnalysisV1)}</p> : null}
        <section className="scan-three-v105">`);
fs.writeFileSync(path,sheet);
const css='source/src/road-ready-2026.css';
if(!fs.readFileSync(css,'utf8').includes('READER_LOAD_PICKER_V110472'))fs.appendFileSync(css,'\n/* READER_LOAD_PICKER_V110472 */\n'+fs.readFileSync('scripts/reader-foundation/load-picker.css','utf8'));
console.log('PASS — current-first searchable load cards, retained company/route details and explicit POD reading status installed');
