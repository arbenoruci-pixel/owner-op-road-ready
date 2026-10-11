// Browser-test responses only. Never forward these synthetic account requests.
export const fixtureCloudOrigin = 'https://ghwkcgczuwctzxsxmqzx.supabase.co';

export async function fixtureCorsHeaders(request, origin) {
  const headers = await request.allHeaders();
  // Include the actual request headers when Playwright handles the request
  // without exposing a separate preflight event (notably WebKit).
  const allowed = new Set([
    'authorization', 'apikey', 'content-type', 'x-client-info', 'x-supabase-api-version',
    ...Object.keys(headers),
    ...(headers['access-control-request-headers'] || '').split(',').map(h => h.trim()).filter(Boolean),
  ]);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': [...allowed].join(','),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function fulfillLocalAccountSettings(route, origin, user) {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== fixtureCloudOrigin || url.pathname !== '/rest/v1/road_ready_backup_settings') return false;
  const headers = await fixtureCorsHeaders(request, origin);
  if (request.method() === 'OPTIONS') {
    await route.fulfill({status: 204, body: '', headers});
  } else if (request.method() === 'GET' && url.searchParams.get('user_id') === `eq.${user.id}` && url.searchParams.get('select') === 'record_sync_enabled') {
    const row = {record_sync_enabled: false};
    const accept = (await request.allHeaders()).accept || '';
    // maybeSingle GET uses application/json and unwraps its one-element array.
    await route.fulfill({json: accept.includes('vnd.pgrst.object') ? row : [row], headers});
  } else {
    await route.fulfill({status: 403, json: {error: 'Synthetic fixture: account settings writes or foreign users are blocked'}, headers});
  }
  return true;
}

export async function installLocalAccountSettings(context, user) {
  // Local feature tests never exercise cloud synchronization. Answer its single
  // settings read in-page, so pagehide/reload cannot leave a cross-origin fetch
  // pending in WebKit. The context route still denies writes and unknown URLs.
  await context.addInitScript(({cloudOrigin, userId}) => {
    // Feature fixtures predate session ownership. Upgrade only their synthetic
    // JWT on navigation; never manufacture or alter a real account session.
    try {
      const key='owner-op-prototype-auth-v1',session=JSON.parse(localStorage.getItem(key)||'null');
      if(session?.user?.id===userId&&session.access_token?.endsWith('.synthetic')){
        const parts=session.access_token.split('.'),claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
        if(claims.sub===userId&&!claims.session_id){claims.session_id=crypto.randomUUID();parts[1]=btoa(JSON.stringify(claims)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');session.access_token=parts.join('.');localStorage.setItem(key,JSON.stringify(session));}
      }
    } catch {}
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input), location.href);
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      if(url.origin===cloudOrigin&&url.pathname==='/rest/v1/rpc/road_ready_active_device_v1'&&method==='POST'){
        const token=new Headers(init.headers||request?.headers).get('authorization')?.replace(/^Bearer /,'');
        try{const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(token.endsWith('.synthetic')&&claims.sub===userId&&claims.session_id)return Promise.resolve(new Response(JSON.stringify({active:true,generation:1,receive:false}),{status:200,headers:{'Content-Type':'application/json'}}));}catch{}
        return Promise.resolve(new Response(JSON.stringify({error:'Synthetic fixture: foreign device session blocked'}),{status:403,headers:{'Content-Type':'application/json'}}));
      }
      if (url.origin === cloudOrigin && url.pathname === '/rest/v1/road_ready_backup_settings' && method === 'GET' && url.searchParams.get('select') === 'record_sync_enabled' && url.searchParams.get('user_id') === `eq.${userId}`) {
        const headers = new Headers(init.headers || request?.headers);
        const row = {record_sync_enabled: false};
        return Promise.resolve(new Response(JSON.stringify(headers.get('accept')?.includes('vnd.pgrst.object') ? row : [row]), {status: 200, headers: {'Content-Type': 'application/json'}}));
      }
      return nativeFetch(input, init);
    };
  }, {cloudOrigin: fixtureCloudOrigin, userId: user.id});
}

export async function installFixtureBinaryReader(context) {
  await context.addInitScript(() => {
    window.__rrFixtureBlob = value => {
      if (value instanceof Blob) return value;
      if (value?.__roadReadyStoredBinaryV110458 === 1 && value.bytes instanceof ArrayBuffer && value.size === value.bytes.byteLength) return new Blob([value.bytes], {type: value.type});
      throw new Error('Fixture found invalid persisted document bytes');
    };
  });
}
