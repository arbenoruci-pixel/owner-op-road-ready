self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let tag = 'rr-load-assigned';
  try {
    const data = event.data?.json();
    if (/^[0-9a-f-]{36}$/i.test(data?.loadId || '')) tag += '-' + data.loadId;
  } catch { /* A provider wake-up can arrive without a payload. */ }
  event.waitUntil((async () => {
    await self.registration.showNotification('RoadReady · New load assigned', {
      body: 'Open My Loads to see your rate confirmation and pickup details.',
      tag, icon: '/icon-192.png',
    });
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const page of windows) {
      if (new URL(page.url).pathname.replace(/\/$/, '') === '/operator') page.postMessage({type: 'RR_LOAD_ASSIGNED'});
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const page = windows.find(item => new URL(item.url).pathname.replace(/\/$/, '') === '/operator');
    if (page) {
      await page.navigate(new URL('/operator', self.location.origin).href);
      return page.focus();
    }
    return self.clients.openWindow('/operator');
  })());
});
