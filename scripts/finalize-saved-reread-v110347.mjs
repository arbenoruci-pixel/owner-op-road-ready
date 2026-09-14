import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.47',BUILD='v110347-saved-reread';

function patch(path, before, after) {
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Saved reread anchor: ${path}: ${before}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const owner='source/src/modules/owneros/';
for(const [from,to] of [['SavedDocumentReread.jsx','SavedDocumentRereadV110347.jsx'],['savedRereading.js','savedRereadingV110347.js']])fs.copyFileSync('scripts/v110347/'+from,owner+to);
const saved=owner+'SavedDocumentFilesV110344.jsx';
patch(saved,"import SavedReadingReview from './SavedReadingReviewV110345.jsx';", "import SavedReadingReview from './SavedReadingReviewV110345.jsx';\nimport SavedDocumentReread from './SavedDocumentRereadV110347.jsx';");
patch(saved,"  const [ready, setReady] = useState(null);", "  const [ready, setReady] = useState(null);\n  const [rereading, setRereading] = useState(false);\n  const [savedReview, setSavedReview] = useState(null);");
patch(saved,"    setReady(null); setError(''); setSharing(false);", "    setReady(null); setError(''); setSharing(false); setRereading(false); setSavedReview(null);");
patch(saved,'<SavedReadingReview review={doc?.extracted?.readerReviewV110345}/>', '<SavedReadingReview review={savedReview || doc?.extracted?.readerReviewV110345}/>');
patch(saved,'        <a href={current.url} download={current.file.name}>Download</a>', `        <a href={current.url} download={current.file.name}>Download</a>
        {current.pdf || current.file.type.startsWith('image/') ? <button type="button" disabled={rereading} onClick={() => setRereading(true)}>Read again</button> : null}`);
patch(saved,'    {error ? <div role="alert">', `    {current && rereading ? <SavedDocumentReread key={id} file={current.file} clientId={doc.client_document_id} onClose={() => setRereading(false)} onSaved={setSavedReview}/> : null}
    {error ? <div role="alert">`);
const preview='source/src/modules/scan/OwnedReaderPreview.jsx';
patch(preview,'function ReviewBody({analysis,reviewState,onReviewChange})', 'function ReviewBody({analysis,reviewState,onReviewChange,onReady})');
patch(preview,'      setSources(files);setResult(next);', '      setSources(files);setResult(next);onReady?.({analysis,result:next,summary:savedReadingReview(next)});');
patch(preview,'export default function ReaderPreview({analysis,reviewState,onReviewChange})', 'export default function ReaderPreview({analysis,reviewState,onReviewChange,onReady,defaultExpanded=false})');
patch(preview,'useState(Boolean(analysis?.typeEvidenceV110334?.mixedDocuments))', 'useState(Boolean(defaultExpanded || analysis?.typeEvidenceV110334?.mixedDocuments))');
patch(preview,'onReviewChange={onReviewChange}/>', 'onReviewChange={onReviewChange} onReady={onReady}/>');
patch(owner+'SavedReadingReviewV110345.jsx','<dd>{field.value}</dd>', '<dd>{field.value}{field.status === \'supported\' ? <small> · Check reading</small> : null}</dd>');
const css=owner+'savedDocumentFilesV110344.css';
const styles=`
.saved-reread-v347{margin-top:16px;padding:14px;border:1px solid #b7d6d0;border-radius:14px;background:#f5fbf9;min-width:0;max-width:100%;overflow-wrap:anywhere}
.saved-reread-v347 h3{margin:0 0 8px}.saved-reread-name-v347{font-weight:700}
.saved-reread-v347 progress{width:100%}.saved-reread-v347 .owned-reader-preview{min-width:0;max-width:100%}
.saved-file-buttons-v344 button:disabled{opacity:.6;cursor:wait}
`;
if(!fs.readFileSync(css,'utf8').includes('.saved-reread-v347{'))fs.appendFileSync(css,styles);

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.47 Read saved documents again',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Read again from the saved original without another upload.','Check and save reading on the existing document.','Recognize explicit FROM and TO labels on bills of lading.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
const test='scripts/test-duty-graph-continuity.mjs';
const before="assert.equal(meta.version,'110.3.46');assert.equal(meta.build,'v110346-identifier-fragments');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
const source=fs.readFileSync(test,'utf8');
if(!source.includes(after)){assert.equal(source.split(before).length-1,1,'Reader release test anchor');fs.writeFileSync(test,source.replace(before,after));}
console.log('PASS — v110.3.47 saved-file rereading installed');
