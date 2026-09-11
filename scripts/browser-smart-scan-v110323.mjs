import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
const output='browser-test-results/paper-detail-local';fs.mkdirSync(output,{recursive:true});
const server=spawn('python3',['-m','http.server','3002','--bind','127.0.0.1'],{stdio:'ignore'});
for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3002')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
const reports=[];
try{
 for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:3002');
   const result=await page.evaluate(async()=>{
    const {scannerEngineV3}=await import('/source/src/modules/scan/v3/ScannerEngineV3.js');
    const {analyzeTruckDocumentIsolatedV10959}=await import('/source/src/modules/scan/engines/isolatedDocumentRouterV10959.js');
    const {qualifyScanResultV11036}=await import('/source/src/modules/scan/DocumentEvidenceV11036.js');
    const {matchScanDocumentToLoadV11037}=await import('/source/src/modules/scan/scanLoadAssignmentV11037.js');
    const canvas=document.createElement('canvas');canvas.width=1700;canvas.height=2200;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1700,2200);ctx.fillStyle='#111';ctx.font='bold 42px Arial';ctx.fillText('BILL OF LADING',100,110);ctx.font='28px Arial';
    const lines=['Bill of Lading Number: 87123456','DATE: 09/10/2026','','SHIP FROM: EXAMPLE WAREHOUSE','1215 EXAMPLE ROAD','WINDSOR, CT 06095','','SHIP TO: EXAMPLE RECEIVER','10 TEST ROAD','COLDWATER, MI 49036','','CARRIER: SAMPLE CARRIER LLC','TRAILER NUMBER: TR123455','SEAL NUMBER: 8009035','','HANDLING UNITS       PACKAGES       WEIGHT       DESCRIPTION'];
    lines.forEach((line,i)=>ctx.fillText(line,100,190+i*48));
    ctx.lineWidth=2;ctx.strokeStyle='#777';for(let y=930;y<1760;y+=100){ctx.strokeRect(95,y,1500,100);ctx.fillText('40       120       2000 LB       DOORS AND PARTS',125,y+60);}
    ctx.fillText('TOTAL WEIGHT: 33374 LB',100,1860);ctx.fillText('Carrier signature: __________________',100,1940);ctx.fillText('Receiver signature: ________________',100,2020);
    // A blue cast and hard shadow reproduce the photographed paper problem.
    const image=ctx.getImageData(0,0,1700,2200);for(let y=0;y<2200;y++)for(let x=0;x<1700;x++){const i=(y*1700+x)*4,shadow=x<700+y*.08?0.58:1;image.data[i]*=.76*shadow;image.data[i+1]*=.86*shadow;image.data[i+2]*=shadow;}ctx.putImageData(image,0,0);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.97));const file=new File([blob],'shadowed-bol.jpg',{type:'image/jpeg'});const before=Array.from(new Uint8Array(await file.arrayBuffer()));
    const session=await scannerEngineV3.prepare(file);const capture=await scannerEngineV3.finalize(session,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
    const base=await analyzeTruckDocumentIsolatedV10959(capture.ocrFile,{scanMeta:capture.metadata});const result=qualifyScanResultV11036(base,{});
    const store={documents:[],loads:[{id:'load_38324346',loadNo:'38324346',origin:'Windsor, CT',destination:'Coldwater, MI',pickupDate:'2026-09-10',deliveryDate:'2026-09-11',status:'open',source:'rate_confirmation_v105'}]};
    const match=matchScanDocumentToLoadV11037({state:{},businessStore:store,typeId:result.type.id,fields:result.fields,analysis:result});
    const url=URL.createObjectURL(capture.displayFile);document.body.innerHTML='<h1>Processed document</h1><img style="width:600px" src="'+url+'">';
    const encode=async f=>{const bytes=new Uint8Array(await f.arrayBuffer());let value='';for(let i=0;i<bytes.length;i++)value+=String.fromCharCode(bytes[i]);return btoa(value);};
    return {type:result.type.id,fields:result.fields,issues:result.evidenceReviewV11036?.issues,match,passes:result.ocrPasses,ocrEvidence:result.ocrEvidenceV110323,failures:result.ocrFailuresV110323,originalUnchanged:JSON.stringify(before)===JSON.stringify(Array.from(new Uint8Array(await capture.originalFile.arrayBuffer()))),ocrType:capture.ocrFile.type,originalImage:await encode(file),processedImage:await encode(capture.displayFile)};
   });
   fs.writeFileSync(`${output}/${name}-source.jpg`,Buffer.from(result.originalImage,'base64'));fs.writeFileSync(`${output}/${name}-processed.jpg`,Buffer.from(result.processedImage,'base64'));delete result.originalImage;delete result.processedImage;
   fs.writeFileSync(`${output}/${name}-reading.json`,JSON.stringify(result,null,2));
   assert.equal(result.type,'bol');assert.equal(result.fields.bolNo,'87123456');assert.equal(result.fields.documentDate,'2026-09-10');assert.equal(result.match.loadNo,'38324346');assert.equal(result.match.source,'document_route');assert.equal(result.originalUnchanged,true);assert.equal(result.ocrType,'image/png');assert.deepEqual(errors,[]);
   reports.push({browser:name,passed:true,passes:result.passes.length});console.log(`PASS — ${name}: real OCR reads shadowed BOL, date and route; PNG OCR; source preserved`);
  }catch(error){reports.push({browser:name,passed:false,error:String(error),errors});console.error(error);await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});}
  finally{await browser.close();}
 }
}finally{server.kill();}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));
