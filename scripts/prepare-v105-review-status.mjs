import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/documents/documentFoundationV105.js');
let source = fs.readFileSync(target, 'utf8');

const before = "invalidLoad || invalidPlace || invalidDate || document.reviewStatus === 'needs_review'";
const after = "invalidLoad || invalidPlace || invalidDate || document.status === 'needs_review' || document.reviewStatus === 'needs_review'";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v105 missing legacy document review-status condition');
  source = source.replace(before, after);
}

const summaryPattern = /export function loadDocumentSummaryV105\(store = \{\}, loadNo = ''\) \{[\s\S]*?\n\}\n\nexport function searchVaultDocumentsV105/;
if (!summaryPattern.test(source)) throw new Error('v105 missing load document checklist functions');
source = source.replace(summaryPattern, `export function loadDocumentSummaryV105(store = {}, loadNo = '') {
  const canonical = normalizeCanonicalLoadNoV105(loadNo);
  const documents = (Array.isArray(store.documents) ? store.documents : []).filter(document => (
    document.status !== 'archived'
    && normalizeCanonicalLoadNoV105(document.canonicalLoadNo || document.loadNo) === canonical
  ));
  const verifiedDocuments = documents.filter(document => document.status === 'verified' || document.reviewStatus === 'verified');
  const types = new Set(verifiedDocuments.map(document => textV105(document.type)));
  const podByStop = {};
  for (const document of verifiedDocuments.filter(document => document.type === 'pod')) {
    const sequence = Number(document.stopSequence || 0);
    if (sequence) podByStop[sequence] = document.id;
  }
  return {
    loadNo:canonical,
    documents,
    verifiedDocuments,
    count:documents.length,
    verifiedCount:verifiedDocuments.length,
    rateConfirmationPresent:types.has('rate_confirmation'),
    bolPresent:types.has('bol') || types.has('pod'),
    podPresent:types.has('pod'),
    finalPodPresent:verifiedDocuments.some(document => document.type === 'pod' && (document.isFinalStop || document.finalStop || document.stopSequence === document.stopCount)),
    podByStop,
    needsReview:documents.filter(document => document.reviewStatus === 'needs_review' || document.status === 'needs_review').length,
  };
}

export function doesLoadHaveDocumentV105(store = {}, loadNo = '', type = '', stopSequence = 0) {
  const summary = loadDocumentSummaryV105(store, loadNo);
  if (!type) return summary.verifiedCount > 0;
  if (type === 'bol') return summary.bolPresent;
  if (type === 'pod' && stopSequence) return Boolean(summary.podByStop[Number(stopSequence)]);
  if (type === 'pod') return summary.podPresent;
  return summary.verifiedDocuments.some(document => textV105(document.type) === textV105(type));
}

export function searchVaultDocumentsV105`);

fs.writeFileSync(target, source);
console.log('v105 explicit Needs Review status and verified checklist preserved');
