import { maintenanceRecordInput } from './step3Actions.js';
import { allRows } from './portalData.js';

export async function saveMaintenanceReceipt(client, operatorId, requestId, form, file, details, options = {}) {
  const input = await maintenanceRecordInput(form, file, details.totalCents ?? null);
  const { data, error } = await client.rpc('rr_lease_save_maintenance_receipt', {
    p_operator_id: operatorId,
    p_request_id: requestId,
    ...input,
    p_receipt: details,
    p_allow_possible_duplicate: options.allowPossibleDuplicate === true,
  });
  if (error || !data?.recordId) {
    throw new Error(error?.message || 'Could not confirm the save. Keep the receipt open and try again.');
  }
  return data;
}

const validCents = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000;

function printedDate(date, recordedDate) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > recordedDate) return null;
  const day = new Date(date + 'T00:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10) === date ? date : null;
}

export async function saveScannedReceipt(client, operatorId, requestId, file, receipt, totalCents, totalSource, recordedDate, options = {}) {
  if (!file || !validCents(totalCents) || !['reader','driver'].includes(totalSource)) {
    throw new Error('Choose the original and enter a valid invoice total.');
  }
  if (receipt?.multipleInvoices || receipt?.documentKind === 'bill_of_lading' || receipt?.foreignCurrency) {
    throw new Error('Choose one maintenance receipt showing a USD total.');
  }
  if (!printedDate(recordedDate, recordedDate)) throw new Error('The record date is unavailable.');
  const conflicts = new Set(receipt?.conflictFields);
  const field = key => conflicts.has(key) ? null : receipt?.[key];
  const text = (key,max) => {
    const value = String(field(key) ?? '').replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
    return value && value.length <= max ? value : null;
  };
  const date = printedDate(field('date'), recordedDate);
  const itemDescriptions = (field('lines') || []).map(line => line.description?.trim()).filter(Boolean);
  const form = new FormData();
  form.set('category','service');
  form.set('date',date || recordedDate);
  form.set('description',text('description',600) || [...new Set(itemDescriptions)].join(', ').slice(0,600) || 'Maintenance receipt');
  form.set('vendor',text('vendor',160) || '');
  form.set('unit',text('unit',80) || '');
  const odometer = field('odometer');
  if (Number.isSafeInteger(odometer) && odometer >= 0 && odometer <= 99_999_999) form.set('odometer',String(odometer));

  const details = {
    mode:'total_only',
    assetType:['truck','trailer'].includes(field('assetType')) ? field('assetType') : 'unknown',
    invoiceNumber:text('invoiceNumber',160),
    payer:'unknown', lines:[], totalCents, totalSource,
    totalConfirmed:totalSource === 'driver', dateSource:date ? 'printed' : 'recorded',
  };
  return saveMaintenanceReceipt(client,operatorId,requestId,form,file,details,options);
}

export async function correctScannedReceiptTotal(client, operatorId, recordId, expectedCents, newCents) {
  const {data,error} = await client.rpc('rr_lease_correct_scanned_maintenance_total',{
    p_operator_id:operatorId, p_record_id:recordId, p_expected_cents:expectedCents, p_new_cents:newCents,
  });
  if (error || !data?.recordId) throw new Error(error?.message || 'Could not confirm the corrected total. Try again.');
  return data;
}

export async function listMaintenanceReceipts(client, operatorId) {
  const rows = await allRows(() => client.rpc('rr_lease_maintenance_receipt_history', { p_operator_id: operatorId }));
  // A newly saved receipt can shift the boundary between two history pages.
  return Array.from(new Map(rows.map(record => [record.id, record])).values());
}
