// Financial intake is proposal-only. Database RPCs own authorization and posting.
export const INTAKE_SOURCE = Object.freeze({
  GMAIL: 'gmail', OUTLOOK: 'outlook', DRIVER: 'driver_upload',
  FIRSTLINE: 'firstline_csv', AMAZON: 'amazon_relay_csv', AMAZON_XLSX: 'amazon_relay_xlsx',
});
const SOURCES = new Set(Object.values(INTAKE_SOURCE));
const KINDS = new Set(['ratecon','bol','pod','fuel','expense','firstline_report','amazon_report','unknown']);
const MAX_CENTS = 100000000000;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function text(value, max = 1024) {
  if (typeof value !== 'string') throw new Error('Expected a string');
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new Error('Invalid text');
  return cleaned;
}
export function parseUSDCents(value) {
  // Strict decimal strings only; never interpret a floating-point amount.
  if (typeof value !== 'string') throw new Error('Amount must be an exact decimal string');
  const m = /^(-?)(?:\$)?(\d{1,12}|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error('Ambiguous USD amount');
  const abs = BigInt(m[2].replaceAll(',', '')) * 100n + BigInt((m[3] || '').padEnd(2, '0'));
  if (abs > BigInt(MAX_CENTS)) throw new Error('Amount outside supported range');
  return Number(m[1] === '-' ? -abs : abs);
}
export function makeIntakeProposal(input) {
  const { source, kind, sha256 } = input;
  if (!SOURCES.has(source) || !KINDS.has(kind)) throw new Error('Unsupported intake source or document');
  if (typeof sha256 !== 'string' || !SHA.test(sha256)) throw new Error('Original SHA-256 required');
  const sourceRef = text(input.sourceRef);
  const attachmentRef = text(input.attachmentRef);
  if (!sourceRef.startsWith(source + ':')) throw new Error('Source reference must be namespaced');
  if (input.amountCents != null && (!Number.isSafeInteger(input.amountCents) || Math.abs(input.amountCents) > MAX_CENTS))
    throw new Error('Amount must be integer cents');
  // Model output is explicitly untrusted; ownership and approval are never taken from it.
  const rules = {};
  for (const key of ['tracking','detention','layover','lumper','podDeadline']) {
    if (input.brokerRules?.[key] != null) rules[key] = text(input.brokerRules[key], 2000);
  }
  return Object.freeze({
    source, sourceRef, attachmentRef, kind, sha256,
    amountCents: input.amountCents ?? null,
    brokerRules: Object.freeze(rules),
    status: 'DRAFT',
    requiresVerification: true,
  });
}
// Only a trusted assignment lookup may supply these matches. The server must
// scope all candidates to the verified carrier and use an independent source
// of evidence; AI confidence, email subject and a card number alone never qualify.
export function routeProposal(proposal, { candidates = [], sharedFuelCard = false } = {}) {
  if (proposal.status !== 'DRAFT' || proposal.requiresVerification !== true) throw new Error('Invalid proposal');
  if (!Array.isArray(candidates)) throw new Error('Invalid assignment candidates');
  const unique = new Map();
  for (const item of candidates) {
    if (!item || !UUID.test(item.operatorId || '')) continue;
    const id = item.operatorId.toLowerCase();
    const evidence = typeof item.evidenceRef === 'string' && item.evidenceRef.trim();
    const verified = item.carrierScoped === true && item.independentEvidence === true && evidence;
    if (!verified) continue;
    if (proposal.kind === 'fuel' && sharedFuelCard && item.transactionAssigned !== true) continue;
    unique.set(id, { operatorId: id, evidenceRef: item.evidenceRef.trim() });
  }
  if (unique.size !== 1 || proposal.kind === 'unknown') {
    return Object.freeze({ status: 'NEEDS_OWNER_REVIEW', operatorId: null, postAllowed: false });
  }
  const match = [...unique.values()][0];
  return Object.freeze({ status: 'MATCHED_DRAFT', ...match, postAllowed: false });
}
// PostgREST numeric/bigint can arrive as decimal strings. Never round or coerce blanks.
function databaseCents(value, key) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value === 0 ? 0 : value;
  if (typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.0+)?$/.test(value) && value.length <= 80) {
    const integer = BigInt(value.split('.')[0]);
    if (integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(integer);
  }
  throw new Error('Invalid database cents: ' + key);
}

// Display DB totals; lumper is already included in credit_cents. A partially
// verified total is not an issued/paid statement or a confirmed payable.
export function settlementDisplay(row) {
  const keys = ['invoice_gross_cents','fee_eligible_gross_cents','lumper_reimbursement_cents','credit_cents','estimated_net_cents','verified_net_cents','negative_balance_cents'];
  const t = Object.fromEntries(keys.map(key => [key, databaseCents(row[key], key)]));
  const netCents = row.net_cents === null ? null : databaseCents(row.net_cents, 'net_cents');
  const isConfirmed = netCents !== null;
  const { invoice_gross_cents: invoice, fee_eligible_gross_cents: feeBase, lumper_reimbursement_cents: lumper,
    credit_cents: credits, estimated_net_cents: estimated, verified_net_cents: verified, negative_balance_cents: negative } = t;
  if (invoice < 0 || feeBase < 0 || lumper < 0 || BigInt(invoice) !== BigInt(feeBase) + BigInt(lumper))
    throw new Error('Invoice total does not reconcile');
  const otherCredits = credits - lumper;
  if (!Number.isSafeInteger(otherCredits) || otherCredits < 0) throw new Error('Credit breakdown does not reconcile');
  if (negative < 0 || (isConfirmed && (netCents !== Math.max(verified, 0) || negative !== Math.max(-verified, 0))) || (!isConfirmed && negative !== 0))
    throw new Error('Confirmed balance does not reconcile');
  return Object.freeze({
    invoiceGrossCents: invoice,
    feeEligibleGrossCents: feeBase,
    lumperCents: lumper,
    otherCreditsCents: otherCredits,
    totalCreditsCents: credits,
    isConfirmed,
    estimatedNetCents: estimated,
    verifiedNetCents: verified,
    negativeBalanceCents: negative,
    netCents,
  });
}
