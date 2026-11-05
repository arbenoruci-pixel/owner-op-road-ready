export async function load(url,context,nextLoad){
  if(url.endsWith('/lib/owner-op-cloud/inspectionShare.js'))return {format:'module',source:'export async function createCurrentInspectionShare(){throw Error("Network disabled in rendered UI test");}',shortCircuit:true};
  if(url.endsWith('.css'))return {format:'module',source:'export default {};',shortCircuit:true};
  return nextLoad(url,context);
}
