import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
function patch(file,before,after){const source=read(file);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner workflow anchor: '+file);fs.writeFileSync(file,source.replace(before,after));}
function addImport(file,statement){const source=read(file);if(source.includes(statement))return;const directive=source.match(/^(['"])use client\1;\r?\n/)?.[0]||'';fs.writeFileSync(file,directive+statement+'\n'+source.slice(directive.length));}
const scan='source/src/modules/scan/';
for(const name of ['scanIntake','pdfPageReader'])fs.copyFileSync(`scripts/v110328/${name}.js`,`${scan}${name}V110328.js`);
fs.copyFileSync('scripts/v110328/ScanIntake.jsx',scan+'ScanIntakeV110328.jsx');
fs.copyFileSync('scripts/v110328/ReviewScreen.jsx',scan+'v3/ReviewScreenV3.jsx');
fs.copyFileSync('scripts/v110328/imageReader.js',scan+'imageReaderV110323.js');
patch(scan+'SmartDocumentCaptureV100.jsx',"export { default } from './v3/RoadReadyScannerEntryV3.jsx';","export { default } from './ScanIntakeV110328.jsx';");
const css='source/src/command-center.css',styles=read('scripts/v110328/scanIntake.css');if(!read(css).includes(styles))fs.appendFileSync(css,'\n'+styles+'\n');
// An uncertain boundary must never silently trim the original paper.
const edges=scan+'v3/EdgeDetectorV3.js';
addImport(edges,"import {FULL_PAGE,validCorners} from '../scanIntakeV110328.js';");
patch(edges,"const corners = detected && polygonAreaV3(detected) >= .12 ? detected : DEFAULT_CORNERS_V3.map(point => ({ ...point }));","const corners = detected && confidence >= .72 && validCorners(detected) ? detected : FULL_PAGE.map(point => ({ ...point }));");
const pdf=scan+'pdfTextV102.js';
addImport(pdf,"import {readPdfPagesV110328} from './pdfPageReaderV110328.js';\nimport {checkCancelled} from './scanIntakeV110328.js';");
patch(pdf,'async function loadPdfJs() {','export async function loadPdfJs() {');
patch(pdf,"    const pages = [];\n    let totalWords = 0;",`    if(options.enablePageOcr){
      try{
        const reading=await readPdfPagesV110328(pdf,options,pageTextFromItems);
        return {...reading,text:printable(reading.pages.map(page=>\`[[PAGE:\${page.pageNumber}]]\\n\${page.text}\`).join('\\n\\n')),pageCount:pdf.numPages,method:reading.ocrUsed?'pdf-native-and-image-v110328':'pdfjs-native-text-v102',nativeText:!reading.ocrUsed,wordCount:reading.pages.reduce((n,p)=>n+p.wordCount,0),labelCount:reading.pages.reduce((n,p)=>n+p.labelCount,0)};
      }finally{await pdf.destroy?.();}
    }
    const pages = [];
    let totalWords = 0;`);
patch(pdf,"  } catch (error) {\n    onProgress(.18, 'Native PDF reader unavailable; trying local fallback…');","  } catch (error) {\n    checkCancelled(options.signal);\n    onProgress(.18, 'Opening the document with the offline reader…');");
const pdfReader=scan+'smartDocumentReaderV104.js';
patch(pdfReader,"    const pdf = await readPdfTextV102(file, {\n      onProgress:","    const pdf = await readPdfTextV102(file, {\n      enablePageOcr:true,signal:options.signal,\n      onProgress:");
patch(pdfReader,"    const needsReview = !text || fields.needsFieldReview === true || confidence < .82;","    const needsReview = !text || fields.needsFieldReview === true || confidence < .82 || Boolean(pdf?.pageReadingV110328?.unreadablePages?.length) || (pdf?.pages||[]).some(page=>page.confidence!=null&&page.confidence<.82);");
patch(pdfReader,"      nativePdfText:nativeText,","      pageReadingV110328:pdf?.pageReadingV110328,\n      nativePdfText:nativeText,");
const ui=scan+'SmartScanSheetV105.jsx';
patch(ui,"  const scanGenerationV11036 = useRef(0);","  const scanGenerationV11036 = useRef(0);\n  const readAbortV110328 = useRef(null);\n  const [intakeDraftV110328,setIntakeDraftV110328] = useState(null);");
patch(ui,"  useEffect(() => () => { scanGenerationV11036.current++; }, []);","  useEffect(() => () => { scanGenerationV11036.current++;readAbortV110328.current?.abort(); }, []);");
patch(ui,"  function reset() {","  function reset(keepPages = false) {\n    readAbortV110328.current?.abort();\n    if(keepPages !== true)setIntakeDraftV110328(null);");
patch(ui,"    const scanGeneration = ++scanGenerationV11036.current;","    const scanGeneration = ++scanGenerationV11036.current;\n    readAbortV110328.current?.abort();\n    const controllerV110328=new AbortController();readAbortV110328.current=controllerV110328;\n    const {intakeDraftV110328:draftV110328,...readerMetaV110328}=scanMeta;\n    if(draftV110328)setIntakeDraftV110328(draftV110328);\n    scanMeta=readerMetaV110328;");
patch(ui,"        preferredType:requestedType,\n        fileName:","        preferredType:requestedType,\n        signal:controllerV110328.signal,\n        fileName:");
patch(ui,"          setProgress(value);","          setProgress(previous=>Math.max(previous,Math.min(1,Number(value)||0)));");
patch(ui,"    return <SmartDocumentCaptureV100 onClose={onClose} onReady={chooseFile}/>;","    return <SmartDocumentCaptureV100 onClose={onClose} onReady={chooseFile} initialDraft={intakeDraftV110328}/>;");
patch(ui,"onOpenGuide) : reset} aria-label=\"Back\"","onOpenGuide) : () => reset(true)} disabled={stage === 'saving'} aria-label=\"Back\"");
patch(ui,"        <h1>Understanding document</h1>","        <h1>Reading your document</h1>");
patch(ui,"        <div><i style={{ width:`${Math.max(7, progress * 100)}%` }}/></div>","        <div role=\"progressbar\" aria-label=\"Document reading\" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)}><i style={{ width:`${Math.max(7, progress * 100)}%` }}/></div>");
patch(ui,"        <small>{file?.name}</small>","        <small>{file?.name}</small>\n        {intakeDraftV110328&&<button type=\"button\" onClick={()=>reset(true)}>Back to pages</button>}");
patch(ui,"        <section className=\"scan-three-v105\">",`        {analysis.pageReadingV110328&&<p role="status" style={{margin:0,padding:16,borderRadius:16,background:analysis.pageReadingV110328.unreadablePages.length?'#fff0e8':'#e5f5ef',color:'#304f4a',fontSize:13,lineHeight:1.5}}>{analysis.pageReadingV110328.unreadablePages.length?\`Pages \${analysis.pageReadingV110328.unreadablePages.join(', ')} could not be fully read. Return to pages to check them, or save for review.\`:\`Read \${analysis.pageReadingV110328.readable} of \${analysis.pageReadingV110328.total} pages. Check the details below.\`}</p>}
        <section className="scan-three-v105">`);
patch(ui,"  const needsReview = Boolean(analysis?.needsReview ||","  const needsReview = Boolean(analysis?.pageReadingV110328?.needsReview || analysis?.needsReview ||");
patch(scan+'DocumentEvidenceV11036.js',"const mustReview=changed||review.issues.length>0||!review.text||result.needsReview===true;","const mustReview=result.pageReadingV110328?.needsReview===true||changed||review.issues.length>0||!review.text||result.needsReview===true;");
const VERSION='110.3.28',BUILD='v110328-scanner-page-workflow';
for(const file of ['release-version.json','public/app-version.json']){const data=JSON.parse(read(file));Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.28 Clear document selection and page review',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Choose and review document pages before reading.','Reorder photos, adjust paper corners and save multiple pages as a PDF.','The reader reports unreadable pages and supports scanned PDF pages.']});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const data=JSON.parse(read(file));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(file);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,source);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.27');assert.equal(meta.build,'v110327-legacy-contract-originals');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — scanner page selection, crop review and complete-page reading installed');
