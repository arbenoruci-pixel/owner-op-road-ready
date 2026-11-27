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
  for (const reason of ['operator_request_failed', 'pod_save_failed', 'conflicting_request', 'pod_load_needs_review']) {
    const id = crypto.randomUUID();
    const reservation = {id};
    await assert.rejects(sendReservedPod(reservation, async () => { throw Error(reason); }));
    assert.equal(reservation.id, id);
    assert.doesNotMatch(podUploadMessage(Error(reason)), /_/);
  }
});

function podRequest(action) {
  const id = crypto.randomUUID();
  const pdf = '%PDF-1.5\n';
  const headers = {Authorization:'Bearer test'};
  const request = {method:'POST', headers};
  if (action === 'create' || action === 'review') {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(action === 'review'
      ? {documentId:id, approve:true, setAsFinalPod:false, reason:'Reviewed original'}
      : {requestId:id, loadId:id, fileName:'pod.pdf', mimeType:'application/pdf', byteSize:pdf.length});
  } else {
    Object.assign(headers, {'Content-Type':'application/pdf', 'X-Upload-Id':id, 'X-Load-Id':id, 'X-Request-Id':id, 'X-File-Name':'pod.pdf'});
    request.body = pdf;
  }
  return new Request('https://example.test/api/operator/pod/' + action, request);
}

async function checkRpcFailure(action, rpc, status, code) {
  const handler = operatorHandler(action, {
    url:'https://example.test', key:'public-test-key',
    clientFactory:() => ({
      auth:{getUser:async () => ({data:{user:{id:crypto.randomUUID(),email_confirmed_at:'2026-11-01'}}})},
      rpc,
    }),
  });
  const response = await handler(podRequest(action));
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), {error:code});
}

test('POD writes report a failed save for attachment storage failures and rolled back transactions', async () => {
  for (const [code, message] of [
    ['P0001', 'Invalid attachment chunk'],
    ['P0001', 'Unexpected chunk size'],
    ['P0001', 'Incomplete attachment or checksum mismatch'],
    ['P0001', 'Storage original is missing or inconsistent'],
    ['40001', 'could not serialize access'],
    ['40P01', 'deadlock detected'],
  ]) {
    for (const action of ['commit', 'addendum']) {
      await checkRpcFailure(action, async () => ({error:{code, message}}), 503, 'pod_save_failed');
    }
  }
  assert.match(podUploadMessage(Error('pod_save_failed')), /could not be saved.*still selected.*try again/i);
});

test('only specific POD and load restrictions tell the driver what is blocking the submission', async () => {
  for (const [action, code, message, status, expected] of [
    ['commit', '22023', 'Upload expired', 409, 'pod_upload_expired'],
    ['create', '22023', 'Unsupported load channel or type', 400, 'pod_load_unsupported'],
    ['commit', 'P0001', 'Open unfactored load required: settlement locked', 409, 'pod_load_closed'],
    ['commit', 'P0001', 'Open unfactored load required: factoring claim exists', 409, 'pod_load_closed'],
    ['commit', '22023', 'Unverified financial load requires carrier review', 409, 'pod_load_needs_review'],
    ['commit', '22023', 'Staged financial load needs owner review', 409, 'pod_load_needs_review'],
    ['addendum', '22023', 'Daily correction upload limit reached', 429, 'pod_upload_limit'],
    ['commit', '23505', 'Upload replay has different bytes', 409, 'conflicting_request'],
    ['commit', '23505', 'Original already filed; carrier review required', 409, 'pod_original_filed'],
    ['commit', '42501', 'Upload unavailable', 403, 'access_denied'],
    ['review', 'P0001', 'Current phone POD required', 409, 'review_required'],
  ]) {
    await checkRpcFailure(action, async () => ({error:{code, message}}), status, expected);
  }
});

test('unknown, interrupted and legacy ambiguous POD failures never claim dispatch approval is required', async () => {
  const ambiguous = 'operator_request_failed';
  for (const action of ['create', 'commit', 'addendum']) {
    for (const rpc of [
      async () => ({error:{code:'P0001', message:'unknown SQL failure'}}),
      async () => ({error:{code:'23505', message:'unclassified unique constraint'}}),
      async () => { throw TypeError('Failed to fetch'); },
    ]) {
      await checkRpcFailure(action, rpc, 500, ambiguous);
    }
  }
  for (const reason of ['Failed to fetch', 'Load failed', 'review_required', 'Unexpected token <', 'toString']) {
    assert.equal(podUploadMessage(Error(reason)), podUploadMessage(Error(ambiguous)));
  }
  assert.match(podUploadMessage(Error(ambiguous)), /could not confirm.*try again/i);
  assert.match(podUploadMessage(Error('Sign in again')), /sign in again/i);
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
  assert.throws(() => confirmedPodMessage({loadId, documentId, review_status:'REJECTED'}, loadId), error => {
    assert.match(podUploadMessage(error), /corrected document/);
    return true;
  });
});
