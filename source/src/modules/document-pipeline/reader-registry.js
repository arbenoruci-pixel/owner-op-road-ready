import { DOCUMENT_KIND } from './contracts.js';

const readers = new Map();

export function registerDocumentReader(kind, reader) {
  if (!Object.values(DOCUMENT_KIND).includes(kind) || kind === DOCUMENT_KIND.UNKNOWN) {
    throw new Error(`Unsupported document kind: ${kind}`);
  }
  if (!reader || typeof reader.read !== 'function' || !reader.name || !reader.version) {
    throw new Error('Reader must expose name, version and read(input)');
  }
  if (readers.has(kind)) throw new Error(`Reader already registered for ${kind}`);
  readers.set(kind, Object.freeze({ ...reader }));
}

export function getDocumentReader(kind) {
  return readers.get(kind) || null;
}

export function listRegisteredReaders() {
  return [...readers.entries()].map(([kind, reader]) => ({
    kind,
    name: reader.name,
    version: reader.version,
  }));
}

export async function readDocumentByKind(input, kind) {
  const reader = getDocumentReader(kind);
  if (!reader) throw new Error(`No reader registered for ${kind}`);
  return reader.read(input);
}
