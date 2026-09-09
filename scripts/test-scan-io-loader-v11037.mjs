import { load as loadJsx } from './test-jsx-loader.mjs';
// Only external capture, OCR and blob/cloud I/O are replaced. The production
// sheet, matchers, save handler, Vault builder and business-store writes run.
const stubs = {
  '/SmartDocumentCaptureV100.jsx': `export default function TestCapture() { return null; }`,
  '/engines/isolatedDocumentRouterV10959.js': `
    export async function analyzeTruckDocumentIsolatedV10959(){return structuredClone(globalThis.__scanIO.result);}
    export function reanalyzeTruckDocumentTypeIsolatedV10959(analysis,typeId){return {...analysis,type:{id:typeId,label:typeId}};}
    export function documentIntelligencePayloadIsolatedV10959(analysis){return {type:analysis.type,fields:analysis.fields,routing:{stacks:[]}};}`,
  '/quotaSafeScanStorageV10963.js': `export async function saveScannedDocumentQuotaSafeV10963(options){globalThis.__scanIO.saved.push(options);return {localDocument:{local_id:'test-document-'+globalThis.__scanIO.saved.length,client_document_id:'test-client',original_file_name:options.file.name},cloud:{status:'local_only'}};}`,
  '/captureAssetStoreV106.js': `export async function persistCaptureAssetsV106(){return {runId:'',assets:[],stored:0};}`,
};
export async function load(url,context,nextLoad) {
  const stub=Object.entries(stubs).find(([suffix])=>url.endsWith(suffix));
  if(stub)return {format:'module',source:stub[1],shortCircuit:true};
  return loadJsx(url,context,nextLoad);
}
