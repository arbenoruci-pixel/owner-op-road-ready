import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberPodInvoice, takePodInvoice } from '../../app/operator/podLoginIntent.js';

const id = 'b0eb53ca-bd2f-4875-9b63-3dad407c264b';
const office = 'office@example.test';
const origin = 'https://portal.example.test';

function tab(path, values) {
  return {
    location: new URL(path, origin),
    localStorage: {
      setItem: (key, value) => values.set(key, value),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    },
  };
}

for (const callback of ['/operator?code=example', '/operator/confirm']) {
  test('only the matching email can resume the draft once via ' + callback, () => {
    const values = new Map();
    rememberPodInvoice(' Office@example.test ', tab('/operator?podInvoice=' + id, values));
    const next = tab(callback, values);
    assert.equal(takePodInvoice('different@example.test', next), undefined);
    assert.equal(takePodInvoice(office, next), id);
    assert.equal(takePodInvoice(office, next), undefined);
  });
}

test('rejects other paths, multiple IDs, arbitrary destinations and corrupted storage', () => {
  for (const path of [
    '/operator/carrier?podInvoice=' + id,
    '/operator?podInvoice=https://other.example',
    '/operator?podInvoice=' + id + '&podInvoice=' + id,
  ]) {
    const values = new Map();
    rememberPodInvoice(office, tab(path, values));
    assert.equal(values.size, 0);
  }
  const next = tab('/operator?podInvoice=' + id, new Map());
  assert.doesNotThrow(() => rememberPodInvoice(office, { ...next, get localStorage() { throw Error(); } }));
  assert.equal(takePodInvoice(office, { ...next, localStorage: { getItem() { return '{'; } } }), undefined);
});

test('expires after 15 minutes and a fresh generic login cancels a previous intent', (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const values = new Map();
  const start = tab('/operator?podInvoice=' + id, values);
  const next = tab('/operator', values);
  rememberPodInvoice(office, start);
  now += 15 * 60 * 1000;
  assert.equal(takePodInvoice(office, next), undefined);
  assert.equal(values.size, 0);
  rememberPodInvoice(office, start);
  rememberPodInvoice(office, next);
  assert.equal(takePodInvoice(office, next), undefined);
});
