// Browser timers yield to input/paint. There is one file request in flight;
// every chunk rechecks ownership/priority after its quiet interval.
export function createSyncPacer({check = () => {}, wait = ms => new Promise(r => setTimeout(r, ms)),
  now = () => performance.now(), budgetMs = 8, fileDelayMs = 350} = {}) {
  let last = now();
  return {
    async yield() {
      if (now() - last >= budgetMs) {
        await wait(0); await check(); last = now();
      }
    },
    async file() { await check(); await wait(fileDelayMs); await check(); last = now(); },
  };
}

// Full record projection is intentionally lazy: recovery journals can dwarf
// today's logbook. Never load all IndexedDB rows (or all binary files) at once.
export async function* streamRecordInventory({db, state, business, localRows, project, checkpoint}) {
  const priority = r => ['drivers','logbook_days','duty_events','forms','signatures','inspections'].includes(r.kind) ? 0 : 1;
  for (const record of project({state,business,localRows}).sort((a,b) => priority(a)-priority(b))) {
    await checkpoint(); yield record;
  }
  const rank = name => name === 'sync_meta' || name === 'account_receive_staging' ? 2 : /blob/.test(name) ? 1 : 0;
  for (const table of [...db.tables].sort((a,b) => rank(a.name)-rank(b.name))) {
    await checkpoint();
    // A keys-only cursor avoids materializing originals or recovery copies.
    const keys = await table.toCollection().primaryKeys();
    for (let i = 0; i < keys.length; i++) {
      if (table.name === 'sync_meta' && /(auth|session|token|record-sync|cloud-mirror)/i.test(String(keys[i]))) continue;
      await checkpoint();
      const row = await table.get(keys[i]);
      if (!row) throw Error('Records changed during the scan. Synchronization will retry.');
      for (const record of project({tables:{[table.name]:[row]},includeState:false,tableOffsets:{[table.name]:i}})) {
        await checkpoint(); yield record;
      }
    }
  }
}
