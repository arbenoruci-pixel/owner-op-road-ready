import {canonicalFuel, canonicalTolls, importDate, jurisdiction, numeric, text} from './core.js';

const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
const money = rows => rows.reduce((sum, row) => sum + Math.round(Number(row.total || row.amount || 0) * 100), 0) / 100;
const dayOf = row => importDate(row.date || row.document_date || row.documentDate || row.extracted?.date || '');
const overlaps = (first, last, start, end) => first && last && first <= end && last >= start;

export function monthlyRecords({month, state = {}, owner = {}, business = {}, documents = [], driverId = '', today = ''}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Choose a calendar month.');
  const start = month + '-01', end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const inMonth = value => Boolean(importDate(value)) && value >= start && value <= end;
  const activeId = state.activeDriverId || state.teamDrivers?.[0]?.id || 'driver_primary';
  const books = {...state.teamLogbooksByDriverId, [activeId]: state};
  const logs = [];
  for (const [id, book] of Object.entries(books)) {
    if (driverId && id !== driverId) continue;
    const dates = new Set([...Object.keys(book.eventsByDay || {}), ...Object.keys(book.formByDay || {})]);
    for (const day of dates) if (inMonth(day)) {
      const events = list(book.eventsByDay?.[day]);
      if (!events.length && !book.formByDay?.[day]) continue;
      logs.push({id: id + ':' + day, driverId: id, driverName: state.teamDrivers?.find(driver => driver.id === id)?.name || (id === activeId ? state.driverProfile?.name : '') || id, day, events: events.length, signature: Boolean(book.signatureByDay?.[day]), source: book});
    }
  }
  logs.sort((a, b) => a.day.localeCompare(b.day) || a.driverId.localeCompare(b.driverId));
  const fuel = canonicalFuel(owner, business), tolls = canonicalTolls(owner, business);
  const fuelRows = fuel.rows.filter(row => inMonth(row.date)), tollRows = tolls.rows.filter(row => inMonth(row.date));
  const mileage = list(owner.mileageImports).filter(row => inMonth(row.date));
  const files = list(documents).filter(document => {
    const fields = document.extracted || {};
    if (driverId && fields.driverId && fields.driverId !== driverId) return false;
    return inMonth(dayOf(document)) || list(fields.transactions).some(row => inMonth(row.date)) || overlaps(importDate(fields.periodStart), importDate(fields.periodEnd), start, end);
  });
  const archives = files.filter(document => document.extracted?.readOnlyLogbook || document.type === 'logbook_archive');
  const loads = list(business.loads).filter(load => {
    const pickup = importDate(load.pickupDate || load.date || load.bookedDate), delivery = importDate(load.deliveryDate || load.deliveredDate || load.completedDate);
    return inMonth(pickup) || inMonth(delivery) || overlaps(pickup, delivery, start, end);
  });
  const expenses = [...list(business.expenses).filter(row => !/tolls/i.test(text(row.category)) && row.source !== 'toll_csv_v102'), ...list(business.maintenance)].filter(row => inMonth(row.date));
  const settlements = list(business.settlements).filter(row => inMonth(row.date || row.paidDate));
  const undated = [...list(business.fuel), ...list(owner.fuelImports), ...list(owner.mileageImports), ...list(business.expenses)].filter(row => !importDate(row.date)).length;
  const documentIds = new Set(documents.flatMap(document => [document.local_id, document.id, document.client_document_id]).filter(Boolean));
  const withoutSource = fuelRows.filter(row => !documentIds.has(row.sourceDocumentId || row.documentId));
  const wallet = Object.entries(state.dotWallet?.documents || {}).map(([id, record]) => ({...record, id}));
  const expiring = wallet.filter(record => {
    const expiry = importDate(record.expiresOn) || (/^\d{4}-\d{2}$/.test(record.expiresMonth || '') ? record.expiresMonth + '-01' : '');
    return expiry && expiry <= end;
  });
  const through = today && today < end ? today : end;
  const missingLocalDays = [];
  if (driverId && start <= through) {
    const present = new Set(logs.filter(log => log.driverId === driverId).map(log => log.day));
    for (let day = start; day <= through; ) {
      if (!present.has(day)) missingLocalDays.push(day);
      const next = new Date(day + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1); day = next.toISOString().slice(0, 10);
    }
  }
  return {month, start, end, logs, archives, files, loads, fuel: fuelRows, mileage, expenses, tolls: tollRows, settlements, expiring, missingLocalDays, undated, conflicts: [...fuel.conflicts, ...tolls.conflicts], sourceLinksToReview: withoutSource.length, totalFuel: money(fuelRows), gallons: fuelRows.reduce((sum, row) => sum + (numeric(row.gallons) || 0), 0), miles: mileage.reduce((sum, row) => sum + (numeric(row.miles) || 0), 0), jurisdictions: [...new Set(mileage.map(row => jurisdiction(row.state)))].filter(Boolean), totalExpenses: money(expenses) + money(tollRows), unknownTaxableRows: mileage.filter(row => row.taxableMiles === null).length};
}
