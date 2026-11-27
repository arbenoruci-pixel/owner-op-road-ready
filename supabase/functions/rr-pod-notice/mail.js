import { exchange, mailbox, portal as productionPortal } from '../_shared/operator-outlook.js';

export const narta = 'nartaexpress@hotmail.com';
const graph = 'https://graph.microsoft.com/v1.0/me/sendMail';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function field(value) {
  return String(value || '').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function formatPodNotice(job, portalUrl) {
  if (!uuid.test(job.document_id) || !uuid.test(job.load_id)) throw Error('Invalid document or load');
  const office = new URL(portalUrl);
  if (office.origin === productionPortal || office.protocol !== 'https:' || office.username || office.password || office.search || office.hash ||
      !['/', '/operator', '/operator/design-review'].includes(office.pathname)) throw Error('Invalid staging portal');
  if (office.pathname === '/') office.pathname = '/operator';
  office.searchParams.set('podInvoice', job.load_id);

  const load = field(job.load_number) || job.load_id;
  const broker = field(job.broker) || 'Broker not listed';
  const driver = field(job.driver) || 'Driver not listed';
  const received = new Date(job.received_at);
  if (!job.received_at || !Number.isFinite(received.valueOf())) throw Error('Missing receipt time');
  const when = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago',
  }).format(received);
  const event = job.addendum ? 'POD correction received' : 'POD received';
  return {
    subject: `[RoadReady STAGING] ${event} | ${broker} | Load #${load}`,
    toRecipients: [{emailAddress: {address: narta}}],
    body: {contentType: 'Text', content: [
      job.addendum ? 'Internal RoadReady staging test. A proof-of-delivery correction was filed for this load.' :
        'Internal RoadReady staging test. A driver uploaded a proof of delivery.',
      '', `Broker: ${broker}`, `Load: ${load}`, `Driver: ${driver}`, `Received: ${when} (Chicago time)`,
      '', job.addendum ? 'Review the correction and invoice in RoadReady:' : 'View the load and invoice draft in RoadReady:', office.href,
      '', `Notification reference: RR-POD-${job.document_id}`,
    ].join('\n')},
  };
}

export async function senderToken(call, deps) {
  const grant = await call('rr_pod_mail_sender_grant', {});
  if (!grant?.refresh || !grant.subject || grant.sender !== narta) throw Error('Staging Hotmail connection unavailable');
  const token = await exchange({grant_type: 'refresh_token', refresh_token: grant.refresh}, deps);
  const me = await mailbox(token.access_token, deps.request);
  if (me.id !== grant.subject || ![me.mail, me.userPrincipalName].some(address => address?.toLowerCase() === narta)) {
    throw Error('Incorrect sending account');
  }
  if (token.refresh_token && token.refresh_token !== grant.refresh) {
    await call('rr_operator_mail_save', {
      p_sender: narta, p_subject: grant.subject, p_refresh: token.refresh_token, p_revision: grant.revision,
    });
  }
  return token.access_token;
}

// A lost Graph acknowledgement must be reconciled in Hotmail before resending.
// Mark the send-start boundary durably BEFORE exposing any bytes to Graph.
export async function deliverPodNotice(job, {call, getToken, request, carrierId, portalUrl}) {
  const mark = (status, reason = null) => call('rr_pod_mail_advance', {
    p_document: job.document_id, p_claim: job.claim_id, p_status: status, p_reason: reason,
  });
  let message;
  try {
    if (!uuid.test(carrierId) || job.carrier_user_id !== carrierId) throw Error('Carrier mismatch');
    message = formatPodNotice(job, portalUrl);
  } catch {
    await mark('review', 'notice_scope_or_metadata');
    return;
  }
  let token;
  try {
    token = await getToken();
  } catch {
    await mark('retry', 'hotmail_connection');
    return;
  }
  if (!await mark('sending')) return;
  let response;
  try {
    response = await request(graph, {
      method: 'POST', redirect: 'error',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify({message, saveToSentItems: true}),
    });
  } catch {
    await mark('review', 'uncertain_delivery_check_hotmail');
    return;
  }
  if (response.status === 202) {
    await mark('accepted');
  } else if ([401, 403, 429].includes(response.status)) {
    await mark('retry', 'graph_rejected_' + response.status);
  } else {
    await mark('review', 'graph_' + response.status + '_check_hotmail');
  }
}
