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

export function listMaintenanceReceipts(client, operatorId) {
  return allRows(() => client.rpc('rr_lease_maintenance_receipt_history', { p_operator_id: operatorId }));
}
