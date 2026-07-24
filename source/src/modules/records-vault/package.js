import { RECORDS_VAULT_SCHEMA_VERSION, WEEK_STATUS } from './constants.js';

const PACKAGE_TYPE = 'road-ready-week';
const PACKAGE_VERSION = 1;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Text(text) {
  if (!globalThis.crypto?.subtle) return '';
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function createWeeklyPackage(week, { appVersion = 'unknown', createdAt = new Date().toISOString() } = {}) {
  if (!week?.weekId) throw new Error('week is required');
  const payload = {
    packageType: PACKAGE_TYPE,
    packageVersion: PACKAGE_VERSION,
    schemaVersion: RECORDS_VAULT_SCHEMA_VERSION,
    appVersion: String(appVersion),
    createdAt,
    sealed: week.status === WEEK_STATUS.SEALED,
    week,
  };
  const checksum = await sha256Text(stableJson(payload));
  return { ...payload, checksum };
}

export function downloadWeeklyPackage(pkg) {
  const json = JSON.stringify(pkg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pkg.week.weekId}.roadready.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function parseWeeklyPackage(input) {
  const text = typeof input === 'string' ? input : await input.text();
  const pkg = JSON.parse(text);
  if (pkg.packageType !== PACKAGE_TYPE) throw new Error('Unsupported package');
  if (pkg.packageVersion !== PACKAGE_VERSION) throw new Error('Unsupported package version');
  if (pkg.schemaVersion !== RECORDS_VAULT_SCHEMA_VERSION) throw new Error('Unsupported records schema');
  if (!pkg.week?.weekId || !Array.isArray(pkg.week.documents)) throw new Error('Invalid week package');
  const { checksum, ...unsigned } = pkg;
  const expected = await sha256Text(stableJson(unsigned));
  if (checksum && expected && checksum !== expected) throw new Error('Package integrity check failed');
  return pkg;
}

export async function packageFileManifest(week, loadFile) {
  const files = [];
  for (const document of week.documents.filter(item => item.status === 'ACTIVE')) {
    const blob = await loadFile(document.storageKey);
    files.push({
      documentId: document.id,
      storageKey: document.storageKey,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: blob?.size ?? document.sizeBytes ?? 0,
      available: Boolean(blob),
    });
  }
  return files;
}
