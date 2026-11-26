const scope = '/operator';
const workerPath = '/operator-load-alerts-sw.js';

export function pushAvailable() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function needsHomeScreen() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches;
}

async function ownRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  return registration?.scope === new URL(scope, location.origin).href ? registration : null;
}

async function call(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function syncLoadAlerts(client, operatorId, enable = false) {
  if (!pushAvailable()) return false;
  if (enable && Notification.permission !== 'granted') {
    if (await Notification.requestPermission() !== 'granted') return false;
  }
  if (Notification.permission !== 'granted') return false;
  let registration = await ownRegistration();
  if (!registration && !enable) return false;
  if (!registration) registration = await navigator.serviceWorker.register(workerPath, { scope, updateViaCache: 'none' });
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (!worker) throw new Error('Please reopen the app and try again.');
    await new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); worker.removeEventListener('statechange', check); };
      const check = () => {
        if (worker.state === 'activated') { finish(); resolve(); }
        if (worker.state === 'redundant') { finish(); reject(new Error('Try enabling alerts again.')); }
      };
      const timer = setTimeout(() => { finish(); reject(new Error('Please reopen the app and try again.')); }, 15000);
      worker.addEventListener('statechange', check);
      check();
    });
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && !enable) return false;
  if (!subscription) {
    const key = await call(client, 'rr_load_push_public_key');
    if (!key) throw new Error('Load alerts are still starting. Try again shortly.');
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0)),
    });
  }
  await call(client, 'rr_load_push_subscribe', { p_operator: operatorId, p_subscription: subscription.toJSON() });
  return true;
}

export async function unsubscribeLoadAlerts(client) {
  const registration = await ownRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try {
    await call(client, 'rr_load_push_unsubscribe', { p_endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe();
  }
}
