'use client';

import { useEffect, useRef, useState } from 'react';
import { usePortalClient } from './PortalSession.jsx';
import { prepareOriginal, saveDriverRecord, sha256 } from './driverRecordUpload.js';
import styles from './DriverToolsForm.module.css';

const recordTypes = {
  maintenance: 'Maintenance / repair',
  expense: 'Business expense',
  mileage: 'IFTA jurisdiction miles',
  fuel: 'Fuel purchase',
  logbook: 'ELD / logbook copy',
  ifta_filing: 'IFTA filing copy',
  audit_document: 'Audit document',
};
const documentKinds = ['logbook', 'ifta_filing', 'audit_document'];
const fuelTypes = {
  unknown: 'Unknown', diesel: 'Diesel', gasoline: 'Gasoline', biodiesel: 'Biodiesel',
  reefer: 'Reefer fuel', def: 'DEF', other: 'Other',
};
const expenseCategories = [
  'Repairs & maintenance', 'Tires', 'Fuel', 'DEF', 'Tolls', 'Parking', 'Insurance',
  'ELD / communications', 'Permits & registration', 'Truck / trailer lease', 'Supplies', 'Other',
];
const jurisdictions = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY ' +
  'AB BC MB NB NL NS NT NU ON PE QC SK YT').split(' ');
function chicagoToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((name) => parts.find((part) => part.type === name).value).join('-');
}

function buildRecord(data) {
  const text = (name) => (data.get(name) || '').trim();
  const kind = text('kind');
  const note = text('description');
  if (!note) throw new Error('Enter a description.');
  const record = { kind, record_date: text('record_date'), description: note };
  for (const key of ['unit', 'vendor', 'expense_category', 'next_service_date', 'jurisdiction', 'fuel_type', 'fuel_tax_paid', 'coverage_start', 'coverage_end']) {
    if (text(key)) record[key] = text(key);
  }
  for (const key of ['odometer', 'next_service_odometer', 'miles', 'taxable_miles', 'gallons']) {
    if (text(key)) record[key] = Number(text(key));
  }
  if (text('amount')) {
    const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(text('amount'));
    if (!match || (!match[1] && !match[2])) throw new Error('Enter a dollar amount with up to two decimal places.');
    record.amount_cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  }
  if (record.next_service_date && record.next_service_date < record.record_date) {
    throw new Error('Next service date must be on or after the service date.');
  }
  if (record.next_service_odometer < record.odometer) {
    throw new Error('Next service mileage must be at least the current odometer reading.');
  }
  if (record.taxable_miles > record.miles) throw new Error('Taxable miles cannot exceed the total distance.');
  if (Boolean(record.coverage_start) !== Boolean(record.coverage_end) || record.coverage_start > record.coverage_end) {
    throw new Error('Enter both coverage dates, with the end on or after the start.');
  }
  return record;
}

function EntryForm({ operatorId, initialDate, onSaved }) {
  const client = usePortalClient();
  const [kind, setKind] = useState('maintenance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState(null);
  const saving = useRef(false);
  const active = useRef(false);
  const requests = useRef(new Map());
  const isDocument = documentKinds.includes(kind);
  const today = chicagoToday();

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    saving.current = true;
    setBusy(true);
    setProgress(null);
    setError('');
    setNotice('');
    let saved = false;
    try {
      const record = buildRecord(data);
      const file = data.get('original');
      const original = file?.name ? await prepareOriginal(file) : null;
      if (isDocument && !original) throw new Error('Attach the original file for this document.');
      if (original) Object.assign(record, { file_name: original.name, mime_type: original.mime });
      // Retain only an opaque retry key for the same entry, never file bytes or form contents.
      const fileIdentity = original?.digest ? 'multipart:' + original.digest : original?.base64 || '';
      const hash = await sha256(new TextEncoder().encode(JSON.stringify(record) + '\n' + fileIdentity));
      const key = 'rr-driver-record-pending:' + operatorId + ':' + hash;
      let requestId = requests.current.get(key);
      try { requestId ||= sessionStorage.getItem(key); } catch { /* Storage can be disabled on mobile. */ }
      requestId ||= crypto.randomUUID();
      requests.current.set(key, requestId);
      try { sessionStorage.setItem(key, requestId); } catch { /* The in-memory key also supports retries. */ }
      await saveDriverRecord(client, operatorId, requestId, record, original,
        (next) => { if (active.current) setProgress(next); }, () => active.current);
      requests.current.delete(key);
      try { sessionStorage.removeItem(key); } catch { /* Already saved. */ }
      saved = true;
      if (active.current) {
        form.reset();
        setKind('maintenance');
        setProgress(null);
        setNotice('Record saved.');
      }
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : 'Could not save the record.');
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
    if (saved && active.current) onSaved?.();
  }

  return (
    <details className={styles.panel}>
      <summary>Add a driver record</summary>
      <form className={styles.form} onSubmit={submit} aria-label="New driver record" onChange={() => { setNotice(''); setError(''); setProgress(null); }}>
        <fieldset disabled={busy}>
          <label>Record type
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(recordTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className={styles.pair}>
            <label>Record date<input type="date" name="record_date" defaultValue={initialDate || today} min="1900-01-01" max={today} required /></label>
            <label>Truck / unit <span>(optional)</span><input name="unit" maxLength={80} placeholder="Unit or plate" /></label>
          </div>
          <div className={styles.fields} key={kind}>
            {['expense', 'maintenance', 'fuel'].includes(kind) && <label>{kind === 'fuel' ? 'Fuel retailer' : 'Vendor'} <span>(optional)</span><input name="vendor" maxLength={160} /></label>}
            <label>{kind === 'maintenance' ? 'Service or repair description' : 'Description'}
              <input name="description" required maxLength={600} />
            </label>
            {kind === 'expense' && <label>Expense category
              <select name="expense_category" defaultValue="" required>
                <option value="" disabled>Choose category</option>
                {expenseCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>}
            {(kind === 'fuel' || kind === 'mileage') && <div className={styles.pair}>
              <label>State or province
                <select name="jurisdiction" defaultValue="" required>
                  <option value="" disabled>Choose jurisdiction</option>
                  {jurisdictions.map((code) => <option key={code}>{code}</option>)}
                </select>
              </label>
              <label>{kind === 'fuel' ? 'Fuel purchased (US gal)' : 'Distance (mi)'}
                <input name={kind === 'fuel' ? 'gallons' : 'miles'} type="number" inputMode="decimal" step="0.001" min="0.001" max="9999999" required />
              </label>
            </div>}
            {kind === 'mileage' && <label>Taxable miles <span>(if known)</span>
              <input name="taxable_miles" type="number" inputMode="decimal" step="0.001" min="0" max="9999999" />
            </label>}
            {kind === 'fuel' && <div className={styles.pair}>
              <label>Fuel type / use<select name="fuel_type" defaultValue="unknown">
                {Object.entries(fuelTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Fuel tax paid?<select name="fuel_tax_paid" defaultValue="unknown">
                <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select></label>
            </div>}
            {['expense', 'maintenance', 'fuel'].includes(kind) && <>
              <label>Amount (USD) {kind !== 'expense' && <span>(optional)</span>}
                <input name="amount" type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" required={kind === 'expense'} />
              </label>
              <p>Manual costs appear separately from Income and Pay. Enter each cost once. For fuel already booked, leave the dollar amount blank when adding mileage-tax details.</p>
            </>}
            {kind === 'maintenance' && <>
              <label>Odometer (mi) <span>(optional)</span>
                <input type="number" name="odometer" inputMode="numeric" min="0" max="99999999" step="1" />
              </label>
              <div className={styles.pair}>
                <label>Next service date <span>(optional)</span><input type="date" name="next_service_date" /></label>
                <label>Next service mileage <span>(optional)</span><input type="number" name="next_service_odometer" inputMode="numeric" min="0" max="99999999" step="1" /></label>
              </div>
            </>}
            {isDocument && <>
              {kind === 'logbook' && <p>Attach the original export from your ELD. RoadReady keeps a read-only copy for review.</p>}
              <div className={styles.pair}>
                <label>Coverage start <span>(optional)</span><input type="date" name="coverage_start" min="1900-01-01" max={today} /></label>
                <label>Coverage end <span>(optional)</span><input type="date" name="coverage_end" min="1900-01-01" max={today} /></label>
              </div>
            </>}
            <label>Original file {isDocument ? <span>(required)</span> : <span>(optional)</span>}
              <input type="file" name="original" required={isDocument} accept=".pdf,.jpg,.jpeg,.png,.csv,.txt" />
            </label>
            <p>PDF, JPG, PNG, CSV or TXT, up to 32 MiB.</p>
          </div>
          <button className={styles.submit} type="submit">{busy ? 'Saving…' : 'Save record'}</button>
        </fieldset>
        {progress && <div className={styles.uploadProgress}>
          <label>Original file upload
            <progress max={progress.total} value={progress.done} />
          </label>
          <p>{progress.done === progress.total && busy ? 'All parts received. Verifying original…' : `${progress.done} of ${progress.total} parts received.`}</p>
        </div>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && <p role="status" className={styles.success}>{notice}</p>}
      </form>
    </details>
  );
}

export default function DriverRecordForm(props) {
  return <EntryForm key={props.operatorId} {...props} />;
}
