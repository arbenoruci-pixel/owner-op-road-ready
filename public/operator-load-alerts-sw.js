self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function operatorWindows() {
  const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  return windows.filter(page => {
    const url = new URL(page.url);
    return url.origin === self.location.origin && url.pathname.replace(/\/$/, '') === '/operator';
  });
}

self.addEventListener('push', event => {
  let data;
  try {data = event.data?.json();} catch { /* Keep support for earlier load wake-ups. */ }
  const notice = uuid.test(data?.noticeId) && uuid.test(data?.operatorId);
  const message = notice
    ? {type:'RR_DRIVER_NOTICE',noticeId:data.noticeId,operatorId:data.operatorId}
    : {type:'RR_LOAD_ASSIGNED'};
  const tag = notice ? 'rr-driver-notice-'+data.noticeId :
    'rr-load-assigned'+(uuid.test(data?.loadId) ? '-'+data.loadId : '');
  event.waitUntil((async () => {
    await self.registration.showNotification(notice ? 'RoadReady · New driver notice' : 'RoadReady · New load assigned', {
      body:notice ? 'Open Driver notices to read the update from your fleet.' :
        'Open My Loads to see your rate confirmation and pickup details.',
      tag,icon:'/icon-192.png',data:message,
    });
    for (const page of await operatorWindows()) page.postMessage(message);
  })());
});

function openNoticeInPage(page, data) {
  // Wait for the authenticated app to accept the link. A restoring window may
  // not have installed its listeners yet, so retain the URL fallback.
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = handled => { clearTimeout(timer);channel.port1.close();resolve(handled); };
    const timer = setTimeout(()=>finish(false),700);
    channel.port1.onmessage = event => finish(event.data?.handled === true);
    try {page.postMessage({...data,type:'RR_DRIVER_NOTICE_OPEN'},[channel.port2]);}
    catch {finish(false);}
  });
}

self.addEventListener('notificationclick', event => {
  const data = event.notification.data;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await operatorWindows();
    if (data?.type === 'RR_DRIVER_NOTICE' && uuid.test(data.noticeId) && uuid.test(data.operatorId)) {
      for (const page of windows) {
        if (await openNoticeInPage(page,data)) return page.focus();
      }
      return self.clients.openWindow('/operator?notice='+data.noticeId+'&noticeOperator='+data.operatorId);
    }
    if (windows.length) {
      await windows[0].navigate(new URL('/operator',self.location.origin).href);
      return windows[0].focus();
    }
    return self.clients.openWindow('/operator');
  })());
});
