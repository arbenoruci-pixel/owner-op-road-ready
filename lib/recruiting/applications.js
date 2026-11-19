import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

// Same isolated Supabase project and public browser credential used by Road Ready's AuthGate.
const REST = 'https://ghwkcgczuwctzxsxmqzx.supabase.co/rest/v1/';
const PUBLIC_KEY = 'sb_publishable_YP8uKzWiV-l-ZiJhy9smbQ_hmbEPBrb';
const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP'.split(' '));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_BYTES = 12 * 1024;
const PAGE_SIZE = 25;

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function reply(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', ...headers },
  });
}

function failed(error) {
  if (error instanceof RequestError) {
    return reply({ ok: false, error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '3600' } : {});
  }
  return reply({ ok: false, error: 'Recruiting is temporarily unavailable. Please try again.' }, 503);
}

async function bodyObject(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError('Send the application as JSON.', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new RequestError('Application is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Application data is missing.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new RequestError('Application is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError('Application data could not be read.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('Application data is invalid.');
  return body;
}

function check(ok, message) {
  if (!ok) throw new RequestError(message, 422);
}

function string(value, label, min = 1, max = 200) {
  const clean = typeof value === 'string' ? value.trim() : '';
  check(clean.length >= min && clean.length <= max && !/[\u0000-\u001f\u007f]/u.test(clean), 'Check ' + label + '.');
  return clean;
}

function integer(value, label, min, max) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, 'Check ' + label + '.');
  return value;
}

function state(value, label) {
  check(STATES.has(value), 'Select a valid ' + label + '.');
  return value;
}

export function recruitingApplication(body) {
  check(UUID.test(body.requestId), 'Reload the form and try again.');
  check(body.activeClassA === true, 'An active U.S. Class A CDL is required.');
  check(typeof body.age24 === 'boolean', 'Answer the insurance age question.');
  check(body.consent === true, 'Confirm permission to contact you about your application.');
  const cdlMonths = integer(body.cdlMonths, 'your Class A CDL experience', 36, 900);
  const otrMonths = integer(body.otrMonths, 'your verifiable over-the-road experience', 36, 900);
  const amazonMonths = integer(body.amazonMonths, 'your Amazon Relay experience', 12, 900);
  const email = string(body.email, 'your email', 3, 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
  const phone = string(body.phone, 'your phone number', 10, 35);
  const digits = phone.replace(/\D/g, '');
  check(/^[+\d\s().-]+$/.test(phone) && digits.length >= 10 && digits.length <= 15, 'Enter a valid phone number.');
  check(['clear', 'review'].includes(body.drivingHistory), 'Answer the driving history question.');
  check(['current', 'pending', 'expired'].includes(body.registrationStatus), 'Select the registration status.');
  check(typeof body.physicalDamage === 'boolean', 'Answer the physical damage coverage question.');
  check(Array.isArray(body.documents) && body.documents.length <= 3 &&
    body.documents.every(doc => ['cdl', 'registration', 'experience'].includes(doc)), 'Check the available documents.');
  const startDate = string(body.startDate, 'your available start date', 10, 10);
  const date = new Date(startDate + 'T00:00:00Z');
  check(/^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === startDate, 'Enter a valid start date.');
  const truckVin = string(body.truckVin ?? '', 'the tractor VIN', 0, 17).toUpperCase();
  check(!truckVin || /^[A-HJ-NPR-Z0-9]{17}$/.test(truckVin), 'Enter a 17-character VIN or leave it blank.');
  const address = typeof body.garagingAddress === 'string' ? body.garagingAddress.replace(/\r?\n/g, ' ') : '';
  return {
    fullName: string(body.fullName, 'your full name', 2, 120),
    email, phone, cdlState: state(body.cdlState, 'CDL state'), activeClassA: true, age24: body.age24,
    cdlMonths, otrMonths, amazonMonths, priorCarrier: string(body.priorCarrier, 'your previous OTR carrier'),
    amazonCarrier: string(body.amazonCarrier, 'your previous Amazon Relay carrier'),
    drivingHistory: body.drivingHistory, startDate,
    truckYear: integer(body.truckYear, 'the tractor year', 1900, new Date().getUTCFullYear() + 1),
    truckMake: string(body.truckMake, 'the tractor make'), truckModel: string(body.truckModel, 'the tractor model'), truckVin,
    registrationState: state(body.registrationState, 'registration state'), registrationStatus: body.registrationStatus,
    garagingAddress: string(address, 'the full garaging address', 6, 400),
    trailer: string(body.trailer ?? '', 'the trailer description', 0), physicalDamage: body.physicalDamage,
    declaredValue: body.physicalDamage ? integer(body.declaredValue, 'the declared tractor value', 1, 10000000) : null,
    documents: [...new Set(body.documents)].sort(), consent: true,
  };
}

function headersForReviewer(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) throw new RequestError('Sign in to Road Ready.', 401);
  return { apikey: PUBLIC_KEY, authorization };
}

async function db(path, options = {}) {
  const result = await fetch(REST + path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (result.status === 401 && options.headers?.authorization) throw new RequestError('Sign in to Road Ready.', 401);
  if (result.status === 403 && options.headers?.authorization) throw new RequestError('Recruiter access is required.', 403);
  if (!result.ok) throw new Error('Recruiting store unavailable');
  return result;
}

async function reviewer(request) {
  const headers = headersForReviewer(request);
  const result = await db('road_ready_recruiting_reviewers?select=user_id&limit=1', { headers });
  if (!(await result.json()).length) throw new RequestError('Recruiter access is required.', 403);
  return headers;
}

function totalRows(result) {
  const count = result.headers.get('content-range')?.split('/')[1];
  if (!/^\d+$/.test(count || '')) throw new Error('Recruiting count unavailable');
  return Number(count);
}

export async function submitApplication(request) {
  try {
    const body = await bodyObject(request);
    if (typeof body.website === 'string' && body.website.trim()) return reply({ ok: true });
    const details = recruitingApplication(body);
    const secret = process.env.RECRUITING_INTAKE_SECRET;
    if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('Missing intake configuration');
    const rawIp = (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim();
    const source = isIP(rawIp) ? rawIp : 'unknown';
    const sourceHash = createHmac('sha256', secret).update(source).digest('hex');
    const result = await db('rpc/road_ready_submit_recruiting', {
      method: 'POST',
      headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json', 'x-recruiting-key': secret },
      body: JSON.stringify({ p_id: body.requestId, p_source_hash: sourceHash, p_details: details }),
    });
    const outcome = await result.json();
    if (outcome === 'limited') throw new RequestError('Too many applications from this network. Please try again in an hour.', 429);
    if (outcome === 'conflict') throw new RequestError('This form was already submitted. Reload to start a new application.', 409);
    if (outcome !== 'accepted') throw new Error('Recruiting submission failed');
    return reply({ ok: true }, 201);
  } catch (error) {
    return failed(error);
  }
}

export async function listApplications(request) {
  try {
    const headers = { ...await reviewer(request), Prefer: 'count=exact' };
    const params = new URL(request.url).searchParams;
    const rawPage = params.get('page') || '0';
    check(/^\d{1,6}$/.test(rawPage), 'Select a valid page.');
    const unreadQuery = db('road_ready_recruiting_applications?select=id&reviewed_at=is.null&limit=1', { method: 'HEAD', headers });
    if (params.get('count') === '1') return reply({ ok: true, unread: totalRows(await unreadQuery) });
    const offset = Number(rawPage) * PAGE_SIZE;
    const [unreadResult, listResult] = await Promise.all([
      unreadQuery,
      db('road_ready_recruiting_applications?select=id,created_at,reviewed_at,details&order=created_at.desc,id.desc'
        + '&limit=' + PAGE_SIZE + '&offset=' + offset, { headers }),
    ]);
    const applications = (await listResult.json()).map(row => ({
      id: row.id, createdAt: row.created_at, reviewedAt: row.reviewed_at, details: row.details,
    }));
    return reply({ ok: true, unread: totalRows(unreadResult), total: totalRows(listResult), applications });
  } catch (error) {
    return failed(error);
  }
}

export async function reviewApplication(request) {
  try {
    const headers = await reviewer(request);
    const { id } = await bodyObject(request);
    check(UUID.test(id), 'Select a valid application.');
    const result = await db('rpc/road_ready_review_recruiting', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }),
    });
    if (await result.json() !== true) throw new RequestError('Application could not be found.', 404);
    return reply({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
