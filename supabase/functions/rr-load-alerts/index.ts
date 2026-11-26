import webpush from 'npm:web-push@3.6.7';

const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sender = 'mailto:nartaexpress@hotmail.com';

async function rpc(name: string, args: object = {}) {
  const res = await fetch(base + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

function requestFor(endpoint: string, keys: object, vapid: {publicKey:string; privateKey:string}, loadId: string) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !/^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)$/.test(url.hostname)) {
    throw new Error('Unsupported push service');
  }
  return webpush.generateRequestDetails({endpoint, keys}, JSON.stringify({loadId}), {
    TTL: 3600, urgency: 'high', topic: loadId.replaceAll('-', ''),
    vapidDetails: {subject: sender, publicKey: vapid.publicKey, privateKey: vapid.privateKey},
  });
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response(null, {status: 405});
  const token = req.headers.get('x-rr-worker-token');
  if (!token || !/^[0-9a-f-]{72}$/.test(token)) return new Response(null, {status: 403});
  try {
    const vapid = await rpc('rr_load_push_worker_config', {p_token: token, p_new_keys: webpush.generateVAPIDKeys()});
    const payload = await req.json();
    if (payload.verify === true) {
      const testKey = webpush.generateVAPIDKeys().publicKey;
      const details = requestFor('https://web.push.apple.com/diagnostic', {p256dh: testKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA'}, vapid, crypto.randomUUID());
      if (!details.body?.length || !details.headers.Authorization) throw new Error('Web Push signing check failed');
    }
    const jobs = await rpc('rr_load_push_claim');
    let accepted = 0;
    await Promise.all(jobs.map(async (job: {job:number; token:string; load_id:string; endpoint:string; p256dh:string; auth_key:string}) => {
      let status = 0;
      try {
        const details = requestFor(job.endpoint, {p256dh:job.p256dh, auth:job.auth_key}, vapid, job.load_id);
        const result = await fetch(details.endpoint, {method:'POST', headers:details.headers,
          body:details.body, redirect:'error', signal:AbortSignal.timeout(12000)});
        status = result.status;
        await result.body?.cancel();
        if (result.ok) accepted++;
      } catch { /* Timeouts are retried by the database queue. */ }
      await rpc('rr_load_push_finish', {p_job:job.job, p_token:job.token, p_status:status});
    }));
    return Response.json({claimed:jobs.length, accepted, signingChecked:payload.verify === true});
  } catch (error) {
    console.error('Load alert worker:', error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[endpoint]') : 'failed');
    return new Response('Worker request failed', {status:503});
  }
});
