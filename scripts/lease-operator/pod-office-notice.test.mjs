import assert from 'node:assert/strict';
import test from 'node:test';
import {handleOfficeNotice} from '../../supabase/functions/rr-pod-notice-office/worker.js';
import {portal, project} from '../../supabase/functions/_shared/operator-outlook.js';

const office = 'nartaexpress@hotmail.com';
const ticket = 'a'.repeat(64);
const req = (body = {ticket}) => new Request(project + '/functions/v1/rr-pod-notice-office', {
  method:'POST', body:JSON.stringify(body),
});
const job = {
  carrier_user_id:'adfe5868-3256-4fc4-80a3-27acb7c77404', claim_id:'acead474-d0d1-4cb5-85f9-5f39c389fe50',
  document_id:'428fc732-c2b5-4e19-97e4-03d374204b59', load_id:'fe0b78c5-15de-4f0d-b77b-5bd41e4dbc86',
  received_at:'2026-11-27T01:10:00Z', broker:'Fixture\nBroker', load_number:'FIX-42', driver:'Fixture Driver',
};
const grant = {sender:office, subject:'fixture-subject', refresh:'fixture-refresh', revision:'v1'};

function setup(options = {}) {
  const queue = [{...job, ...options.job}], statuses = [], messages = [], writes = [];
  let valid = options.valid !== false, reads = 0;
  const deps = {
    getEnv: name => name === 'SUPABASE_URL' ? options.project || project : 'fixture',
    async request(url, init) {
      if (url.startsWith(project + '/rest/v1/rpc/')) {
        const body = JSON.parse(init.body);
        switch (url.split('/').pop()) {
          case 'rr_office_pod_consume_wake': {
            assert.equal(body.p_ticket, ticket);
            const accepted = valid;
            valid = false;
            return Response.json(accepted);
          }
          case 'rr_office_pod_mail_claim': return Response.json(queue.shift() || null);
          case 'rr_office_pod_sender_grant': return Response.json(reads++ ? options.current || null : grant);
          case 'rr_operator_mail_save':
            writes.push(body);
            return Response.json(options.saved !== false);
          case 'rr_office_pod_mail_advance':
            assert.equal(body.p_claim, job.claim_id);
            assert.equal(body.p_document, job.document_id);
            statuses.push(body.p_status);
            return Response.json(options.lease !== false);
        }
      }
      if (url === 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token') {
        assert.equal(init.body.get('grant_type'),'refresh_token');
        assert.equal(init.body.get('refresh_token'),grant.refresh);
        return Response.json({access_token:'fixture-access', refresh_token:'fixture-rotated', scope:'User.Read Mail.Send'});
      }
      if (url === 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName') {
        return Response.json({id:grant.subject, mail:options.mail || office});
      }
      if (url === 'https://graph.microsoft.com/v1.0/me/sendMail') {
        assert.equal(statuses.at(-1), 'sending');
        assert.equal(init.headers.Authorization, 'Bearer fixture-access');
        messages.push(JSON.parse(init.body));
        if (options.lost) throw Error('fixture connection dropped');
        return new Response(null, {status:options.status || 202});
      }
      throw Error('Unexpected destination');
    },
  };
  return {deps, statuses, messages, writes, queue};
}

test('only the fixed Narta mailbox receives the claimed POD, with the private production link', async () => {
  const state = setup();
  assert.equal((await handleOfficeNotice(req(),state.deps)).status,204);
  assert.deepEqual(state.statuses,['sending','accepted']);
  const [{message, saveToSentItems}] = state.messages;
  assert.equal(saveToSentItems,true);
  assert.deepEqual(message.toRecipients,[{emailAddress:{address:office}}]);
  assert.equal(message.subject,'[RoadReady] POD received | Fixture Broker | Load #FIX-42');
  assert.ok(message.body.content.includes(portal+'/operator?podInvoice='+job.load_id));
  assert.ok(message.body.content.includes('RR-POD-'+job.document_id));
  assert.deepEqual(Object.keys(message).sort(),['body','subject','toRecipients']);
  assert.deepEqual(state.writes,[{p_sender:office,p_subject:grant.subject,p_refresh:'fixture-rotated',p_revision:'v1'}]);
  assert.equal((await handleOfficeNotice(req(),state.deps)).status,403);
  assert.equal(state.messages.length,1);
});

test('a correction gets its own notification and keeps its document reference', async () => {
  const state=setup({job:{addendum:true}});
  await handleOfficeNotice(req(),state.deps);
  assert.match(state.messages[0].message.subject,/POD correction received/);
  assert.match(state.messages[0].message.body.content,/correction/);
});

test('wrong project, invalid ticket, excess input, different carrier or mailbox never send', async () => {
  for (const [options, body, status, marks] of [
    [{project:'https://isolated.example'},{ticket},503,[]],
    [{},{ticket:'wrong'},400,[]],
    [{},{ticket,extra:'x'.repeat(600)},400,[]],
    [{valid:false},{ticket},403,[]],
    [{job:{carrier_user_id:'wrong'}},{ticket},204,['review']],
    [{mail:'another@example.test'},{ticket},204,['retry']],
    [{lease:false},{ticket},204,['sending']],
  ]) {
    const state=setup(options);
    assert.equal((await handleOfficeNotice(req(body),state.deps)).status,status);
    assert.deepEqual(state.statuses,marks);
    assert.equal(state.messages.length,0);
  }
});

test('concurrent refresh uses only the same authorized grant and leaves the winning revision untouched', async () => {
  for (const [current, count] of [
    [{...grant,revision:'v2'},1], [{...grant,subject:'other',revision:'v2'},0], [grant,0], [null,0],
  ]) {
    const state=setup({saved:false,current});
    await handleOfficeNotice(req(),state.deps);
    assert.equal(state.writes.length,1);
    assert.equal(state.messages.length,count);
  }
});

test('uncertain Graph delivery is held for reconciliation, explicit rejection remains retryable', async () => {
  for (const [options, disposition] of [[{lost:true},'review'],[{status:503},'review'],[{status:429},'retry']]) {
    const state=setup(options);
    await handleOfficeNotice(req(),state.deps);
    assert.deepEqual(state.statuses,['sending',disposition]);
  }
});
