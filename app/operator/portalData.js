import { createClient } from '@supabase/supabase-js';

export const podTestProject = process.env.NEXT_PUBLIC_RR_POD_TEST_PROJECT_REF || '';
const project = podTestProject ? 'https://' + podTestProject + '.supabase.co' : 'https://ghwkcgczuwctzxsxmqzx.supabase.co';
const publicKey = process.env.NEXT_PUBLIC_RR_POD_TEST_PUBLISHABLE_KEY || 'sb_publishable_YP8uKzWiV-l-ZiJhy9smbQ_hmbEPBrb';

async function operatorFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || input.href);
  if (url.origin === project && url.pathname === '/auth/v1/otp' && init?.method === 'POST') {
    if (podTestProject) return Response.json({message: 'Use the password for the staging account.'}, {status: 403});
    const { email, code_challenge } = JSON.parse(init.body);
    // The SDK keeps the PKCE verifier on this browser. The invitation service only receives its challenge.
    return fetch(project + '/functions/v1/rr-lease-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publicKey },
      body: JSON.stringify({ email, code_challenge }),
      cache: 'no-store',
    });
  }
  return fetch(input, init);
}

let portalClient;
export function operatorClient() {
  // An operator sign-in uses its own session. It never claims a carrier device.
  if (!portalClient) {
    portalClient = createClient(project, publicKey, {
      global: { fetch: operatorFetch },
      auth: { storageKey: podTestProject ? 'rr-pod-test-' + podTestProject : 'road-ready-leased-operator-v1', flowType: 'pkce' },
    });
  }
  return portalClient;
}

export async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export const loadFields =
  'id,operator_id,load_number,broker_name,status,pickup_at,delivery_at,pickup_timezone,delivery_timezone,pickup_address,delivery_address,pickup_number,delivery_number,reefer_instructions,steps,actual_delivery_date,payment_deadline,gross_cents,operator_share_cents,carrier_share_cents,settlement_id';

export async function allRows(makeQuery) {
  const result = [];
  const pageSize = 200;
  for (let start = 0; ; start += pageSize) {
    const part = await rows(makeQuery().range(start, start + pageSize - 1));
    result.push(...part);
    if (part.length < pageSize) return result;
  }
}

export const usd = (cents) =>
  Number.isSafeInteger(cents)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : 'Pending';

export function appointment(value, timeZone) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(+date)) return '';
  const options = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  try {
    return date.toLocaleString('en-US', { ...options, timeZone: timeZone || 'UTC' });
  } catch {
    return date.toLocaleString('en-US', { ...options, timeZone: 'UTC' });
  }
}

export async function loadOriginal(client, doc, chunkRpc = 'rr_lease_download_chunk') {
  if (
    !doc.is_ready ||
    !/^[0-9a-f]{64}$/i.test(doc.sha256 || '') ||
    !Number.isSafeInteger(doc.byte_size) ||
    doc.byte_size < 1
  ) {
    throw new Error('This original is still being verified.');
  }
  let blob;
  if (doc.storage_backend === 'database') {
    if (!Number.isInteger(doc.chunk_count) || doc.chunk_count < 1 || doc.chunk_count > doc.byte_size)
      throw new Error('The original is incomplete.');
    const parts = [];
    let bytes = 0;
    const fetchPart = async (index) => {
      const { data, error } = await client.rpc(chunkRpc, {
        p_document_id: doc.id,
        p_index: index,
      });
      if (error || typeof data !== 'string') throw new Error('Could not retrieve the original. Try again.');
      return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    };
    for (let start = 0; start < doc.chunk_count; start += 6) {
      const count = Math.min(6, doc.chunk_count - start);
      const batch = await Promise.all(Array.from({ length: count }, (_, i) => fetchPart(start + i)));
      for (const part of batch) {
        bytes += part.length;
        if (!part.length || bytes > doc.byte_size)
          throw new Error('The downloaded size differs from the original.');
        parts.push(part);
      }
    }
    blob = new Blob(parts);
  } else if (doc.storage_backend === 'storage') {
    const { data, error } = await client.storage.from('rr-lease-private').download(doc.storage_path);
    if (error || !data) throw new Error('Could not retrieve the original. Try again.');
    blob = data;
  } else throw new Error('Unknown original format.');
  if (blob.size !== doc.byte_size) throw new Error('The downloaded size differs from the original.');
  const sum = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(sum), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== doc.sha256.toLowerCase()) throw new Error('The downloaded file differs from the original.');
  const type = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(doc.mime_type)
    ? doc.mime_type
    : 'application/octet-stream';
  return blob.slice(0, blob.size, type);
}
