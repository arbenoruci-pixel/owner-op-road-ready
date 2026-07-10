const OWNER_OP_SW_VERSION = '95.95.0';

async function clearAllCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

async function notifyClients(type) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage({ type, version: OWNER_OP_SW_VERSION });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.clients.claim();
    await notifyClients('OWNER_OP_SW_READY');
  })());
});

self.addEventListener('message', (event) => {
  const type = event?.data?.type;
  if (type === 'OWNER_OP_APPLY_UPDATE' || type === 'OWNER_OP_SKIP_WAITING') {
    event.waitUntil((async () => {
      await clearAllCaches();
      await self.skipWaiting();
      event.source?.postMessage?.({
        type: 'OWNER_OP_SW_UPDATE_ACK',
        version: OWNER_OP_SW_VERSION,
      });
    })());
    return;
  }

  if (type === 'OWNER_OP_GET_VERSION') {
    event.source?.postMessage?.({ type: 'OWNER_OP_SW_VERSION', version: OWNER_OP_SW_VERSION });
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'owner-op-sync') return;
  event.waitUntil(notifyClients('OWNER_OP_BACKGROUND_SYNC'));
});
