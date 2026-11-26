const clientId = 'f1aab600-4f70-425f-a3e4-c9e9b18bdc06';
const microsoft = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/';
const graph = 'https://graph.microsoft.com/v1.0/';
const scopes = 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send';
export const portal = 'https://owner-op-road-ready.vercel.app';
export const project = 'https://ghwkcgczuwctzxsxmqzx.supabase.co';
export const callback = project + '/functions/v1/rr-outlook-sender/callback';
export const authorize = microsoft + 'authorize';
export { clientId, scopes };

export async function rpc(name, body, { getEnv, request }) {
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || getEnv('SUPABASE_URL')?.replace(/\/$/, '') !== project) throw Error('configuration');
  const response = await request(project + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error('sender_store');
  return await response.json();
}

export async function exchange(fields, { getEnv, request }) {
  const secret = getEnv('RR_OPERATOR_MAIL_CLIENT_SECRET');
  if (!secret) throw Error('configuration');
  const response = await request(microsoft + 'token', {
    method: 'POST',
    body: new URLSearchParams({ ...fields, client_id: clientId, client_secret: secret, scope: scopes }),
  });
  if (!response.ok) throw Error('microsoft_token');
  const token = await response.json();
  if (!token.access_token || !token.scope?.toLowerCase().split(' ').includes('mail.send'))
    throw Error('mail_scope');
  return token;
}

export async function mailbox(access, request) {
  const r = await request(graph + 'me?$select=id,mail,userPrincipalName', {
    headers: { Authorization: 'Bearer ' + access },
  });
  if (!r.ok) throw Error('mail_identity');
  return r.json();
}

// Called only after the existing membership, rate limit and provisioning checks.
export async function sendPilotCode(email, deps) {
  if (!deps.getEnv('RR_OPERATOR_MAIL_CLIENT_SECRET')) return false;
  const grant = await rpc('rr_operator_mail_token', { p_email: email }, deps);
  if (!grant) return false;
  const token = await exchange({ grant_type: 'refresh_token', refresh_token: grant.refresh }, deps);
  if (token.refresh_token && token.refresh_token !== grant.refresh) {
    // A concurrent refresh may have saved a newer grant. Either access token is valid for this request.
    await rpc(
      'rr_operator_mail_save',
      {
        p_sender: grant.sender,
        p_subject: grant.subject,
        p_refresh: token.refresh_token,
        p_revision: grant.revision,
      },
      deps
    );
  }
  const key = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const link = await deps.request(
    project + '/auth/v1/admin/generate_link?redirect_to=' + encodeURIComponent(portal + '/operator'),
    {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email }),
    }
  );
  if (!link.ok) throw Error('code_generation');
  const issued = await link.json();
  if (
    issued.email?.toLowerCase() !== email ||
    !/^\d{6,10}$/.test(issued.email_otp) ||
    !/^[a-zA-Z0-9_-]{32,256}$/.test(issued.hashed_token)
  )
    throw Error('code_generation');
  const confirm = portal + '/operator/confirm';
  const body =
    'Your RoadReady sign-in code is ' +
    issued.email_otp +
    '.\n\nEnter the code at ' +
    confirm +
    ' using this email address, or open My Loads here:\n' +
    confirm +
    '#token_hash=' +
    issued.hashed_token +
    '\n\nUse the latest code once. If you did not request it, you can ignore this email.';
  const sent = await deps.request(graph + 'me/sendMail', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: 'Your RoadReady sign-in code',
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: email } }],
      },
      saveToSentItems: false,
    }),
  });
  if (sent.status !== 202) throw Error('mail_delivery');
  return true;
}
