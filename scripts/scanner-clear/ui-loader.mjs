export async function load(url,context,nextLoad){
  if(url.endsWith('/scan/readerAiFallbackV110398.js'))return {format:'module',source:'export async function extractDocumentFields(args){return globalThis.__scannerExtract(args);}',shortCircuit:true};
  if(url.endsWith('.css'))return {format:'module',source:'export default {};',shortCircuit:true};
  return nextLoad(url,context);
}
