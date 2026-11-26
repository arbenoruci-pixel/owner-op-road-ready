import { sendPilotCode } from '../_shared/operator-outlook.js';

const portalOrigin = 'https://owner-op-road-ready.vercel.app';
const project = 'https://ghwkcgczuwctzxsxmqzx.supabase.co';

const headers = {
  'Access-Control-Allow-Origin': portalOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

async function sendForInvitedMailbox(email, challenge, { getEnv, request }) {
  const service = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anon = getEnv('SUPABASE_ANON_KEY');
  if (!service || !anon || getEnv('SUPABASE_URL')?.replace(/\/$/, '') !== project)
    throw new Error('configuration');
  const serviceHeaders = {
    apikey: service,
    Authorization: 'Bearer ' + service,
    'Content-Type': 'application/json',
  };
  const reserved = await request(project + '/rest/v1/rpc/rr_lease_reserve_login_request', {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({ p_email: email }),
  });
  if (!reserved.ok) throw new Error('membership');
  if ((await reserved.json()) !== true) return;

  // Create only an invited, unconfirmed identity. Access still requires verifying the email.
  const user = await request(project + '/auth/v1/admin/users', {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({ email, email_confirm: false }),
  });
  if (!user.ok) {
    const reason = await user.json().catch(() => ({}));
    const duplicate =
      [409, 422].includes(user.status) &&
      [reason.error_code, reason.code].some(
        (code) => code === 'email_exists' || code === 'user_already_exists'
      );
    if (!duplicate) throw new Error('provisioning');
  }
  if (await sendPilotCode(email, { getEnv, request })) return;

  const endpoint = new URL(project + '/auth/v1/otp');
  endpoint.searchParams.set('redirect_to', portalOrigin + '/operator');
  const otp = await request(endpoint, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: false,
      code_challenge: challenge,
      code_challenge_method: 's256',
    }),
  });
  if (!otp.ok && otp.status !== 429) throw new Error('delivery');
}

export function makeLoginHandler({ getEnv, request, waitUntil, logFailure }) {
  return async (incoming) => {
    if (incoming.headers.get('origin') !== portalOrigin) return new Response(null, { status: 403 });
    if (incoming.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (incoming.method !== 'POST') return new Response(null, { status: 405, headers });
    if (
      Number(incoming.headers.get('content-length')) > 2048 ||
      !incoming.headers.get('content-type')?.startsWith('application/json')
    ) {
      return new Response(null, { status: 400, headers });
    }
    // Keep allocation bounded even if Content-Length is missing or misleading.
    const reader = incoming.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    const decoder = new TextDecoder();
    let size = 0,
      raw = '';
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          return new Response(null, { status: 400, headers });
        }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
      const payload = JSON.parse(raw);
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof payload.code_challenge !== 'string' ||
        !/^[a-zA-Z0-9_-]{43}$/.test(payload.code_challenge)
      ) {
        return new Response(null, { status: 400, headers });
      }
      // Same response and latency regardless of invitation, delivery, or throttling.
      waitUntil(
        sendForInvitedMailbox(email, payload.code_challenge, { getEnv, request }).catch((e) =>
          logFailure(
            [
              'configuration',
              'membership',
              'provisioning',
              'delivery',
              'sender_store',
              'microsoft_token',
              'mail_scope',
              'code_generation',
              'mail_delivery',
            ].includes(e?.message)
              ? e.message
              : 'network'
          )
        )
      );
      return new Response('{}', { status: 202, headers });
    } catch {
      return new Response(null, { status: 400, headers });
    } finally {
      reader.releaseLock();
    }
  };
}
