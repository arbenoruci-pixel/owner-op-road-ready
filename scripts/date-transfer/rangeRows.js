import {selectRange} from './core.js';

const PAGE_SIZE = 8;
const excluded = /^(app_snapshots|sync_meta|mutation_queue|account_receive_staging)$/;
const checkAbort = signal => {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
};
const rowKey = (table, row) => {
  const path = table.schema.primKey.keyPath;
  const get = key => key.split('.').reduce((value, part) => value?.[part], row);
  return JSON.stringify(Array.isArray(path) ? path.map(get) : get(path));
};

// Date exports never use recovery snapshots or sync journals. Reading those
// stores with toArray() can deserialize many copies of the entire phone state
// before the date filter runs. Retain only matching rows from bounded pages.
// Repeat the scan to resolve source/asset links discovered in later pages or
// tables, using the same selection rules as the existing transfer format.
export async function readRangeRows({db, state, businessStore, from, to, signal, onProgress = () => {}}) {
  const tables = db.tables.filter(table => !excluded.test(table.name));
  let selected = selectRange(state, businessStore, {}, from, to);
  let added;
  do {
    added = 0;
    for (const table of tables) {
      const keys = new Set((selected.rows[table.name] || []).map(row => rowKey(table, row)));
      for (let offset = 0; ; offset += PAGE_SIZE) {
        checkAbort(signal);
        const page = await table.toCollection().offset(offset).limit(PAGE_SIZE).toArray();
        checkAbort(signal);
        if (!page.length) break;
        const candidates = page.filter(row => !keys.has(rowKey(table, row)));
        if (candidates.length) {
          const before = keys.size;
          selected = selectRange(state, businessStore, {
            ...selected.rows,
            [table.name]: [...(selected.rows[table.name] || []), ...candidates],
          }, from, to);
          for (const row of selected.rows[table.name] || []) keys.add(rowKey(table, row));
          added += keys.size - before;
        }
        onProgress('Finding records for selected dates…');
        // Let Safari paint progress and process Cancel between storage pages.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } while (added);
  checkAbort(signal);
  return selected;
}
