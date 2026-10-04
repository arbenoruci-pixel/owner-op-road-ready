// The searchable business index must not duplicate the full document payload in
// localStorage. Full rows and pre-import business mirrors remain in IndexedDB.
const payloadKeys=new Set(['raw','text','sourceText','analysisText','intelligence','packet','routing','validation','actions','fieldConfidence','matchedEntities','assets','rawText','raw_text','ocrText','ocr_text','rawOcr','rawOCR','ocrResult','ocrResults','rawPages','pageImages','images','originalDataUrl','original_data_url','photoDataUrl','photo_data_url','previewDataUrl','thumbnailDataUrl','dataUrl','data_url','fileDataUrl','base64','fileBase64'].map(key=>key.toLowerCase()));
function compact(value){
 if(typeof value==='string')return /^data:[^,]*;base64,/i.test(value)?undefined:value;
 if(Array.isArray(value))return value.map(compact).filter(v=>v!==undefined);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!payloadKeys.has(key.toLowerCase())).map(([key,item])=>[key,compact(item)]).filter(([,item])=>item!==undefined));
}
export function libraryIndexRecord(previous,mirror){
 const full={...previous,...mirror};
 // Provenance and prior assignments are available on the full local document.
 const next=compact(full);
 if(full.librarySource)next.librarySource={packageId:full.librarySource.packageId};
 next.libraryMetadataStorage='documents_local';
 return {full,next};
}
export function isQuotaError(error){
 return /quota|disk.*full/i.test([error?.name,error?.message].filter(Boolean).join(' '));
}
