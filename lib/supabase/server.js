import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createSupabaseAnonClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export function createSupabaseAdminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export function extractBearerToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function requireAuthenticatedUser(request) {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: 'missing_bearer_token', status: 401 };
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: 'invalid_bearer_token', status: 401, detail: error?.message };
  }

  return { user: data.user, token };
}

function userFullName(user = {}) {
  const meta = user.user_metadata || user.raw_user_meta_data || {};
  const email = user.email || '';
  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    email.split('@')[0] ||
    'Driver'
  );
}

async function ensureProfileForUser(admin, user) {
  const email = user?.email || null;
  const fullName = userFullName(user);

  const { error } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: fullName,
      email,
      role: 'driver'
    }, { onConflict: 'id' });

  if (error) throw error;
}

async function createDriverForUser(admin, user) {
  await ensureProfileForUser(admin, user);

  const { data, error } = await admin
    .from('drivers')
    .insert({
      user_id: user.id,
      full_name: userFullName(user),
      timezone: user.user_metadata?.timezone || 'America/Chicago',
      hos_cycle: user.user_metadata?.hos_cycle || '70_8',
      hos_property_carrying: true,
      exempt_eld: true,
      active: true
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: selectError } = await admin
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle();
      if (selectError) throw selectError;
      if (existing) return existing;
    }
    throw error;
  }

  return data;
}

export async function requireDriverForUser(admin, userId, user = null) {
  const { data, error } = await admin
    .from('drivers')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    return { error: 'driver_profile_lookup_failed', status: 500, detail: error.message };
  }

  if (data) return { driver: data };

  if (!user) {
    return { error: 'driver_profile_not_found', status: 403 };
  }

  try {
    const driver = await createDriverForUser(admin, user);
    return { driver, created: true };
  } catch (createError) {
    return { error: 'driver_profile_create_failed', status: 500, detail: createError.message };
  }
}

export function jsonError(error, status = 400, detail = undefined) {
  return Response.json({ ok: false, error, detail }, { status });
}

export function jsonOk(payload = {}) {
  return Response.json({ ok: true, ...payload });
}
