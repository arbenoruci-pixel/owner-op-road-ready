import {
  authorize,
  callback,
  clientId,
  exchange,
  mailbox,
  rpc,
  scopes,
} from '../_shared/operator-outlook.js';

const deps = { getEnv: (key: string) => Deno.env.get(key), request: fetch };
const cookie = '__Secure-rr_sender_setup';
const cookieFlags = '; Path=/functions/v1/rr-outlook-sender; HttpOnly; Secure; SameSite=Lax';
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function sign(value: string) {
  const secret = Deno.env.get('RR_OPERATOR_MAIL_CLIENT_SECRET');
  if (!secret) throw Error('configuration');
  const k = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64(
    new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode('rr-sender-state-v1:' + value)))
  );
}
function message(text: string, status: number) {
  return new Response(text + '\n', {
    status,
    headers: {
      ...headers,
      'Content-Type': 'text/plain; charset=utf-8',
      'Set-Cookie': cookie + '=; Max-Age=0' + cookieFlags,
    },
  });
}
Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  if (req.method !== 'GET') return message('Method not allowed.', 405);
  try {
    if (u.pathname.endsWith('/connect')) {
      const config = await rpc('rr_operator_mail_config', {}, deps);
      if (!config?.sender) return message('Sender setup is unavailable.', 503);
      const state = random(),
        verifier = random(),
        expiry = Date.now() + 600_000;
      const payload = [expiry, state, verifier].join('.');
      const dest = new URL(authorize);
      dest.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        response_mode: 'query',
        redirect_uri: callback,
        scope: scopes,
        state,
        prompt: 'select_account',
        code_challenge: b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))),
        code_challenge_method: 'S256',
      }).toString();
      return new Response(null, {
        status: 302,
        headers: {
          ...headers,
          Location: dest.href,
          'Set-Cookie': cookie + '=' + payload + '.' + (await sign(payload)) + '; Max-Age=600' + cookieFlags,
        },
      });
    }
    if (!u.pathname.endsWith('/callback')) return message('Page not found.', 404);
    if (u.searchParams.has('error'))
      return message(
        'Microsoft did not finish the connection. Reopen the RoadReady sender setup to try again.',
        400
      );
    const raw =
      (req.headers.get('cookie') || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookie + '='))
        ?.slice(cookie.length + 1) || '';
    const [expiry, state, verifier, signature] = raw.split('.');
    const code = u.searchParams.get('code');
    if (
      !/^\d{13}$/.test(expiry) ||
      Number(expiry) < Date.now() ||
      Number(expiry) > Date.now() + 600_000 ||
      !/^[\w-]{43}$/.test(state) ||
      !/^[\w-]{43}$/.test(verifier) ||
      !code ||
      state !== u.searchParams.get('state') ||
      (await sign([expiry, state, verifier].join('.'))) !== signature
    )
      return message('This setup session expired. Reopen RoadReady sender setup.', 400);
    const config = await rpc('rr_operator_mail_config', {}, deps);
    const token = await exchange(
      { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: callback },
      deps
    );
    if (!token.refresh_token)
      return message('Microsoft did not grant ongoing access. Reopen sender setup.', 403);
    const user = await mailbox(token.access_token, fetch);
    if (
      !user.id ||
      ![user.mail, user.userPrincipalName].some(
        (x) => typeof x === 'string' && x.toLowerCase() === config.sender
      )
    )
      return message('Please reopen setup with the approved RoadReady sender mailbox.', 403);
    const saved = await rpc(
      'rr_operator_mail_save',
      {
        p_sender: config.sender,
        p_subject: user.id,
        p_refresh: token.refresh_token,
        p_revision: config.revision,
      },
      deps
    );
    return saved
      ? message('RoadReady sender connected. You can close this page and request a driver test code.', 200)
      : message('Setup changed. Reopen the RoadReady sender setup.', 409);
  } catch (e) {
    // Emit only fixed-stage labels. OAuth and provider responses may contain credentials.
    const stage = e instanceof Error ? e.message : '';
    console.error(
      'RoadReady sender:',
      ['configuration', 'sender_store', 'microsoft_token', 'mail_scope', 'mail_identity'].includes(stage)
        ? stage
        : 'network'
    );
    return message(
      'RoadReady could not finish the Microsoft connection. Reopen sender setup and try again.',
      502
    );
  }
});
