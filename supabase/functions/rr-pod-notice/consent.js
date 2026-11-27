import { authorize, clientId, exchange, mailbox, scopes } from '../_shared/operator-outlook.js';
import { narta } from './mail.js';

const cookieName = '__Secure-rr_pod_staging';
const cookieOptions = '; Path=/functions/v1/rr-pod-notice; HttpOnly; Secure; SameSite=Lax';
const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff',
};
const encode = value => new TextEncoder().encode(value);
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

function done(message, status) {
  return new Response(message, {status, headers: {...headers, 'Set-Cookie': cookieName + '=; Max-Age=0' + cookieOptions}});
}

// Only these documented Entra error numbers may appear in staging diagnostics.
const knownTokenErrors = [50011, 54005, 65001, 70000, 700016, 7000215, 7000218, 7000222, 9002325, 9002326];

async function callbackStep(stage, operation, request) {
  let httpStatus;
  let aadsts;
  const observeRequest = async (url, init) => {
    const response = await request(url, init);
    httpStatus = response.status;
    if (stage === 'token_exchange' && !response.ok) {
      const payload = await response.clone().json().catch(() => null);
      if (Array.isArray(payload?.error_codes)) {
        aadsts = knownTokenErrors.filter(code => payload.error_codes.includes(code));
      }
    }
    return response;
  };
  try {
    return await operation(observeRequest);
  } catch (error) {
    // PostgREST calls expose only the numeric HTTP status through their cause.
    if (stage === 'sender_config' || stage === 'grant_save') httpStatus = error?.cause;
    const event = {stage};
    if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) event.http_status = httpStatus;
    if (aadsts?.length) event.aadsts = aadsts;
    console.warn('rr_pod_staging_consent', JSON.stringify(event));
    throw Error('Staging sender setup unavailable');
  }
}

// Invoked by the stage-ref-checked entry point. Microsoft consent is dedicated to the staging Vault.
export async function stagingConsent(req, {base, call, getEnv, request}) {
  const url = new URL(req.url);
  const callback = base + '/functions/v1/rr-pod-notice/callback';
  const secret = getEnv('RR_OPERATOR_MAIL_CLIENT_SECRET');
  if (!secret) return done('Staging sender configuration is incomplete.', 503);
  const key = await crypto.subtle.importKey('raw', encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const sign = async payload => base64url(await crypto.subtle.sign('HMAC', key, encode(callback + ':' + payload)));
  const readConfig = () => call('rr_operator_mail_config', {});
  const config = url.pathname.endsWith('/callback') ? await callbackStep('sender_config', readConfig) : await readConfig();
  if (config?.sender !== narta || !config.revision) return done('The staging Hotmail sender is not configured.', 503);
  if (url.pathname.endsWith('/connect')) {
    const state = random(), verifier = random();
    const payload = [Date.now() + 600_000, state, verifier].join('.');
    const auth = new URL(authorize);
    auth.search = new URLSearchParams({
      client_id:clientId, response_type:'code', response_mode:'query', redirect_uri:callback,
      scope:scopes, state, prompt:'select_account', code_challenge_method:'S256',
      code_challenge:base64url(await crypto.subtle.digest('SHA-256', encode(verifier))),
    }).toString();
    return new Response(null, {status:302, headers:{...headers, Location:auth.href,
      'Set-Cookie':cookieName + '=' + payload + '.' + await sign(payload) + '; Max-Age=600' + cookieOptions}});
  }
  const cookie = (req.headers.get('cookie') || '').split(';').map(x=>x.trim())
    .find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1) || '';
  const parts = /^(\d{13})\.([\w-]{43})\.([\w-]{43})\.([\w-]{43})$/.exec(cookie);
  const code = url.searchParams.get('code');
  if (!parts || !code || url.searchParams.has('error')) return done('Reopen the staging sender setup and sign in to Hotmail.', 400);
  const [, expiry, state, verifier, signature] = parts;
  const remaining = Number(expiry) - Date.now();
  if (remaining <= 0 || remaining > 600_000 || state !== url.searchParams.get('state') ||
      signature !== await sign([expiry,state,verifier].join('.'))) return done('The staging setup session expired.', 400);
  const token = await callbackStep('token_exchange', observedRequest =>
    exchange({grant_type:'authorization_code', code, code_verifier:verifier, redirect_uri:callback}, {getEnv, request:observedRequest}), request);
  if (!token.refresh_token) return done('Microsoft did not grant ongoing Hotmail access.', 403);
  const me = await callbackStep('graph_identity', observedRequest => mailbox(token.access_token, observedRequest), request);
  if (!me.id || ![me.mail,me.userPrincipalName].some(addr=>addr?.toLowerCase() === narta)) {
    return done('Choose the Narta Express Hotmail account to authorize staging.', 403);
  }
  const saved = await callbackStep('grant_save', () => call('rr_operator_mail_save', {
    p_sender:narta, p_subject:me.id, p_refresh:token.refresh_token, p_revision:config.revision
  }));
  return saved ? done('Narta Express Hotmail is connected for RoadReady staging POD notifications.', 200) :
    done('Staging sender configuration changed. Reopen setup to try again.', 409);
}

