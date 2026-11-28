import {chicagoDay, csv, fetchRecordOriginal, planQuarterParts} from './quarterExport.js';
import {ChunkedZip, inspectBlob, sha256} from '../../scripts/v110431/chunkedZip.js';

export async function fetchMaintenanceOriginal(client, record, signal) {
  signal?.throwIfAborted();
  if (record.byte_size > 3 * 1024 * 1024) return fetchRecordOriginal(client, record, signal);
  if (!record.file_name || !Number.isSafeInteger(record.byte_size) || record.byte_size <= 0) {
    throw new Error('Original receipt metadata is incomplete.');
  }
  let query = client.rpc('rr_lease_step3_maintenance_original', {p_record_id:record.id});
  if (signal) query = query.abortSignal(signal);
  const {data, error} = await query;
  signal?.throwIfAborted();
  if (error || typeof data !== 'string') throw new Error(error?.message || 'Original receipt unavailable.');
  const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
  if (bytes.length !== record.byte_size || await sha256(bytes) !== record.sha256) {
    throw new Error('The receipt differs from its saved original.');
  }
  return new Blob([bytes], {type:record.mime_type || 'application/octet-stream'});
}

const columns = ['Service date','Recorded date','Date source','Vendor','Description','Invoice number','Total USD',
  'Total source','Subtotal USD','Tax USD','Amount paid USD','Balance due USD','Payment source','Type','Asset','Unit',
  'Odometer miles','Next service date','Next service miles','Items','Original filename','ZIP part','Original path','Record ID'];

function dollars(cents) {
  if (cents == null) return '';
  const value = BigInt(cents);
  return (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2,'0');
}

function reportRow(record, file) {
  const details = record.receipt || {};
  const fallbackDate = details.dateSource === 'recorded';
  const entered = record.created_at ? new Date(record.created_at) : null;
  return {
    'Service date':fallbackDate ? '' : record.record_date,
    'Recorded date':entered && Number.isFinite(entered.valueOf()) ? chicagoDay(entered) : fallbackDate ? record.record_date : '',
    'Date source':details.dateSource || 'Service record',
    Vendor:record.vendor, Description:record.description, 'Invoice number':details.invoiceNumber,
    'Total USD':dollars(record.amount_cents),'Total source':{reader:'Read from receipt',driver:'Confirmed by driver'}[details.totalSource],
    'Subtotal USD':dollars(details.subtotalCents),'Tax USD':dollars(details.taxCents),
    'Amount paid USD':dollars(details.paidCents),'Balance due USD':dollars(details.balanceDueCents),
    'Payment source':details.payer,Type:record.expense_category,Asset:details.assetType,Unit:record.unit,
    'Odometer miles':record.odometer,'Next service date':record.next_service_date,'Next service miles':record.next_service_odometer,
    Items:details.lines?.length ? JSON.stringify(details.lines) : '',
    'Original filename':record.file_name, 'ZIP part':file?.part, 'Original path':file?.path, 'Record ID':record.id,
  };
}

export async function prepareMaintenanceArchive(records, signal) {
  signal.throwIfAborted();
  const plan = planQuarterParts(records, {documents:[],proofs:[]});
  if (plan.separate.length) throw new Error('An attached original exceeds the supported archive size.');
  const files = new Map(plan.manifest.map(file => [file.id, file]));
  const contents = '\uFEFF' + csv(columns, records.map(row => reportRow(row,files.get(row.id))));
  const snapshot = await sha256(new TextEncoder().encode(contents));
  signal.throwIfAborted();
  return {parts:plan.parts, contents, name:'RoadReady-Maintenance-'+chicagoDay()+'-'+snapshot.slice(0,8)};
}

export async function buildMaintenanceArchivePart(client, plan, number, signal, onProgress) {
  const part = plan.parts[number - 1];
  const zip = new ChunkedZip();
  await zip.text('maintenance.csv',plan.contents,{signal});
  for (const [index, item] of part.files.entries()) {
    signal.throwIfAborted();
    onProgress(index + 1, part.files.length);
    let original;
    try {
      original = await fetchMaintenanceOriginal(client,item.row,signal);
    } catch (error) {
      signal.throwIfAborted();
      throw new Error('Could not include '+item.row.file_name+'. '+(error.message || 'Try again.'));
    }
    zip.add(item.path, original, await inspectBlob(original,{signal}));
  }
  signal.throwIfAborted();
  const suffix = plan.parts.length > 1 ? '-part-'+number+'-of-'+plan.parts.length : '';
  return zip.file(plan.name+suffix+'.zip');
}
