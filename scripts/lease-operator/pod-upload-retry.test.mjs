import assert from 'node:assert/strict';
import test from 'node:test';
import {confirmedPodMessage, podUploadMessage, sendReservedPod} from '../../app/operator/podUpload.js';
import {operatorHandler} from '../../lib/rr-lease/operator-api.js';

test('an expired uncommitted reservation is renewed once with the same selected file', async () => {
  const reservation = {id:crypto.randomUUID()};
  const first = reservation.id;
  const attempted = [];
  const saved = await sendReservedPod(reservation, async id => {
    attempted.push(id);
    if (id === first) throw Error('pod_upload_expired');
    return {saved:true};
  });
  assert.deepEqual(saved, {saved:true});
  assert.deepEqual(attempted, [first, reservation.id]);
  assert.notEqual(first, reservation.id);
  let attempts = 0;
  await assert.rejects(sendReservedPod(reservation, async () => {
    attempts++;
    throw Error('pod_upload_expired');
  }), /pod_upload_expired/);
  assert.equal(attempts, 2);
});

test('a lost response or conflicting load keeps the original retry identifier', async () => {
  for (const reason of ['operator_request_failed', 'conflicting_request', 'pod_load_needs_review']) {
    const id = crypto.randomUUID();
    const reservation = {id};
    await assert.rejects(sendReservedPod(reservation, async () => { throw Error(reason); }));
    assert.equal(reservation.id, id);
    assert.doesNotMatch(podUploadMessage(Error(reason)), /_/);
  }
});

test('the POD HTTP endpoint identifies expired reservations without returning internal errors', async () => {
  const handler = operatorHandler('commit', {
    url:'https://example.test', key:'public-test-key',
    clientFactory:() => ({
      auth:{getUser:async () => ({data:{user:{id:crypto.randomUUID(),email_confirmed_at:'2026-11-01'}}})},
      rpc:async () => ({error:{code:'22023',message:'Upload expired'}}),
    }),
  });
  const response = await handler(new Request('https://example.test/api/operator/pod/commit-upload', {
    method:'POST', headers:{Authorization:'Bearer test','Content-Type':'application/pdf','X-Upload-Id':crypto.randomUUID()},
    body:'%PDF-1.5\n',
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {error:'pod_upload_expired'});
});


test('a returned original on the assigned load is required before showing a POD receipt', () => {
  const loadId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  assert.throws(() => confirmedPodMessage({loadId, review_status:'PENDING'}, loadId), /operator_request_failed/);
  assert.throws(() => confirmedPodMessage({loadId, documentId}, crypto.randomUUID()), /operator_request_failed/);
  for (const [review_status, message] of [
    ['PENDING', 'POD received'],
    ['APPROVED', 'POD received'],
    ['CORRECTION_REVIEW', 'Additional document received'],
    ['ALREADY_FILED', 'POD already filed'],
  ]) {
    assert.equal(confirmedPodMessage({loadId, documentId, review_status}, loadId), message);
  }
  assert.throws(() => confirmedPodMessage({loadId, documentId, review_status:'REJECTED'}, loadId), /corrected document/);
});
