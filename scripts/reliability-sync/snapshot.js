import { recordsFrom, equivalentRecords, same, scopedRecords } from './accountCoreV110455.js';

// Compare the same semantic records as reconciliation, preserving every event,
// annotation, signature, source reference and history. Navigation is still saved
// locally, but it cannot start another network pass.
export function snapshotChange(before, after) {
  if (same(before, after)) return { write: false, records: false, archive: false };
  const oldRecords = recordsFrom({ state: before || {} });
  const newRecords = recordsFrom({ state: after || {} });
  return {
    write: true,
    records: !equivalentRecords(scopedRecords(oldRecords, 'records'), scopedRecords(newRecords, 'records')),
    archive: !equivalentRecords(oldRecords, newRecords),
  };
}

export function archiveChanged(remote = {}, baseline = {}) {
  const onlyArchive = records => Object.fromEntries(Object.entries(records).filter(([key]) =>
    !(key in scopedRecords({ [key]: records[key] }, 'records'))));
  return !equivalentRecords(onlyArchive(remote), onlyArchive(baseline));
}

export function statusTransition(previous, patch, now = Date.now()) {
  const next = { ...previous, ...patch };
  if (['error', 'conflict', 'account_mismatch'].includes(patch.phase)) {
    const identical = previous.issue?.phase === patch.phase && previous.issue?.message === next.message && previous.issue?.scope === next.scope;
    next.issue = identical ? previous.issue : { phase: patch.phase, message: next.message, scope: next.scope, firstAt: now };
  } else if (['current', 'records_current'].includes(patch.phase) &&
      (!previous.issue || next.scope === 'all' || previous.issue.scope === next.scope)) next.issue = null;
  // Progress and last-completion metadata remain available for diagnostics.
  // Identical failures do not generate repeated live-region announcements.
  const visible = value => ({ phase: value.phase, message: value.message, scope: value.scope,
    revision: value.revision, issue: value.issue, conflicts: value.conflicts || [] });
  return { next, changed: !same(visible(previous), visible(next)) };
}
