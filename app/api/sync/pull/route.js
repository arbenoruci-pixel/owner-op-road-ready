import { createSupabaseAdminClient, jsonError, jsonOk, requireAuthenticatedUser, requireDriverForUser } from '../../../../lib/supabase/server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sinceFromUrl(request) {
  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  if (!since) return null;
  const date = new Date(since);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function selectChanges(admin, table, driverId, since, timestampColumn = 'created_at') {
  let query = admin.from(table).select('*').eq('driver_id', driverId).order(timestampColumn, { ascending: true });
  if (since) query = query.gt(timestampColumn, since);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.error) return jsonError(auth.error, auth.status, auth.detail);

  const admin = createSupabaseAdminClient();
  const driverResult = await requireDriverForUser(admin, auth.user.id, auth.user);
  if (driverResult.error) return jsonError(driverResult.error, driverResult.status, driverResult.detail);

  const since = sinceFromUrl(request);
  const driverId = driverResult.driver.id;

  try {
    const [logDays, dutyEvents, documents, documentLinks, inspections] = await Promise.all([
      selectChanges(admin, 'log_days', driverId, since, 'updated_at'),
      selectChanges(admin, 'duty_events', driverId, since, 'created_at'),
      selectChanges(admin, 'documents', driverId, since, 'created_at'),
      selectChanges(admin, 'document_links', driverId, since, 'created_at'),
      selectChanges(admin, 'inspections', driverId, since, 'updated_at')
    ]);

    return jsonOk({
      pulled_at: new Date().toISOString(),
      driver: driverResult.driver,
      changes: {
        log_days: logDays,
        duty_events: dutyEvents,
        documents,
        document_links: documentLinks,
        inspections
      }
    });
  } catch (error) {
    return jsonError('pull_failed', 500, error.message);
  }
}
