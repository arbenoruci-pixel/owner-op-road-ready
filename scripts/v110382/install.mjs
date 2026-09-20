import fs from 'node:fs';
import assert from 'node:assert/strict';
const scan='source/src/modules/scan/';
function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'BOL reader anchor: '+path+' '+before.slice(0,80));
  fs.writeFileSync(path,source.replace(before,after));
}
fs.copyFileSync('scripts/v110382/identifierDetail.js',scan+'identifierDetailV110342.js');
fs.copyFileSync('scripts/v110382/bolBarcode.js',scan+'bolBarcodeV110382.js');
fs.writeFileSync(scan+'v3/DocumentQualityV11036.js',fs.readFileSync('scripts/v110382/documentQuality.js','utf8').replace("'../v110345/paperQuality.js'","'./paperQualityV110345.js'"));
const reader=scan+'imageReaderV110323.js';
patch(reader,'if(shippingPage&&!hasReadableBolReference(completed)){','if(shippingPage){');
patch(reader,'prepareIdentifierDetail(completed,()=>checkCancelled(options.signal))','prepareIdentifierDetail(completed,()=>checkCancelled(options.signal),original)');
patch(reader,"if(detail)await read(detail.file,'identifier-detail','7',{scope:'region',thresholdingMethod:'2',sourcePassId:detail.sourcePassId,region:detail.region});",`if(detail){
          if(!hasReadableBolReference(completed))await read(detail.file,'identifier-detail','7',{scope:'region',thresholdingMethod:'0',sourcePassId:detail.sourcePassId,region:detail.region});
          if(detail.barcode&&detail.barcodeFile){
            const {value,region}=detail.barcode;
            passes.push({id:(page+1)+'-bol-barcode',page:page+1,scope:'region',source:'barcode-code128',
              text:value,confidence:null,sourcePassId:detail.sourcePassId,sourceImageFile:detail.barcodeFile,
              imageSize:{width:region.width,height:region.height},words:[],
              lines:[{text:value,left:0,top:0,width:region.width,height:region.height,confidence:null}]});
          }
        }`);
const adapter=scan+'ownedReaderAdapter.js';
patch(adapter,"source:pass.source==='pdf-text-layer'?'pdf-text-layer':'existing-phone-ocr',lines:separateWordColumns", "source:pass.source==='barcode-code128'?'barcode-code128':pass.source==='pdf-text-layer'?'pdf-text-layer':'existing-phone-ocr',lines:separateWordColumns");
const ui=scan+'OwnedReaderPreview.jsx';
patch(ui,"      {group.kind==='unknown'?",`      {group.checks.filter(check=>check.id==='bol_weight_arithmetic'&&check.status!=='not_checked').map(check=><p key={check.id} role={check.status==='needs_review'?'alert':undefined}>{check.message}</p>)}
      {group.checks.filter(check=>check.id==='bol_barcode_comparison').map((check,i)=><div className="reader-barcode-check" key={check.id+i}>
        <p role={check.status==='needs_review'?'alert':undefined}><b>Barcode: {check.value}</b> · {check.message}</p>
        <button type="button" onClick={()=>openItem({groupId:group.id,key:'bolNumber'})}>Check BOL number</button>
        {sources[check.evidence.sourceImageId]?<details><summary>View barcode source</summary><SourceImage file={sources[check.evidence.sourceImageId]} evidence={check.evidence}/></details>:null}
      </div>)}
      {group.kind==='unknown'?`);
patch(ui,'      {rereadText?<p role="status">',`      {selection.field?.kind==='shipping_weight'?<p>Include the unit shown on the source, such as LB or KG. Leave this item for review if the unit is missing.</p>:null}
      {selection.field?.kind==='temperature_instruction'?<p>This is the printed temperature setting instruction. Check the sign and any condition, such as “Frozen loads”.</p>:null}
      {rereadText?<p role="status">`);
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs']){
  fs.writeFileSync(browser,fs.readFileSync(browser,'utf8').replaceAll("'0.3.18'","'0.3.19'"));
}
console.log('PASS — BOL barcode proof, original-pixel identifier retry and measurement review installed');
