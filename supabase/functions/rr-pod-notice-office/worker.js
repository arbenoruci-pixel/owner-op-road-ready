import {exchange, mailbox, portal, project, rpc} from '../_shared/operator-outlook.js';

const office = 'nartaexpress@hotmail.com';
const carrierId = 'adfe5868-3256-4fc4-80a3-27acb7c77404';
const sendMail = 'https://graph.microsoft.com/v1.0/me/sendMail';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function field(value) {
  return String(value || '').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function notification(job) {
  if (job.carrier_user_id !== carrierId || !uuid.test(job.load_id) || !uuid.test(job.document_id)) {
    throw Error('Invalid POD claim');
  }
  const load = field(job.load_number) || job.load_id;
  const broker = field(job.broker) || 'Broker not listed';
  const driver = field(job.driver) || 'Driver not listed';
  const received = new Date(job.received_at);
  if (!job.received_at || !Number.isFinite(received.valueOf())) throw Error('Invalid POD receipt time');
  const when = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago',
  }).format(received);
  const link = new URL('/operator', portal);
  link.searchParams.set('podInvoice', job.load_id);
  const event = job.addendum ? 'POD correction received' : 'POD received';
  return {
    subject: `[RoadReady] ${event} | ${broker} | Load #${load}`,
    toRecipients: [{emailAddress: {address: office}}],
    body: {contentType: 'Text', content: [
      job.addendum ? 'A driver filed a proof-of-delivery correction.' : 'A driver uploaded a proof of delivery.',
      '', `Broker: ${broker}`, `Load: ${load}`, `Driver: ${driver}`, `Received: ${when} (Chicago time)`,
      '', 'Review the load and invoice draft in RoadReady:', link.href,
      '', `Notification reference: RR-POD-${job.document_id}`,
    ].join('\n')},
  };
}

async function accessToken(call, deps) {
  const grant = await call('rr_office_pod_sender_grant', {});
  if (grant?.sender !== office || !grant.subject || !grant.refresh || !grant.revision) throw Error('Office unavailable');
  const token = await exchange({grant_type:'refresh_token', refresh_token:grant.refresh}, deps);
  const me = await mailbox(token.access_token, deps.request);
  if (me.id !== grant.subject || ![me.mail, me.userPrincipalName].some(address => address?.toLowerCase() === office)) {
    throw Error('Office identity changed');
  }
  if (token.refresh_token && token.refresh_token !== grant.refresh) {
    const saved = await call('rr_operator_mail_save', {
      p_sender:office, p_subject:grant.subject, p_refresh:token.refresh_token, p_revision:grant.revision,
    });
    if (!saved) {
      // Another mailer may already have rotated this same grant. Never overwrite its newer revision.
      const current = await call('rr_office_pod_sender_grant', {});
      if (current?.sender !== office || current.subject !== grant.subject || !current.refresh ||
          !current.revision || current.revision === grant.revision) {
        throw Error('Office grant changed');
      }
    }
  }
  return token.access_token;
}

async function deliver(job, call, getToken, request) {
  const mark = (status, reason = null) => call('rr_office_pod_mail_advance', {
    p_document:job.document_id, p_claim:job.claim_id, p_status:status, p_reason:reason,
  });
  let message, token;
  try {
    message = notification(job);
  } catch {
    await mark('review', 'notice_scope_or_metadata');
    return;
  }
  try {
    token = await getToken();
  } catch {
    await mark('retry', 'hotmail_connection');
    return;
  }
  // Any later ambiguity must be reconciled in Hotmail with the document reference.
  if (!await mark('sending')) return;
  let sent;
  try {
    sent = await request(sendMail, {
      method:'POST', redirect:'error', headers:{Authorization:'Bearer '+token, 'Content-Type':'application/json'},
      body:JSON.stringify({message, saveToSentItems:true}),
    });
  } catch {
    await mark('review', 'uncertain_delivery_check_hotmail');
    return;
  }
  if (sent.status === 202) await mark('accepted');
  else if ([401,403,429].includes(sent.status)) await mark('retry', 'graph_rejected_'+sent.status);
  else await mark('review', 'graph_'+sent.status+'_check_hotmail');
}

async function readTicket(req) {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(512);
  let used = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (used + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, used);
      used += value.length;
    }
    const {ticket} = JSON.parse(new TextDecoder().decode(bytes.subarray(0, used)));
    return typeof ticket === 'string' && /^[a-f0-9]{64}$/.test(ticket) ? ticket : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleOfficeNotice(req, deps) {
  if (deps.getEnv('SUPABASE_URL')?.replace(/\/$/, '') !== project || !deps.getEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response(null, {status:503});
  }
  if (req.method !== 'POST') return new Response(null, {status:405, headers:{Allow:'POST'}});
  const ticket = await readTicket(req);
  if (!ticket) return new Response(null, {status:400});
  const call = (name, body) => rpc(name, body, deps);
  try {
    if (!await call('rr_office_pod_consume_wake', {p_ticket:ticket})) return new Response(null, {status:403});
    let session;
    const getToken = () => session ??= accessToken(call, deps);
    for (let i = 0; i < 5; i++) {
      const job = await call('rr_office_pod_mail_claim', {});
      if (!job) break;
      await deliver(job, call, getToken, deps.request);
    }
    return new Response(null, {status:204});
  } catch {
    return new Response(null, {status:503});
  }
}
