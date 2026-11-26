import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { emailReceiptText } from '../../app/operator/walletReceipt.js';
import { prepareWalletEmail } from './wallet.mjs';

const meta = {
  operator_id: 'db000000-0000-4000-8000-000000000001', slot_key: 'mudflap:smoke-01',
  category: 'fuel_receipt', title: 'Fuel purchase', assignment_evidence: 'Registered driver and assigned test unit match',
  mailbox: 'nartaexpress@hotmail.com', issued_on: '2026-01-18',
};
const message = {
  id: 'synthetic-outlook-123', internetMessageId: '<receipt@example.test>',
  sender: { emailAddress: { address: 'support@mudflapinc.com' } },
  toRecipients: [{ emailAddress: { address: meta.mailbox } }],
  subject: 'Your Mudflap receipt for a fictional test station', receivedDateTime: '2026-01-18T17:00:00Z',
  body: { contentType: 'HTML', content: '<html><head><style>.a{}</style></head><body><div>TOTAL CHARGED &amp; fees: $17.23</div>  \r\n<img src="https://example.test/pixel"><script>alert(1)</script></body></html>' },
};

test('preserves the full body and its provenance as a private JSON receipt', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'rr-wallet-email-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dest = join(temp, 'sql');
  const report = await prepareWalletEmail(message, dest, meta);
  const chunk = await readFile(join(dest, '100-part-0000.sql'), 'utf8');
  const bytes = Buffer.from(chunk.match(/,0,'([A-Za-z0-9+/=]+)'\);/)[1], 'base64');
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.body.content, message.body.content);
  assert.equal(receipt.body.content_type, 'HTML');
  assert.equal(receipt.received_at, message.receivedDateTime);
  assert.equal(receipt.message_id, message.id);
  assert.equal(receipt.internet_message_id, message.internetMessageId);
  assert.equal(receipt.sender, message.sender.emailAddress.address);
  assert.equal(receipt.source_ref, 'outlook:'+meta.mailbox+':'+message.internetMessageId+':body');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.sha256);
  assert.equal(emailReceiptText(receipt.body), 'TOTAL CHARGED & fees: $17.23');
  assert.equal(emailReceiptText({content_type:'text',content:'a < b & c'}), 'a < b & c');
  const repeated = await prepareWalletEmail(message, join(temp, 'retry'), meta);
  assert.deepEqual(repeated, report);
});

test('requires the directly received vendor message and a complete body', async () => {
  const invalid = [
    [{ ...message, body: undefined, bodyPreview: '$17.23' }, meta],
    [{ ...message, sender: { emailAddress: { address: 'driver@example.test' } } }, meta],
    [{ ...message, toRecipients: [] }, meta],
    [{ ...message, subject: 'FW: '+message.subject }, meta],
    [message, { ...meta, category: 'registration' }],
  ];
  for (const [msg, info] of invalid) await assert.rejects(prepareWalletEmail(msg, '', info));
});
