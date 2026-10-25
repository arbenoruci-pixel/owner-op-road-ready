// Shared, pure import rules. All identities include the provider and account.
export const PARSER_VERSION = 'road-ready-statements/2';
export const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => text(value).toLowerCase();
const header = value => lower(value).replace(/[^a-z0-9]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
const CODES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' ');
const NAMES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Northwest Territories|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon'.split('|');
const STATES = new Map(NAMES.map((name, index) => [lower(name), CODES[index]]));

export function jurisdiction(value) {
  const raw = text(value);
  if (STATES.has(lower(raw))) return STATES.get(lower(raw));
  const parts = raw.toUpperCase().split(/[ ,]+/).filter(Boolean);
  return [...parts].reverse().find(part => CODES.includes(part)) || '';
}

export function importDate(value) {
  const raw = text(value);
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s?(?:AM|PM)|Z|[+-]\d{2}:?\d{2})?$)/i);
  let year, month, day;
  if (match) {
    [, year, month, day] = match;
    if (match[4] !== undefined && (Number(match[4]) > 23 || Number(match[5]) > 59)) return '';
  } else {
    match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:$|[ T](\d{1,2}):(\d{2})(?::\d{2})?(?:\s?(AM|PM))?$)/i);
    if (!match) return '';
    [, month, day, year] = match;
    if (year.length === 2) year = '20' + year;
    if (match[4] !== undefined && (Number(match[4]) > (match[6] ? 12 : 23) || Number(match[5]) > 59)) return '';
  }
  const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(result + 'T00:00:00Z');
  return Number(year) >= 1900 && Number(year) <= 2200 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : '';
}

export function numeric(value) {
  const raw = text(value);
  if (!raw) return null;
  // Currency symbols and grouping separators are allowed; other suffixes are not.
  if (raw.includes(',') && !/^\$?[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) return null;
  const normalized = raw.replace(/^\$/, '').replace(/,/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function csvRows(source = '') {
  const input = String(source).replace(/^\uFEFF/, '');
  const first = input.split(/\r?\n/, 1)[0];
  const delimiter = first.includes('\t') && !first.includes(',') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (!quoted && cell.trim()) throw Error('A CSV quote starts inside an unquoted field.');
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => text(value))) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw Error('The CSV has an unfinished quoted field.');
  row.push(cell);
  if (row.some(value => text(value))) rows.push(row);
  return rows;
}

const ALIASES = {
  date: ['transaction date', 'date of visit', 'purchase date', 'trip date', 'start date', 'period start', 'date', 'day'],
  state: ['jurisdiction', 'state province', 'location state', 'state', 'region'],
  gallons: ['net gallons', 'fuel gallons', 'gallons dispensed', 'gallons', 'quantity gallons', 'quantity', 'qty'],
  total: ['net amount', 'paid', 'transaction amount', 'total amount', 'toll amount', 'total', 'amount', 'charge', 'debit'],
  miles: ['ifta distance miles', 'ifta distance mi', 'ifta distance', 'jurisdiction miles', 'total distance miles', 'total distance mi', 'total distance', 'total miles', 'distance miles', 'distance mi', 'distance km', 'miles', 'distance'],
  taxable: ['ifta taxable miles', 'taxable miles', 'taxable distance miles', 'taxable distance mi', 'taxable distance'],
  truck: ['vehicle number', 'unit number', 'truck number', 'truck', 'unit', 'vehicle'],
  transaction: ['transaction id', 'trip id', 'record id', 'reference number', 'invoice number', 'reference', 'id'],
  merchant: ['merchant name', 'merchant', 'truck stop', 'station', 'location name'],
  account: ['account id', 'account number', 'provider account'],
  load: ['load number', 'load no', 'order number', 'trip number'],
  plaza: ['toll plaza', 'plaza', 'facility', 'location', 'roadway', 'entry plaza'],
};
function pick(row, aliases) {
  for (const key of aliases) if (Object.hasOwn(row, key) && text(row[key]) !== '') return text(row[key]);
  return '';
}
const get = (row, key) => pick(row, ALIASES[key] || [key]);
const has = (headers, key) => (ALIASES[key] || [key]).some(name => headers.includes(name));

export function providerName(fileName = '', options = {}, headers = []) {
  if (text(options.provider) && options.provider !== 'auto') return text(options.provider);
  const raw = lower(fileName);
  if (/mudflap/.test(raw) || headers.includes('gallons dispensed') && headers.includes('date of visit')) return 'Mudflap';
  if (/motive|keeptruckin/.test(raw)) return 'Motive / KeepTruckin';
  if (/samsara/.test(raw)) return 'Samsara';
  if (/geotab/.test(raw)) return 'Geotab';
  if (/illinois|i-?pass|tollway/.test(raw)) return 'Illinois Tollway';
  if (/e-?zpass/.test(raw)) return 'E-ZPass';
  return 'Other provider';
}

function providerKey(row) {
  const provider = lower(row.provider || row.source);
  if (/mudflap|verified_fuel_statement/.test(provider)) return 'mudflap';
  if (/motive|keeptruckin/.test(provider)) return 'motive';
  return provider.replace(/[^a-z0-9]+/g, ' ').trim() || 'other provider';
}
export function scopeOf(row) {
  return [text(row.workspaceId || row.companyId), providerKey(row), text(row.providerAccount || row.accountId)];
}
function externalId(row) {
  if (text(row.transactionId)) return text(row.transactionId);
  if (!text(row.externalId)) return '';
  if (row.source?.endsWith('_csv_v102') && !Object.values(row.raw || {}).includes(row.externalId)) return '';
  return text(row.externalId);
}
export function statementKey(row, kind = 'fuel') {
  const scope = scopeOf(row), id = externalId(row);
  if (kind === 'mileage' && mileagePeriod(row).aggregate) return JSON.stringify([kind, ...scope, 'period', ...mileageIdentity(row)]);
  // A mileage trip can contain several jurisdictions and calendar days.
  if (id) return JSON.stringify([kind, ...scope, 'id', id, ...(kind === 'mileage' ? [importDate(row.date), jurisdiction(row.state), lower(row.truck)] : [])]);
  return JSON.stringify([kind, ...scope, 'fingerprint', ...material(row, kind)]);
}
export function material(row, kind) {
  const shared = [importDate(row.date), jurisdiction(row.state || row.cityState), lower(row.truck || row.unitNumber), lower(row.loadNo)];
  if (kind === 'fuel') return [...shared, numeric(row.gallons), numeric(row.total), lower(row.merchant), text(row.transactionDate || row.transactionTime), lower(row.fuelType)];
  if (kind === 'mileage') return [...shared, ...(mileagePeriod(row).aggregate ? [mileagePeriod(row).end] : []), numeric(row.miles), row.taxableMiles == null ? null : numeric(row.taxableMiles)];
  return [...shared, numeric(row.amount ?? row.total), lower(row.plaza || row.merchant), lower(row.plate)];
}
const equivalent = (left, right, kind) => JSON.stringify(material(left, kind)) === JSON.stringify(material(right, kind));
const sum = (rows, key, decimals = 3) => rows.reduce((total, row) => total + Math.round(Number(row[key] || 0) * 10 ** decimals), 0) / 10 ** decimals;

export function quarterPeriod(value) {
  const match = text(value).match(/^(\d{4})-Q([1-4])$/);
  if (!match) throw Error('Choose a year and quarter.');
  const year = Number(match[1]), quarter = Number(match[2]);
  const start = `${match[1]}-${String(quarter * 3 - 2).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
  if (!importDate(start)) throw Error('Choose a valid report year.');
  return {start, end};
}
const quarterOf = day => `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
export function mileagePeriod(row) {
  const start = importDate(row.periodStart || row.date), end = importDate(row.periodEnd || row.date);
  return {start, end, aggregate: Boolean(start && end && start !== end)};
}
const mileageIdentity = row => { const {start, end} = mileagePeriod(row); return [start, end, jurisdiction(row.state), lower(row.truck)]; };
// Connected period intervals form one review group. Identified daily trips
// remain independent unless an aggregate overlaps them. This avoids pairwise
// scans and oversized conflict lists for 20,000-row Gateway reports.
function mileageConflicts(rows) {
  const groups = new Map(), conflicts = [];
  for (const row of rows) {
    const key = JSON.stringify([text(row.workspaceId || row.companyId), jurisdiction(row.state)]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({row, ...mileagePeriod(row)});
  }
  for (const group of groups.values()) {
    const trucks = new Map(), unknown = group.filter(entry => !text(entry.row.truck));
    for (const entry of group) {
      const truck = lower(entry.row.truck);
      if (!truck) continue;
      if (!trucks.has(truck)) trucks.set(truck, []);
      trucks.get(truck).push(entry);
    }
    if (!trucks.size) trucks.set('', []);
    for (const known of trucks.values()) {
      const entries = [...known, ...unknown].sort((a, b) => a.start.localeCompare(b.start));
      let component = [], end = '';
      const finish = () => {
        if (component.length > 1 && component.some(entry => entry.aggregate || !externalId(entry.row))) conflicts.push({incoming: component.at(-1).row, saved: component.slice(0, -1).map(entry => entry.row), reason: 'Overlapping mileage reports for the same truck and state. Keep one source of totals; existing records were preserved.'});
      };
      for (const entry of entries) {
        if (component.length && entry.start > end) { finish(); component = []; end = ''; }
        component.push(entry); if (entry.end > end) end = entry.end;
      }
      finish();
    }
  }
  return conflicts;
}

export function canonicalMileage(owner = {}) {
  const result = canonicalStatementRows(owner.mileageImports, [], 'mileage');
  const invalidRows = result.rows.filter(row => { const period = mileagePeriod(row); return !period.start || !period.end || period.end < period.start || quarterOf(period.start) !== quarterOf(period.end) || !jurisdiction(row.state) || numeric(row.miles) === null || numeric(row.miles) < 0 || row.taxableMiles != null && (numeric(row.taxableMiles) === null || numeric(row.taxableMiles) < 0 || numeric(row.taxableMiles) > numeric(row.miles)); });
  const invalid = new Set(invalidRows), validRows = result.rows.filter(row => !invalid.has(row));
  const overlaps = mileageConflicts(validRows), blocked = new Set(overlaps.flatMap(conflict => [conflict.incoming, ...conflict.saved]));
  return {...result, invalidRows, rows: validRows.filter(row => !blocked.has(row)), conflicts: [...result.conflicts, ...overlaps]};
}

export function parseStatementCsv(source, fileName = '', options = {}) {
  const table = csvRows(source);
  if (table.length < 2) throw Error('Choose a CSV with a header and at least one transaction.');
  if (table.length > 20001) throw Error('Split statements larger than 20,000 rows into smaller files.');
  const headers = table[0].map(header);
  if (headers.some(key => !key) || new Set(headers).size !== headers.length) throw Error('The CSV has empty or repeated column names.');
  const detected = has(headers, 'gallons') && has(headers, 'total') ? 'fuel' : has(headers, 'miles') && has(headers, 'state') ? 'mileage' : has(headers, 'plaza') && has(headers, 'total') ? 'tolls' : '';
  const kind = options.kind && options.kind !== 'auto' ? options.kind : detected;
  if (!['fuel', 'mileage', 'tolls'].includes(kind)) throw Error('Format not recognized. Choose fuel, state miles or tolls and check the column names. For duty logs, choose a read-only logbook report.');
  if (kind === 'mileage' && (options.periodStart || options.periodEnd) && (!importDate(options.periodStart) || !importDate(options.periodEnd) || options.periodStart > options.periodEnd)) throw Error('Choose a valid mileage report period.');
  const required = kind === 'fuel' ? ['date', 'gallons', 'total'] : kind === 'mileage' ? ['date', 'state', 'miles'] : ['date', 'total'];
  const missing = required.filter(key => !has(headers, key) && !(kind === 'mileage' && key === 'date' && importDate(options.periodStart) && importDate(options.periodEnd)));
  if (missing.length) throw Error('Missing columns: ' + missing.join(', ') + '.');
  const provider = providerName(fileName, options, headers);
  const rows = [], issues = [], footer = {}, fingerprints = new Map();
  for (let index = 1; index < table.length; index += 1) {
    const values = table[index], row = Object.fromEntries(headers.map((key, offset) => [key, text(values[offset])]));
    const firstWords = values.slice(0, 3).map(lower);
    const totalWord = value => /^(?:grand |statement |sub)?total(?: gallons)?$/.test(value);
    const isFooter = (!get(row, 'transaction') || totalWord(lower(get(row, 'transaction')))) && !importDate(get(row, 'date')) && (firstWords.some(totalWord) || lower(row.zip) === 'total gallons');
    if (isFooter) {
      for (const key of ['gallons', 'total', 'miles']) if (get(row, key)) footer[key] = numeric(get(row, key));
      continue;
    }
    const issue = message => issues.push({row: index + 1, message});
    if (values.length !== headers.length) { issue('Column count does not match the header.'); continue; }
    const sourceDate = get(row, 'date');
    const date = importDate(sourceDate || (kind === 'mileage' && !has(headers, 'date') ? options.periodStart : ''));
    if (!date) { issue('Missing or invalid calendar date.'); continue; }
    const state = jurisdiction(get(row, 'state'));
    if ((kind === 'fuel' || kind === 'mileage') && !state) { issue('A recognized state or province is required.'); continue; }
    const transactionId = get(row, 'transaction');
    const item = {
      date, state, provider, providerAccount: text(options.providerAccount || get(row, 'account')),
      workspaceId: text(options.workspaceId), truck: get(row, 'truck') || (kind === 'mileage' ? text(options.truck) : ''), transactionId, externalId: transactionId,
      // A source may explicitly identify a load. The active load is never a fallback.
      loadNo: get(row, 'load').toUpperCase(), source: 'statement_import_v1', parserVersion: PARSER_VERSION,
      sourceRow: index + 1, fileName: text(fileName), raw: row, sourceDate: get(row, 'date'),
      timezone: text(options.timezone),
    };
    if (kind === 'fuel') {
      const gallons = numeric(get(row, 'gallons')), total = numeric(get(row, 'total'));
      if (gallons === null || gallons <= 0 || total === null || total < 0) { issue('Gallons and paid amount must be valid; credit or reversal rows need separate review.'); continue; }
      if (row.units && !/^(?:us )?gal(?:lon)?s?$/i.test(row.units)) { issue('Confirm fuel units in US gallons.'); continue; }
      const city = pick(row, ['city', 'location city']);
      const transactionDate = get(row, 'date').length > 10 ? get(row, 'date') : '';
      Object.assign(item, {gallons, total, merchant: get(row, 'merchant') || provider, cityState: [city, state].filter(Boolean).join(', '), transactionDate, transactionTime: transactionDate.slice(11, 16), fuelType: row['fuel type'] || '', pricePerGallon: numeric(pick(row, ['price per gallon', 'unit price', 'ppu', 'cost', 'price'])) ?? total / gallons, discount: numeric(pick(row, ['discount', 'savings', 'mudflap savings'])) ?? 0});
    } else if (kind === 'mileage') {
      let miles = numeric(get(row, 'miles'));
      let taxableMiles = get(row, 'taxable') === '' ? null : numeric(get(row, 'taxable'));
      const distanceHeader = ALIASES.miles.find(key => text(row[key])) || '';
      const unit = lower(pick(row, ['distance unit', 'units', 'unit of measure']) || (/\bkm\b/.test(distanceHeader) ? 'km' : /\b(?:miles|mi)\b/.test(distanceHeader) ? 'mi' : options.mileageUnit));
      if (!['mi', 'miles', 'km', 'kilometers', 'kilometres'].includes(unit)) { issue('Choose the distance unit shown on the source statement.'); continue; }
      if (miles === null || miles < 0 || get(row, 'taxable') !== '' && (taxableMiles === null || taxableMiles < 0 || taxableMiles > miles)) { issue('Invalid total or taxable distance. Zero taxable miles is allowed.'); continue; }
      const originalMiles = miles, originalTaxableMiles = taxableMiles;
      const sourceEnd = pick(row, ['end date', 'period end', 'to date']) || (!sourceDate ? text(options.periodEnd) : '');
      if (!sourceEnd && headers.some(key => ['start date', 'period start'].includes(key))) { issue('A mileage period needs its source end date. Do not treat a period total as a daily trip.'); continue; }
      if (sourceEnd) {
        const end = importDate(sourceEnd);
        if (!end || end < date) { issue('The mileage period has an invalid end date.'); continue; }
        if (quarterOf(end) !== quarterOf(date)) { issue('This mileage total crosses quarters. Export one quarter or daily jurisdiction detail from Motive.'); continue; }
        item.periodStart = date; item.periodEnd = end;
      }
      if ((mileagePeriod(item).aggregate || options.requireTruck) && !item.truck) { issue('Choose the truck shown on this mileage report. Fleet totals without a truck need vehicle-specific detail.'); continue; }
      if (options.periodStart && (date < options.periodStart || (item.periodEnd || date) > options.periodEnd)) { issue('The source dates are outside the selected report period. Check the quarter.'); continue; }
      if (['km', 'kilometers', 'kilometres'].includes(unit)) { miles *= 0.621371192237334; if (taxableMiles !== null) taxableMiles *= 0.621371192237334; }
      Object.assign(item, {miles, taxableMiles, originalMiles, originalTaxableMiles, originalUnit: unit, unit: 'mi', mileageBasis: options.mileageBasis || 'provider_report', granularity: mileagePeriod(item).aggregate ? 'period' : 'day'});
    } else {
      const amount = numeric(get(row, 'total'));
      if (amount === null || amount < 0) { issue('A valid toll charge is required.'); continue; }
      Object.assign(item, {amount, total: amount, plaza: get(row, 'plaza'), plate: pick(row, ['license plate', 'plate number', 'plate']), merchant: provider, category: 'Tolls'});
    }
    item.importKey = statementKey(item, kind);
    if (!transactionId) {
      if (fingerprints.has(item.importKey)) issue('Indistinguishable transactions have no transaction ID. Check these rows before importing.');
      fingerprints.set(item.importKey, true);
    }
    rows.push(item);
  }
  const uniqueRows = [], sourceDuplicateRows = [], uniqueKeys = new Map();
  for (const row of rows) {
    const prior = uniqueKeys.get(row.importKey);
    if (externalId(row) && prior && equivalent(prior, row, kind)) { sourceDuplicateRows.push(row); continue; }
    if (externalId(row) && prior) issues.push({row: row.sourceRow, message: 'The same source transaction ID has different details in this file.'});
    uniqueRows.push(row); uniqueKeys.set(row.importKey, row);
  }
  const totals = {total: sum(uniqueRows, kind === 'tolls' ? 'amount' : 'total', 2), gallons: sum(uniqueRows, 'gallons'), miles: sum(uniqueRows, 'miles'), taxableMiles: sum(uniqueRows, 'taxableMiles')};
  for (const [key, expected] of Object.entries(footer)) {
    const sourceTotal = kind === 'mileage' && key === 'miles' ? sum(uniqueRows, 'originalMiles') : totals[key];
    if (expected === null || Math.abs(sourceTotal - expected) > (key === 'total' ? .011 : .012)) issues.push({row: 'total', message: `Statement ${key} does not match the transaction rows.`});
  }
  if (!rows.length) issues.push({row: 'file', message: 'No valid transaction rows were found.'});
  const dates = rows.flatMap(row => [row.periodStart || row.date, row.periodEnd || row.date]).sort();
  return {kind, provider, parserVersion: PARSER_VERSION, rows: uniqueRows, sourceDuplicateRows, sourceRowCount: rows.length, issues, valid: issues.length === 0, totals, periodStart: dates[0] || '', periodEnd: dates.at(-1) || '', headers};
}

// No overwrite: a changed transaction is a conflict even on an identical reimport.
export function previewStatement(parsed, existing = []) {
  const byKey = new Map();
  for (const row of existing) {
    const key = statementKey(row, parsed.kind);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  const added = [], duplicates = [...(parsed.sourceDuplicateRows || [])], conflicts = [];
  for (const incoming of parsed.rows) {
    const row = {...incoming, importKey: statementKey(incoming, parsed.kind)};
    const saved = byKey.get(row.importKey) || [];
    if (!saved.length) { added.push(row); byKey.set(row.importKey, [row]); }
    else if (saved.every(value => equivalent(value, row, parsed.kind))) duplicates.push(row);
    else conflicts.push({incoming: row, saved});
  }
  if (parsed.kind === 'mileage') conflicts.push(...mileageConflicts([...existing, ...added]));
  return {...parsed, added, duplicates, conflicts, canSave: parsed.valid && conflicts.length === 0};
}

function mirrored(a, b, kind) {
  // Old imports wrote a second row without provider/truck metadata. Only pair
  // an unambiguous, exact transaction ID and financial/date match.
  if (!externalId(a) || externalId(a) !== externalId(b) || !importDate(a.date) || importDate(a.date) !== importDate(b.date)) return false;
  const scopeA = scopeOf(a), scopeB = scopeOf(b);
  if (scopeA[0] !== scopeB[0] || scopeA[2] !== scopeB[2]) return false;
  const knownMirror = ['fuel_csv_v102', 'mudflap_csv_v102', 'toll_csv_v102'].includes(b.source);
  if (!knownMirror || a.provider && b.provider && providerKey(a) !== providerKey(b)) return false;
  if (b.source === 'mudflap_csv_v102' && providerKey(a) !== 'mudflap') return false;
  if (kind === 'fuel') return numeric(a.gallons) === numeric(b.gallons) && numeric(a.total) === numeric(b.total) && jurisdiction(a.state || a.cityState) === jurisdiction(b.state || b.cityState);
  return numeric(a.amount ?? a.total) === numeric(b.amount ?? b.total);
}
function legacyFinancialKey(row, kind) {
  const scope = scopeOf(row);
  return JSON.stringify([scope[0], scope[2], importDate(row.date), jurisdiction(row.state || row.cityState), kind === 'fuel' ? numeric(row.gallons) : null, numeric(row.amount ?? row.total), lower(row.merchant || row.plaza)]);
}
export function canonicalStatementRows(ownerRows = [], businessRows = [], kind = 'fuel') {
  const rows = [], duplicates = [], conflicts = [];
  const owners = list(ownerRows), business = list(businessRows);
  const keys = new Map(), ownersById = new Map(), ownersWithoutId = new Map();
  for (const row of owners) {
    const id = externalId(row);
    if (id) { if (!ownersById.has(id)) ownersById.set(id, []); ownersById.get(id).push(row); }
    else { const key = legacyFinancialKey(row, kind); if (!ownersWithoutId.has(key)) ownersWithoutId.set(key, []); ownersWithoutId.get(key).push(row); }
    const key = kind === 'mileage' ? statementKey(row, kind) : row.importKey || statementKey(row, kind), previous = keys.get(key);
    if (!previous) { keys.set(key, row); rows.push(row); }
    else if (equivalent(previous, row, kind)) duplicates.push(row);
    else conflicts.push({incoming: row, saved: [previous]});
  }
  for (const row of business) {
    const key = row.importKey || statementKey(row, kind), previous = keys.get(key);
    const mirrors = (ownersById.get(externalId(row)) || []).filter(owner => mirrored(owner, row, kind));
    const ambiguous = !externalId(row) && ['fuel_csv_v102', 'mudflap_csv_v102', 'toll_csv_v102'].includes(row.source) ? ownersWithoutId.get(legacyFinancialKey(row, kind)) || [] : [];
    if (ambiguous.length) { conflicts.push({incoming: row, saved: ambiguous, reason: 'Legacy copies have no source transaction ID.'}); continue; }
    if (previous && equivalent(previous, row, kind) || mirrors.length === 1) { duplicates.push(row); continue; }
    if (previous || mirrors.length > 1) { conflicts.push({incoming: row, saved: previous ? [previous] : mirrors}); continue; }
    keys.set(key, row); rows.push(row);
  }
  // Conflicting versions are preserved in storage and excluded from totals.
  const conflicted = new Set(conflicts.flatMap(conflict => conflict.saved));
  return {rows: rows.filter(row => !conflicted.has(row)), duplicates, conflicts};
}

export function canonicalFuel(owner = {}, business = {}) {
  return canonicalStatementRows(owner.fuelImports, business.fuel, 'fuel');
}
export function canonicalTolls(owner = {}, business = {}) {
  return canonicalStatementRows(owner.tolls, list(business.expenses).filter(row => lower(row.category) === 'tolls' || row.source === 'toll_csv_v102'), 'tolls');
}

export function iftaStatementSummary(owner = {}, business = {}, quarter = '', truck = '') {
  const selectTruck = row => !truck || lower(row.truck) === lower(truck);
  const fuel = canonicalFuel(owner, business), mileage = canonicalMileage(owner);
  const invalidRows = [...mileage.invalidRows], states = new Map();
  let unknownTaxableRows = 0;
  const within = row => {
    const day = importDate(row.date);
    if (!day) { invalidRows.push(row); return false; }
    return `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}` === quarter;
  };
  const ensure = value => {
    const state = jurisdiction(value) || 'UNK';
    if (!states.has(state)) states.set(state, {state, miles: 0, taxableMiles: 0, gallons: 0, fuelTotal: 0, mileageRows: 0, fuelRows: 0, sources: new Set()});
    return states.get(state);
  };
  for (const row of mileage.rows.filter(within)) {
    if (!selectTruck(row)) continue;
    const period = mileagePeriod(row);
    if (!period.end || period.end < period.start || quarterOf(period.start) !== quarterOf(period.end)) { invalidRows.push(row); continue; }
    if (numeric(row.miles) === null || numeric(row.miles) < 0 || row.taxableMiles != null && (numeric(row.taxableMiles) === null || numeric(row.taxableMiles) < 0)) { invalidRows.push(row); continue; }
    const target = ensure(row.state);
    target.miles += Number(row.miles || 0);
    if (row.taxableMiles == null) unknownTaxableRows += 1;
    else target.taxableMiles += Number(row.taxableMiles);
    target.mileageRows += 1;
    if (row.provider) target.sources.add(row.provider);
  }
  for (const row of fuel.rows.filter(within)) {
    if (!selectTruck(row)) continue;
    if (numeric(row.gallons) === null || numeric(row.gallons) <= 0 || numeric(row.total) === null || numeric(row.total) < 0) { invalidRows.push(row); continue; }
    const target = ensure(row.state || row.cityState);
    target.gallons += Number(row.gallons || 0);
    target.fuelTotal += Number(row.total || 0);
    target.fuelRows += 1;
    if (row.provider || row.merchant) target.sources.add(row.provider || row.merchant);
  }
  const rows = [...states.values()].map(row => ({...row, sources: [...row.sources], mpg: row.gallons > 0 ? row.miles / row.gallons : 0, status: row.miles > 0 && row.gallons > 0 ? 'complete' : row.miles > 0 ? 'missing_fuel' : 'fuel_only'})).sort((a, b) => a.state.localeCompare(b.state));
  const conflicts = [...fuel.conflicts, ...mileage.conflicts];
  return {quarter, rows, totalMiles: sum(rows, 'miles'), taxableMiles: sum(rows, 'taxableMiles'), gallons: sum(rows, 'gallons'), fuelTotal: sum(rows, 'fuelTotal', 2), missingFuelStates: rows.filter(row => row.status === 'missing_fuel').map(row => row.state), unknownRows: rows.filter(row => row.state === 'UNK').length, invalidRows, conflicts, duplicateCount: fuel.duplicates.length + mileage.duplicates.length, unknownTaxableRows, needsReview: invalidRows.length > 0 || conflicts.length > 0 || unknownTaxableRows > 0 || rows.some(row => row.state === 'UNK')};
}
