import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {operatorHandler} from '../../lib/rr-lease/operator-api.js';

const loadId = '00000000-0000-4000-8000-000000000042';
const requestId = '00000000-0000-4000-8000-000000000007';
const body = Buffer.from('%PDF-1.4\nfixture\n%%EOF');

function signedRequest(overrides = {}) {
  return new Request('https://example.test/api/operator/pod/addendum', {
    method:'POST',
    headers:{
      Authorization:'Bearer sample-driver',
      'Content-Type':'application/pdf',
      'X-Load-Id':loadId,
      'X-Request-Id':requestId,
      'X-File-Name':encodeURIComponent('POD corrigé.pdf'),
      ...overrides,
    },
    body,
  });
}

function handler(calls) {
  const clientFactory = () => ({
    auth:{getUser:async () => ({data:{user:{id:'fixture-driver',email_confirmed_at:'2026-11-26'}}})},
    rpc:async (name, args) => {
      calls.push({name, args});
      return {data:{review_status:'CORRECTION_REVIEW'}};
    },
  });
  return operatorHandler('addendum', {url:'https://example.test',key:'test-publishable',clientFactory});
}

test('a correction sends exact bytes and load identity solely to the addendum RPC', async () => {
  const calls = [];
  const response = await handler(calls)(signedRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{name:'rr_lease_pod_addendum',args:{
    p_load_id:loadId, p_request_id:requestId, p_file_name:'POD corrigé.pdf',
    p_base64:body.toString('base64'), p_sha256:createHash('sha256').update(body).digest('hex'),
    p_mime:'application/pdf',
  }}]);
});

test('a mislabeled correction is rejected before recording an office document', async () => {
  const calls = [];
  const response = await handler(calls)(signedRequest({'Content-Type':'image/png'}));
  assert.equal(response.status, 415);
  assert.deepEqual(calls, []);
});
