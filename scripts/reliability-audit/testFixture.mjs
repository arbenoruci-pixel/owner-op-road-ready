import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptRoot, '../..');
export const originalText = '%PDF-1.4\nSynthetic audit source: 2026-10-19, truck 228, fuel 50 gallons, $175.00\n%%EOF';
export const testProfile = { version: 1, company: 'Synthetic Carrier LLC', operations: 'interstate_property', jurisdictions: 'IL, NJ, PA', units: '228, 229', iftaApplies: 'required', iftaBase: 'IL', irpApplies: 'required', irpBase: 'NJ', cdl: 'yes', reference: 'Synthetic license and cab card for isolated tests', confirmedBy: 'Synthetic Reviewer', effectiveFrom: '2026-01-01' };
export async function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'road-ready-audit-'));
  const owner = path.join(root, 'source/src/modules/owneros'), business = path.join(root, 'source/src/modules/business'), backup = path.join(root, 'source/src/modules/backup');
  [owner, business, backup].forEach(p => fs.mkdirSync(p, { recursive: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  const runtime = process.env.ROAD_READY_AUDIT_BASE || '';
  let businessCode = fs.readFileSync(path.join(runtime || repoRoot, 'source/src/modules/business/businessStore.js'), 'utf8');
  if (!businessCode.includes('    evidenceAliases:list(value.evidenceAliases),')) businessCode = businessCode.replace('    loads: list(value.loads).map(cleanRecord),', '    evidenceAliases:list(value.evidenceAliases),\n    loads: list(value.loads).map(cleanRecord),');
  fs.writeFileSync(path.join(business, 'businessStore.js'), businessCode);
  for (const [template, target] of [['Workspace.jsx', 'EvidenceWorkspaceV110453.jsx'], ['core.js', 'evidenceWorkspaceCoreV110453.js'], ['packet.js', 'evidenceWorkspacePacketV110453.js']]) fs.copyFileSync(path.join(runtime || repoRoot, runtime ? 'source/src/modules/owneros/' + target : 'scripts/v110453/' + template), path.join(owner, target));
  if (runtime) for (const file of ['source/src/modules/loads/loadIdentityV110326.js', 'source/src/core/navigation/workspaceNavigationV110477.js']) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(runtime, file), target); }
  fs.copyFileSync(path.join(repoRoot, 'scripts/v110431/chunkedZip.js'), path.join(backup, 'chunkedZipV110431.js'));
  fs.writeFileSync(path.join(owner, 'transferStorageV110412.js'), 'export async function readTransferOriginal(record){return window.__auditOriginals?.[record.local_id]||null;}\nexport async function readTransferCaptureAssets(){return [];}\n');
  fs.writeFileSync(path.join(owner, 'transferCoreV110412.js'), "export {sha256 as digest} from '../backup/chunkedZipV110431.js';\n");
  const install = async pass => { const cwd = process.cwd(); try { process.chdir(root); await import(pathToFileURL(path.join(scriptRoot, 'install.mjs')).href + '?fixture=' + encodeURIComponent(root) + '&pass=' + pass); } finally { process.chdir(cwd); } };
  await install(1);
  const files = [path.join(owner, 'EvidenceWorkspaceV110453.jsx'), path.join(owner, 'evidenceWorkspacePacketV110453.js'), path.join(business, 'businessStore.js')], before = files.map(p => fs.readFileSync(p, 'utf8'));
  await install(2); assert.deepEqual(files.map(p => fs.readFileSync(p, 'utf8')), before, 'installer must be idempotent');
  return { root, owner, business, backup, url: name => pathToFileURL(path.join(owner, name)).href, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
