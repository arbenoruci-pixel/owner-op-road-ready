import {csvRows, parseStatementCsv, previewStatement, canonicalFuel} from '../../smart-import/core.js';
export {csvRows as parseCsvRows};

export function parseFuelStatement(source = '', fileName = '', options = {}) {
  const first = String(source).replace(/^\uFEFF/, '').trimStart().split(/\r?\n/, 1)[0].toLowerCase();
  if (!/gallons|quantity/.test(first) || !/paid|amount|total/.test(first) || !/date/.test(first)) return null;
  const parsed = parseStatementCsv(source, fileName, {...options, kind: 'fuel'});
  return {...parsed, kind: 'fuel_statement', transactions: parsed.rows.map(row => ({...row, unitNumber: row.truck})), transactionCount: parsed.rows.length, total: parsed.totals.total, gallons: parsed.totals.gallons};
}
export function fuelStatementFields(statement) {
  return {type: 'fuel_receipt', title: 'Fuel statement', documentScope: 'statement', provider: statement.provider, transactions: statement.transactions, transactionCount: statement.transactionCount, total: statement.total, gallons: statement.gallons, periodStart: statement.periodStart, periodEnd: statement.periodEnd, date: statement.periodEnd, documentDate: statement.periodEnd, merchant: statement.provider || 'Fuel statement', loadNo: '', transactionId: '', statementVerified: statement.valid};
}
export function upsertFuelTransactions(store, document, fields, ownerStore = {}) {
  if (!Array.isArray(fields.transactions) || !fields.transactions.length || fields.statementVerified !== true) throw Error('Review and verify the fuel statement before saving.');
  const canonical = canonicalFuel(ownerStore, store);
  if (canonical.conflicts.length) throw Error('Review existing fuel transaction conflicts before importing.');
  const transactions = fields.transactions.map(row => ({...row, provider: row.provider || fields.provider || 'Other provider', loadNo: row.loadNo || ''}));
  const workspaceId = transactions[0]?.workspaceId || '';
  const existing = canonical.rows.map(row => row.workspaceId ? row : {...row, workspaceId});
  const preview = previewStatement({kind: 'fuel', rows: transactions, issues: [], valid: true}, existing);
  if (!preview.canSave) throw Error('Conflicting fuel transactions need review. Existing amounts were kept.');
  const added = preview.added.map(row => ({...row, id: 'fuel_transaction_' + encodeURIComponent(row.importKey), documentId: document.id || document.local_id, sourceDocumentId: document.id || document.local_id, receiptAttached: true, source: 'verified_fuel_statement', createdAt: Date.now(), updatedAt: Date.now()}));
  return added.length ? {...store, fuel: [...added, ...(store.fuel || [])], updatedAt: Date.now()} : store;
}
