import {deliverPodNotice, senderToken} from './mail.js';
import {stagingConsent} from './consent.js';
import {project as productionProject} from '../_shared/operator-outlook.js';

const getEnv = (name: string) => Deno.env.get(name);
const request = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {...init, redirect: 'error', signal: AbortSignal.timeout(10000)});

// This function is deployed only to a separately authorized staging project.
// The service role is used only against that project's own PostgREST origin.
Deno.serve(async req => {
  const ref = getEnv('RR_POD_STAGING_PROJECT_REF') || '';
  const base = (getEnv('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const carrierId = getEnv('RR_POD_STAGING_CARRIER_ID');
  const portalUrl = getEnv('RR_POD_STAGING_PORTAL_URL');
  if (!/^[a-z0-9]{20}$/.test(ref) || base !== 'https://' + ref + '.supabase.co' || base === productionProject ||
      !key || !carrierId || !portalUrl) return new Response(null, {status: 503});

  async function call(name: string, args: object) {
    const response = await request(base + '/rest/v1/rpc/' + name, {
      method: 'POST', redirect: 'error', headers: {apikey: key!, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify(args),
    });
    if (!response.ok) throw Error('Staging job store unavailable');
    return response.json();
  }
  try {
    if (req.method === 'GET' && /\/(connect|callback)$/.test(new URL(req.url).pathname)) {
      return await stagingConsent(req, {base, call, getEnv, request});
    }
    if (req.method !== 'POST') return new Response(null, {status: 405});
    const size = Number(req.headers.get('content-length'));
    if (!(size > 0 && size <= 160)) return new Response(null, {status: 400});
    const data = await req.json().catch(() => null);
    if (!data || typeof data.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(data.ticket)) return new Response(null, {status: 400});
    if (!await call('rr_pod_mail_consume_wake', {p_ticket: data.ticket, p_project_ref: ref})) {
      return new Response(null, {status: 403});
    }
    let token: Promise<string> | undefined;
    const getToken = () => token ??= senderToken(call, {getEnv, request});
    for (let i = 0; i < 5; i++) {
      const job = await call('rr_pod_mail_claim', {});
      if (!job) break;
      await deliverPodNotice(job, {call, getToken, request, carrierId, portalUrl});
    }
    return new Response(null, {status: 204});
  } catch {
    // Lease recovery owns any work whose RPC result could not be recorded.
    return new Response(null, {status: 503});
  }
});
