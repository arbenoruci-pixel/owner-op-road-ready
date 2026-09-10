// A registered SPA client uses delegated Mail.Send. Passwords are never collected.
const authority = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const scopes = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';
const sessionKey = 'road-ready-outlook-connection-v110320';
const clean = value => String(value || '').trim();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function outlookOwnerKey() {
  for (const name of ['owner-op-prototype-auth-v1', 'owner-op-road-ready-supabase-auth']) {
    try { const saved = JSON.parse(localStorage.getItem(name) || 'null'); const id = saved?.user?.id || saved?.currentSession?.user?.id; if (id) return id; } catch { /* next known auth store */ }
  }
  return '';
}
function stored() { try { const data = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); return data?.ownerId && data.ownerId === outlookOwnerKey() ? data : null; } catch { return null; } }
export function connectedOutlook() { const data = stored(); return data?.account || null; }
export function disconnectOutlook() { sessionStorage.removeItem(sessionKey); }
export async function outlookConfiguration() {
  const response = await fetch('/api/billing/outlook-config', { cache: 'no-store' });
  if (!response.ok) throw Error('Could not check the Outlook connection. Try again.');
  const data = await response.json();
  if (!data.clientId) return { ready: false };
  return { ready: true, clientId: data.clientId, redirectUri: new URL('/outlook-connect.html', location.origin).href };
}
export async function connectOutlook(config, loginHint = '') {
  if (!config?.ready) throw Error('Outlook sending needs its one-time app connection setup.');
  const ownerId = outlookOwnerKey();
  if (!ownerId) throw Error('Sign in to Road Ready before connecting Outlook.');
  const popup = window.open('about:blank', 'road-ready-outlook', 'width=520,height=720');
  if (!popup) throw Error('Allow the Outlook sign-in window, then choose Connect Outlook again.');
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri, response_mode: 'query', scope: scopes, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
  if (clean(loginHint)) query.set('login_hint', clean(loginHint));
  try {
    const code = await new Promise((resolve, reject) => {
      let timer;
      const finish = (error, value) => { window.removeEventListener('message', listener); clearInterval(timer); error ? reject(error) : resolve(value); };
      const started = Date.now();
      const listener = event => {
        if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'road-ready-outlook-code' || event.data.state !== state) return;
        if (event.data.error) return finish(Error('Outlook connection was not approved. You can try connecting again.'));
        if (typeof event.data.code === 'string' && event.data.code.length) finish(null, event.data.code);
      };
      window.addEventListener('message', listener);
      timer = setInterval(() => { if (popup.closed || Date.now() - started > 300_000) finish(Error('Outlook connection was cancelled or timed out.')); }, 500);
      popup.location.href = `${authority}/authorize?${query}`;
    });
    const response = await fetch(`${authority}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier, scope: scopes }) });
    if (!response.ok) throw Error('Outlook could not finish connecting. Check the app connection setup and try again.');
    const token = await response.json();
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName,id', { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!me.ok) throw Error('Outlook connected but the sending account could not be verified.');
    const user = await me.json();
    const account = { id: user.id, email: user.mail || user.userPrincipalName, name: user.displayName };
    if (!account.email || !token.access_token) throw Error('Outlook did not return a sending account.');
    sessionStorage.setItem(sessionKey, JSON.stringify({ ownerId, clientId: config.clientId, account, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 }));
    return account;
  } finally { popup.close(); }
}
export async function outlookAccessToken() {
  const data = stored();
  if (!data?.account || !data.accessToken) throw Error('Connect Outlook before sending.');
  if (data.expiresAt > Date.now() + 60_000) return data.accessToken;
  if (!data.refreshToken) { disconnectOutlook(); throw Error('Reconnect Outlook before sending.'); }
  const response = await fetch(`${authority}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: data.clientId, grant_type: 'refresh_token', refresh_token: data.refreshToken, scope: scopes }) });
  if (!response.ok) { disconnectOutlook(); throw Error('Your Outlook connection expired. Choose Connect Outlook again.'); }
  const token = await response.json();
  Object.assign(data, { accessToken: token.access_token, refreshToken: token.refresh_token || data.refreshToken, expiresAt: Date.now() + token.expires_in * 1000 });
  sessionStorage.setItem(sessionKey, JSON.stringify(data));
  return data.accessToken;
}
