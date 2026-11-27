import assert from 'node:assert/strict';
import test from 'node:test';
import {stagingConsent} from '../../supabase/functions/rr-pod-notice/consent.js';
import {deliverPodNotice, formatPodNotice, senderToken} from '../../supabase/functions/rr-pod-notice/mail.js';

const carrierId = 'b5059289-3da8-40a7-9fb1-441b6bf87225';
const portalUrl = 'https://owner-op-road-ready-demo-tepiha.vercel.app/operator/design-review';
const job = {
  document_id: '70e23137-94ef-4bc7-b53c-25fa571b199c', claim_id: '7edcfe9d-5501-4919-be3b-32a2edd6a317',
  carrier_user_id: carrierId, load_id: '72e25037-83bf-4fc7-8a0e-bad7579e4d11', broker: 'Demo Freight',
  driver: 'Test Driver', load_number: 'TEST-042', received_at: '2026-11-27T18:55:00Z',
};
function fixture(options = {}) {
  const events = [];
  const deps = {carrierId, portalUrl, getToken: async () => 'test-token',
    async request(url, settings) {
      assert.equal(url, 'https://graph.microsoft.com/v1.0/me/sendMail');
      assert.equal(settings.headers.Authorization, 'Bearer test-token');
      const payload = JSON.parse(settings.body);
      assert.equal(payload.saveToSentItems, true);
      assert.deepEqual(payload.message, formatPodNotice(job, portalUrl));
      events.push('send');
      if (options.networkLoss) throw Error('Socket closed before the response');
      return new Response(null, {status: options.graphStatus ?? 202});
    },
    async call(name, args) {
      assert.equal(name, 'rr_pod_mail_advance');
      assert.equal(args.p_document, job.document_id);
      assert.equal(args.p_claim, job.claim_id);
      events.push(args.p_status);
      return options.leaseValid !== false;
    },
  };
  return {events, deps};
}

test('POD notification is internal, has an exact private load link and a stable correlation marker', () => {
  const message = formatPodNotice({...job, broker: 'Demo\r\nFreight'}, portalUrl);
  assert.equal(message.subject, '[RoadReady STAGING] POD received | Demo Freight | Load #TEST-042');
  assert.deepEqual(message.toRecipients, [{emailAddress:{address:'nartaexpress@hotmail.com'}}]);
  assert.ok(message.body.content.includes(portalUrl + '?podInvoice=' + job.load_id));
  assert.ok(message.body.content.includes('RR-POD-' + job.document_id));
  assert.equal(message.attachments, undefined);
  assert.throws(() => formatPodNotice(job, portalUrl + '?access=token'));
  assert.throws(() => formatPodNotice(job, 'https://owner-op-road-ready.vercel.app/operator'));
  assert.throws(() => formatPodNotice({...job, load_id:'wrong'}, portalUrl));
});

test('Graph 202 is recorded only after a durable send-start claim', async () => {
  const {deps, events} = fixture();
  await deliverPodNotice(job, deps);
  assert.deepEqual(events, ['sending','send','accepted']);
  const expired = fixture({leaseValid:false});
  await deliverPodNotice(job, expired.deps);
  assert.deepEqual(expired.events,['sending']);
});

test('uncertain acknowledgement is held and explicit provider rejection is recoverable', async () => {
  for (const [options, status] of [[{networkLoss:true},'review'], [{graphStatus:503},'review'], [{graphStatus:429},'retry']]) {
    const {deps,events} = fixture(options);
    await deliverPodNotice(job, deps);
    assert.deepEqual(events,['sending','send',status]);
  }
});

test('sending is limited to the configured carrier and a working Hotmail connection', async () => {
  const mismatch = fixture();
  await deliverPodNotice({...job, carrier_user_id:'somebody-else'}, mismatch.deps);
  assert.deepEqual(mismatch.events,['review']);
  const offline = fixture();
  offline.deps.getToken = async () => {throw Error('Connection expired');};
  await deliverPodNotice(job, offline.deps);
  assert.deepEqual(offline.events,['retry']);
});

test('the worker rejects a Microsoft session for a different mailbox principal', async () => {
  const deps = {getEnv:()=>'test', request: async url => url.endsWith('/token') ?
    Response.json({access_token:'test',scope:'User.Read Mail.Send'}) :
    Response.json({id:'another-user',mail:'nartaexpress@hotmail.com'})};
  await assert.rejects(senderToken(async () => ({subject:'correct-user',sender:'nartaexpress@hotmail.com', refresh:'test'}),deps),
    /Incorrect sending account/);
});

test('staging consent uses its own callback, validates the browser session and saves only the authorized Hotmail identity', async () => {
  const base = 'https://abcdefghijklmnopqrst.supabase.co';
  const setup = base + '/functions/v1/rr-pod-notice';
  let saved, identity = 'somebody@example.com';
  const deps = {base, getEnv:()=>'stage-client-secret',
    async call(name, args) {
      if (name === 'rr_operator_mail_config') return {sender:'nartaexpress@hotmail.com',revision:'stage-revision'};
      assert.equal(name, 'rr_operator_mail_save');
      saved = args;
      return true;
    },
    async request(url, options) {
      if (url.endsWith('/token')) {
        assert.equal(options.body.get('redirect_uri'),setup + '/callback');
        assert.equal(options.body.get('code_verifier')?.length,43);
        return Response.json({refresh_token:'stage-refresh',access_token:'stage-token'});
      }
      return Response.json({id:'narta-user',mail:identity});
    },
  };
  const result = await stagingConsent(new Request(setup+'/connect'),deps);
  assert.equal(result.status,302);
  const auth = new URL(result.headers.get('location'));
  assert.equal(auth.searchParams.get('redirect_uri'),setup+'/callback');
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  const cookie = result.headers.get('set-cookie').split(';')[0];
  const confirm = state => new Request(setup+'/callback?code=test&state='+state,{headers:{cookie}});
  assert.equal((await stagingConsent(confirm('invalid'),deps)).status,400);
  assert.equal((await stagingConsent(confirm(auth.searchParams.get('state')),deps)).status,403);
  assert.equal(saved,undefined);
  identity = 'nartaexpress@hotmail.com';
  assert.equal((await stagingConsent(confirm(auth.searchParams.get('state')),deps)).status,200);
  assert.deepEqual(saved,{p_sender:identity,p_subject:'narta-user',p_refresh:'stage-refresh',p_revision:'stage-revision'});
});

test('a correction and a committed load with incomplete descriptive fields still notify the office', () => {
  const message = formatPodNotice({...job,addendum:true,broker:null,driver:null,load_number:null},portalUrl);
  assert.match(message.subject,/POD correction received/);
  assert.ok(message.body.content.includes(job.load_id));
  assert.match(message.body.content,/Driver not listed/);
  assert.match(message.body.content,/Review the correction/);
});
