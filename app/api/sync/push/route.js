import { createSupabaseAdminClient, jsonError, jsonOk, requireAuthenticatedUser, requireDriverForUser } from '../../../../lib/supabase/server.js';
import { processDutyEventMutation } from '../../../../lib/supabase/dutyEvents.js';
import { processInspectionMutation } from '../../../../lib/supabase/inspections.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeMutation(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid mutation payload');
  const clientMutationId = raw.client_mutation_id || raw.clientMutationId;
  if (!clientMutationId) throw new Error('client_mutation_id is required');
  const entity = raw.entity;
  const operation = raw.operation;
  const payload = raw.payload || {};
  if (!entity || !operation) throw new Error('entity and operation are required');
  return {
    client_mutation_id: clientMutationId,
    entity,
    operation,
    entity_client_id: raw.entity_client_id || raw.entityClientId || payload.client_event_id || payload.clientEventId || payload.client_document_id || payload.clientDocumentId || null,
    payload
  };
}

async function loadExistingMutation(admin, clientMutationId) {
  const { data, error } = await admin
    .from('sync_mutations')
    .select('*')
    .eq('client_mutation_id', clientMutationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createMutationReceipt(admin, user, driver, mutation) {
  const { data, error } = await admin
    .from('sync_mutations')
    .insert({
      client_mutation_id: mutation.client_mutation_id,
      user_id: user.id,
      driver_id: driver.id,
      entity: mutation.entity,
      operation: mutation.operation,
      entity_client_id: mutation.entity_client_id,
      payload: mutation.payload,
      status: 'pending'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function markMutation(admin, id, status, errorMessage = null) {
  const { error } = await admin
    .from('sync_mutations')
    .update({
      status,
      processed_at: status === 'processed' || status === 'duplicate' ? new Date().toISOString() : null,
      error_message: errorMessage
    })
    .eq('id', id);

  if (error) throw error;
}

async function processMutation({ admin, user, driver, mutation }) {
  if (mutation.entity === 'duty_event') {
    return processDutyEventMutation({
      admin,
      user,
      driver,
      operation: mutation.operation,
      payload: mutation.payload
    });
  }

  if (mutation.entity === 'inspection') {
    return processInspectionMutation({
      admin,
      user,
      driver,
      operation: mutation.operation,
      payload: mutation.payload
    });
  }

  throw new Error(`Unsupported sync entity: ${mutation.entity}`);
}

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.error) return jsonError(auth.error, auth.status, auth.detail);

  const admin = createSupabaseAdminClient();
  const driverResult = await requireDriverForUser(admin, auth.user.id, auth.user);
  if (driverResult.error) return jsonError(driverResult.error, driverResult.status, driverResult.detail);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  const rawMutations = Array.isArray(body?.mutations) ? body.mutations : [];
  if (!rawMutations.length) return jsonOk({ results: [] });
  if (rawMutations.length > 50) return jsonError('batch_too_large', 413, 'Maximum 50 mutations per push request.');

  const results = [];

  for (const raw of rawMutations) {
    let mutation;
    let receipt = null;
    try {
      mutation = normalizeMutation(raw);
      const existing = await loadExistingMutation(admin, mutation.client_mutation_id);

      if (existing?.status === 'processed' || existing?.status === 'duplicate') {
        results.push({
          client_mutation_id: mutation.client_mutation_id,
          status: 'duplicate',
          server_mutation_id: existing.id
        });
        continue;
      }

      receipt = existing || await createMutationReceipt(admin, auth.user, driverResult.driver, mutation);
      const result = await processMutation({
        admin,
        user: auth.user,
        driver: driverResult.driver,
        mutation
      });

      await markMutation(admin, receipt.id, result.duplicate ? 'duplicate' : 'processed');
      results.push({
        client_mutation_id: mutation.client_mutation_id,
        status: result.duplicate ? 'duplicate' : 'processed',
        server_mutation_id: receipt.id,
        result
      });
    } catch (error) {
      if (receipt?.id) {
        try {
          await markMutation(admin, receipt.id, 'failed', error.message);
        } catch {}
      }
      results.push({
        client_mutation_id: mutation?.client_mutation_id || raw?.client_mutation_id || raw?.clientMutationId || null,
        status: 'failed',
        error: error.message
      });
    }
  }

  return jsonOk({ results });
}
