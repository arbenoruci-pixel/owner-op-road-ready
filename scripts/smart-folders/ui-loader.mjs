export async function load(url,context,nextLoad){
 if(url.endsWith('.css'))return {format:'module',source:'export default {};',shortCircuit:true};
 if(url.endsWith('/loadFolderReconciliationV10974.js'))return {format:'module',source:'export const reconcileLoadFoldersV10974=({loads,documents})=>({folders:loads,allDocuments:documents});',shortCircuit:true};
 if(url.endsWith('/shipmentFiling.js'))return {format:'module',source:'export const collectShipmentScanCandidates=state=>state.testCandidates||[];',shortCircuit:true};
 if(url.endsWith('/driverDocumentsV110415.js'))return {format:'module',source:'export const loadView=()=>({rows:[]});',shortCircuit:true};
 if(url.endsWith('/LoadFoldersV10969.jsx'))return {format:'module',source:'export default function Advanced(){return null;}',shortCircuit:true};
 if(url.endsWith('/documentActionsV110415.js'))return {format:'module',source:'export async function openSource(doc){globalThis.__openedDocument=doc;}export async function prepareLoadFiles(){return [];}',shortCircuit:true};
 return nextLoad(url,context);
}
