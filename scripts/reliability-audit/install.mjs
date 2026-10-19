import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templates = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length, 2, `Audit readiness anchor changed: ${file} / ${before.slice(0, 100)}`);
  fs.writeFileSync(file, source.replace(before, () => after));
}
const owner = 'source/src/modules/owneros';
for (const [from, to] of [['core.js', 'auditReadinessCoreV1.js'], ['storage.js', 'auditReadinessStorageV1.js'], ['AuditReadiness.jsx', 'AuditReadinessV1.jsx'], ['audit.css', 'auditReadinessV1.css']]) fs.copyFileSync(path.join(templates, from), `${owner}/${to}`);

// These explicit fields are already represented by the existing account-sync
// business setting and per-record buckets. No new table or transport is needed.
const business = 'source/src/modules/business/businessStore.js';
patch(business, '    evidenceAliases:list(value.evidenceAliases),', `    auditEvidenceProfileV1:value.auditEvidenceProfileV1?.version===1?value.auditEvidenceProfileV1:null,
    auditEvidenceReviewsV1:list(value.auditEvidenceReviewsV1),
    evidenceAliases:list(value.evidenceAliases),`);

const workspace = `${owner}/EvidenceWorkspaceV110453.jsx`;
patch(workspace, "import './evidenceWorkspaceV110453.css';", "import './evidenceWorkspaceV110453.css';\nimport AuditReadiness from './AuditReadinessV1.jsx';");
patch(workspace, "[['files','Files'],['loads','Loads'],['packets','Packets']]", "[['files','Files'],['loads','Loads'],['packets','Packets'],['audit','Audit']]");
patch(workspace, "  {tab==='loads'?loadsView:null}", `  {tab==='loads'?loadsView:null}
  {tab==='audit'?<AuditReadiness rows={rows} state={state} onOpen={row=>{if(row.kind==='log'){if(recordLogDay(row.source,state))onOpenLog?.(row.source);else setError('Open this driver in Logbook to inspect the saved day. The active driver has not changed.');}else preview(row);}} onAdd={request=>{chooseTab('files');setAdding(true);setDraft({...empty,category:request.category,unit:request.unit||'',loadNo:request.loadNo||''});setIncoming(null);}}/>:null}`);

const packet = `${owner}/evidenceWorkspacePacketV110453.js`;
patch(packet, "import {ChunkedZip,inspectBlob,checkAbort,sha256}", "import {archiveAuditIndex} from './auditReadinessCoreV1.js';\nimport {ChunkedZip,inspectBlob,checkAbort,sha256}");
patch(packet, '{onProgress=()=>{},signal,readOriginal=original}={}', '{onProgress=()=>{},signal,readOriginal=original,auditIndex=null}={}');
patch(packet, "let blob,path='',failure='',checks;", "let blob,path='',failure='',checks,auditSha256='';");
patch(packet, '   checks=await inspectBlob(blob,{signal});', '   if(auditIndex)auditSha256=await sha256(await blob.arrayBuffer());\n   checks=await inspectBlob(blob,{signal});');
patch(packet, 'records.push({id:row.id,name:row.name,', 'records.push({id:row.id,name:row.name,...(auditIndex?{auditSha256}:{}),');
patch(packet, " await zip.text('manifest.json',", " if(auditIndex)await zip.text('Audit-readiness.json',JSON.stringify(archiveAuditIndex(auditIndex,records,missing),null,2),{signal});\n await zip.text('manifest.json',");
patch(packet, "{format:'road_ready_evidence_packet_v1',createdAt,filters,records,missing,", "{format:'road_ready_evidence_packet_v1',createdAt,filters,records,missing,...(auditIndex?{auditIndexFile:'Audit-readiness.json'}:{}),");
patch(packet, "+'</tbody></table><p>manifest.json contains source identifiers", "+'</tbody></table>'+(auditIndex?'<p><a href=\"Audit-readiness.json\">Audit review index with period, applicability, sources and unresolved items</a></p>':'')+'<p>manifest.json contains source identifiers");

console.log('PASS — IFTA / Safety / IRP scoped evidence reviews, source-bound history, retained business sync fields and audit packet index installed');
