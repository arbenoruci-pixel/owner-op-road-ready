import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/scan/',v3=root+'v3/',read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length,2,'Scanner capture anchor: '+path+' '+before.slice(0,50));fs.writeFileSync(path,source.replace(before,after));}
const files={
  'paperQuality.js':'paperQualityV110345.js','safeDocumentBoundary.js':'safeDocumentBoundaryV110428.js','CameraAdapter.jsx':'CameraAdapterV3.jsx',
  'captureGeometry.js':'captureGeometryV1104110.js','cameraAnalysis.js':'cameraAnalysisV1104110.js','cameraAnalysisClient.js':'cameraAnalysisClientV1104110.js','cameraAnalysisWorker.js':'cameraAnalysisWorkerV1104110.js',
  'cameraRuntime.js':'cameraRuntimeV1104117.js',
  'cameraRecovery.css':'cameraRecoveryV1104117.css',
  'processDocument.js':'processDocumentV110330.js','processDocumentClient.js':'processDocumentClientV110330.js','documentProcessingWorker.js':'documentProcessingWorkerV110330.js',
};
for(const [from,to] of Object.entries(files))fs.copyFileSync('scripts/scanner-paper/'+from,v3+to);
patch(v3+'ScannerEngineV3.js','const detection = detectDocumentEdgesV3(workingImage);','const detection = detectDocumentEdgesV3(workingImage,{maxSide:640});');
for(const file of ['ScanIntakeV110328.jsx','AttachmentIntakeV110427.jsx']){
  const path=root+file;
  patch(path,'async function addFiles(selection,fromCamera=false)','async function addFiles(selection,fromCamera=false,capture=null)');
  patch(path,"processDocumentClient(file,fromCamera?'camera':'photo-intake')","processDocumentClient(file,fromCamera?'camera':'photo-intake',files.length===1?capture:null)");
  patch(path,'onCapture={file=>addFiles([file],true)}','onCapture={(file,capture)=>addFiles([file],true,capture)}');
  patch(path,'<div className="scan-page-tools-v328">','{current?.result?.metadata?.captureManifest?.boundary?.needsReview&&<p role="status">Full photo kept. Check every corner; adjust the edges if needed.</p>}<div className="scan-page-tools-v328">');
}
console.log('PASS — continuous paper cleanup, complete-page guard, bound capture geometry and local camera worker installed');
