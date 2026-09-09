// Raw compressed PDF streams can contain accidental English words. They must
// never be classified as a readable tax form or used as payment evidence.
export function readablePdfFallbackV110310(result={}) {
  const text=String(result.text||'');
  const binaryControls=(text.match(/[\u007f-\u009f]/g)||[]).length;
  if(text.length>100 && binaryControls/text.length>.01)return {...result,text:'',nativeText:false,method:'pdf-import-no-readable-text',needsReview:true};
  return result;
}
