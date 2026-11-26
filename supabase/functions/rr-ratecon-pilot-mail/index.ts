import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { Buffer } from 'node:buffer';
import { rpc, exchange, mailbox, portal } from '../_shared/operator-outlook.js';

const dependencies = { getEnv: (name: string) => Deno.env.get(name), request: fetch };
const call = (name: string, body: object) => rpc(name, body, dependencies);
const displayTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/Chicago',
}).format(new Date(value)) + ' Chicago time';

async function trainingPacket(job: Record<string, string>) {
  const bytes = Buffer.from(job.original, 'base64');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  if (hash !== job.sha) throw Error('Original does not match the driver acceptance');
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 733;
  function row(text: string, header = false) {
    page.drawText(text.replace(/[\u00a0\u2007\u202f]/g, ' '), {x: 50, y, size: header ? 16 : 11, font: header ? bold : font,
      color: rgb(0.07, 0.16, 0.21)});
    y -= header ? 34 : 22;
  }
  row('Carrier acceptance and driver information', true);
  row('TRAINING COPY | RoadReady Training');
  row('Load ' + job.load + ' | Rate confirmation revision ' + job.revision);
  row('The preceding pages contain the rate confirmation accepted by the driver.');
  y -= 12;
  row('Carrier authorization', true);
  row('Carrier: ' + job.carrier);
  row('Electronic signature: /s/ ' + job.signer);
  row('Signed on behalf of the carrier for this simulation only.');
  row('Signed: ' + displayTime(new Date().toISOString()));
  y -= 12;
  row('Assigned driver', true);
  row('Driver name as entered: ' + job.driver);
  row('Driver accepted: ' + displayTime(job.accepted_at));
  row('Driver phone: ' + (job.phone || 'Not supplied for training'));
  row('Truck: ' + (job.truck || 'Not supplied for training'));
  row('Trailer: ' + (job.trailer || 'Not supplied for training'));
  y -= 12;
  row('Accepted original SHA-256');
  row(hash);
  row('Internal delivery only. No freight movement or payment.');
  return Buffer.from(await pdf.save()).toString('base64');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, {status: 405});
  const length = Number(req.headers.get('content-length'));
  if (!length || length > 1200) return new Response(null, {status: 400});
  const payload = await req.json().catch(() => null);
  if (!payload || !/^[a-f0-9-]{36}$/.test(payload.document) ||
      !['notice','packet'].includes(payload.stage) || !/^[a-f0-9]{64}$/.test(payload.ticket))
    return new Response(null, {status: 400});
  const ids = {p_document: payload.document, p_stage: payload.stage};
  const job = await call('rr_ratecon_pilot_claim', {...ids, p_ticket: payload.ticket});
  if (!job) return new Response(null, {status: 403});
  const advance = (p_status: string, p_pdf: string | null = null) =>
    call('rr_ratecon_pilot_advance', {...ids, p_status, p_pdf});
  let phase = 'mail_configuration';
  try {
    const grant = await call('rr_operator_mail_token', {p_email: job.pilot});
    if (!grant || grant.sender !== job.mail.toLowerCase()) throw Error('Incorrect mailbox');
    phase = 'mail_connection';
    const token = await exchange({grant_type:'refresh_token',refresh_token:grant.refresh}, dependencies);
    phase = 'mail_identity';
    const me = await mailbox(token.access_token, fetch);
    if (me.id !== grant.subject || ![me.mail, me.userPrincipalName].some((s) => s?.toLowerCase() === grant.sender))
      throw Error('Mailbox identity');
    phase = 'save_connection';
    if (token.refresh_token && token.refresh_token !== grant.refresh) {
      await call('rr_operator_mail_save', {p_sender:grant.sender,p_subject:grant.subject,
        p_refresh:token.refresh_token,p_revision:grant.revision});
    }
    phase = 'prepare_packet';
    const packet = payload.stage === 'packet';
    const content = packet ? await trainingPacket(job) : null;
    const subject = (packet ? '[RoadReady TEST] Signed broker copy - ' : '[RoadReady TEST] Driver accepted - ') + job.load;
    const body = packet
      ? 'This is the internal delivery test for the RoadReady Training broker.\n\nAttached are the accepted rate confirmation, carrier authorization signed on behalf of ' + job.carrier + ', and the assigned driver details for ' + job.driver + '.\n\nLoad ' + job.load + ' | revision ' + job.revision + '.'
      : job.driver + ' accepted ' + job.load + ', rate confirmation revision ' + job.revision + ', on ' + displayTime(job.accepted_at) + '.\n\nRoadReady will prepare the carrier-signed training copy and driver details for this internal test.\n\nCarrier workspace: ' + portal + '/operator/carrier';
    phase = 'record_send';
    if (!await advance('sending',content)) throw Error('Mail state');
    const message = {subject,body:{contentType:'Text',content:body},toRecipients:[{emailAddress:{address:grant.sender}}],
      ...(content ? {attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:job.load+'-Signed-Training.pdf',
        contentType:'application/pdf',contentBytes:content}]} : {})};
    phase = 'delivery_unknown';
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({message,saveToSentItems:true}),
    });
    if (response.status !== 202) { phase = 'provider_status_' + response.status; throw Error('Delivery rejected'); }
    phase = 'record_acceptance';
    if (!await advance('accepted')) throw Error('Delivery state');
    return new Response(null,{status:204});
  } catch (error) {
    if (phase === 'prepare_packet' && error instanceof Error) {
      if (error.message.includes('WinAnsi')) phase = 'packet_font';
      else if (error.message.includes('driver acceptance')) phase = 'packet_checksum';
      else if (error.message.includes('Invalid time')) phase = 'packet_time';
      else if (error.message.includes('parse PDF')) phase = 'packet_parse';
    }
    // Ambiguous provider results remain held for mailbox reconciliation to avoid duplicate sends.
    await advance('review');
    return new Response(phase,{status:502});
  }
});
