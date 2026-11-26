import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chunkSize, mimeType, uuid } from './original.mjs';

const categories = new Set(['license', 'medical', 'registration', 'insurance', 'permit', 'inspection',
  'lease', 'carrier_document', 'eld', 'other', 'fuel_receipt', 'expense_receipt']);
const sqlText = (value) => "convert_from(decode('" + Buffer.from(value).toString('hex') + "','hex'),'UTF8')";

function cleanText(value, maxLength) {
  assert(typeof value === 'string' && value.trim() && [...value].length <= maxLength && !value.includes('\0'), 'Invalid wallet metadata.');
  return value.trim();
}

function dateOrNull(value) {
  if (value === null || value === undefined) return 'null';
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value, 'Expected an evidenced YYYY-MM-DD date.');
  return "'" + value + "'::date";
}

export async function prepareWalletOriginal(source, directory, info) {
  const bytes = await readFile(source);
  return prepareWalletBytes(directory, { ...info, file_name: info.file_name ?? basename(source) }, bytes, mimeType(bytes));
}

export async function prepareWalletEmail(message, directory, info) {
  assert(['fuel_receipt','expense_receipt'].includes(info.category), 'Email receipts are expense evidence only.');
  const mailbox = cleanText(info.mailbox, 320).toLowerCase();
  const address = (entry) => entry?.emailAddress?.address ?? entry?.email_address?.address;
  const sender = cleanText(address(message.sender ?? message.from), 320).toLowerCase();
  const recipients = (message.toRecipients ?? message.to_recipients ?? []).map(entry => cleanText(address(entry), 320).toLowerCase());
  const received = message.receivedDateTime ?? message.received_date_time;
  assert(typeof received === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(received) && Number.isFinite(Date.parse(received)), 'Receipt needs its received timestamp.');
  const subject = message.subject;
  assert(typeof subject === 'string' && subject.trim() && !/^\s*(fw|fwd)\s*:/i.test(subject), 'Read the directly received receipt.');
  assert(recipients.includes(mailbox), 'Receipt must be addressed to the verified mailbox.');
  assert(mailbox === 'nartaexpress@hotmail.com', 'Use the authorized Outlook mailbox.');
  if (info.category === 'fuel_receipt') {
    assert(sender === 'support@mudflapinc.com' && /^Your Mudflap (receipt|refund)\b/i.test(subject),
      'Expected the original Mudflap receipt or refund.');
  }
  const messageId = cleanText(message.id, 2048);
  const internetId = message.internetMessageId ?? message.internet_message_id ?? null;
  if (internetId !== null) cleanText(internetId, 1600);
  // Keep the provider body literally as returned, including whitespace and HTML markup.
  const contentType = message.body?.contentType ?? message.body?.content_type;
  const content = message.body?.content;
  assert(typeof contentType === 'string' && /^(text|html)$/i.test(contentType) && typeof content === 'string' && content.trim(),
    'The exact full receipt body and its content type are required. A preview cannot be archived.');
  const reference = 'outlook:' + mailbox + ':' + (internetId ?? messageId) + ':body';
  const archive = { format: 'roadready-outlook-receipt-v1', source_ref: reference, mailbox,
    message_id: messageId, internet_message_id: internetId, sender, recipients, subject, received_at: received,
    body: { content_type: contentType, content } };
  const bytes = Buffer.from(JSON.stringify(archive), 'utf8');
  return prepareWalletBytes(directory, { ...info, source_ref: reference, file_name: 'email-receipt.json' }, bytes, 'application/json');
}

async function prepareWalletBytes(directory, info, bytes, mime) {
  const { operator_id: operator, slot_key: slot, category, title, source_ref: reference,
    assignment_evidence: assignment, issued_on: issued, expires_on: expires, replaces } = info;
  assert(typeof operator === 'string' && uuid.test(operator), 'Expected a verified operator UUID.');
  assert(typeof slot === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(slot), 'Expected a stable document slot key.');
  assert(categories.has(category), 'Unknown wallet category.');
  assert(replaces == null || typeof replaces === 'string' && uuid.test(replaces), 'Expected a previous document UUID.');
  assert(bytes.length > 0 && bytes.length <= 33_554_432, 'Original must be 1 byte–32 MiB.');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const name = cleanText(info.file_name, 255);
  const args = ["'" + operator + "'::uuid", sqlText(slot), sqlText(category), sqlText(cleanText(title, 160)),
    sqlText(name), sqlText(mime), String(bytes.length), sqlText(sha), sqlText(cleanText(reference, 2048)),
    sqlText(cleanText(assignment, 2048)), dateOrNull(issued), dateOrNull(expires),
    replaces == null ? 'null' : "'" + replaces + "'::uuid"];
  assert(!issued || !expires || expires >= issued, 'Expiry precedes the issue date.');
  const condition = "operator_id='" + operator + "' and slot_key=" + sqlText(slot) + " and sha256='" + sha + "'";
  const target = '(select id from public.rr_lease_wallet_documents where ' + condition + ')';
  await mkdir(directory, { mode: 0o700 });
  const save = (file, sql) => writeFile(join(directory, file), sql+'\n', { mode: 0o600, flag: 'wx' });
  await save('000-init.sql', 'select public.rr_lease_wallet_begin(' + args.join(',') + ');');
  let count = 0;
  for (let start=0; start<bytes.length; start+=chunkSize) {
    const b64 = bytes.subarray(start, start+chunkSize).toString('base64');
    await save('100-part-'+String(count).padStart(4,'0')+'.sql',
      'select public.rr_lease_wallet_put_chunk(' + target + ',' + count + ",'" + b64 + "');");
    count++;
  }
  await save('200-finish.sql', 'select public.rr_lease_wallet_finish(' + target + ');\n' +
    'select id,byte_size,sha256,is_ready,is_current,revision from public.rr_lease_wallet_documents where ' + condition + ';');
  return { sha256: sha, bytes: bytes.length, parts: count };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, directory, manifest, mode] = process.argv.slice(2);
  assert(source && directory && manifest && (!mode || mode === '--outlook-receipt'), 'Usage: node wallet.mjs SOURCE NEW_PRIVATE_DIR MANIFEST_JSON [--outlook-receipt]');
  const info = JSON.parse(await readFile(manifest, 'utf8'));
  const report = mode ? await prepareWalletEmail(JSON.parse(await readFile(source, 'utf8')), directory, info)
    : await prepareWalletOriginal(source, directory, info);
  console.log(JSON.stringify(report));
}
