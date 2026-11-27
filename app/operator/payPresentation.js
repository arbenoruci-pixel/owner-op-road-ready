import {moveDay, paymentRecorded} from './financials.js';
import {databaseCents} from '../../lib/rr-lease/intake-contract.js';

const revenueTypes = new Set(['FREIGHT', 'FSC', 'DETENTION', 'LAYOVER', 'TONU']);

export function payWeek(date) {
  const start = new Date(date + 'T12:00:00Z');
  const end = new Date(moveDay(date, 6) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).formatRange(start, end);
}

export function payoutLabel(status, totals, payment) {
  if ((status === 'issued' || status === 'paid') && !totals.isConfirmed) return ['Statement amount', 'Reconciliation needed'];
  if (status === 'paid' && payment?.payment_amount_cents != null) {
    try {
      const paid = {...payment, payment_amount_cents:databaseCents(payment.payment_amount_cents, 'payment_amount_cents')};
      if (paymentRecorded(paid, totals.netCents)) return ['Paid amount', 'Paid'];
    } catch { /* Show the unverified statement if payment evidence is incomplete. */ }
  }
  if (status === 'paid') return ['Statement amount', 'Payment details pending'];
  if (status === 'issued') return ['Statement amount', 'Issued'];
  if (totals.isConfirmed) return ['Confirmed payable', 'Draft'];
  return ['Estimated payout', 'Draft'];
}

// The driver ledger is already in cents after the contractual fee. Keep the
// server's per-entry rounding, including when a load has multiple charges.
export function loadPayLines(entries) {
  const groups = new Map();
  let insurance = 0n;
  for (const row of entries) {
    if (!['POSTED', 'DRAFT'].includes(row.status)) continue;
    const effect = BigInt(databaseCents(row.driver_effect_cents, 'driver_effect_cents'));
    if (row.entry_type === 'INSURANCE' && effect < 0n) insurance -= effect;
    if (!row.load_id || !revenueTypes.has(row.entry_type)) continue;
    const group = groups.get(row.load_id) || {id:row.load_id, gross:0n, net:0n, description:row.description};
    group.gross += BigInt(databaseCents(row.amount_cents, 'amount_cents'));
    group.net += effect;
    groups.set(row.load_id, group);
  }
  return {loads:[...groups.values()], insurance};
}
