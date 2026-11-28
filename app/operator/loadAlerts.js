const scope = '/operator';
const workerPath = '/operator-load-alerts-sw.js?v=notices1';

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

async function currentSubscription() {
  const registration = await ownRegistration();
  return registration?.pushManager?.getSubscription();
}

export async function readPhoneAlertSettings(client, operatorId) {
  if (pushAvailable() && Notification.permission === 'granted') {
    const subscription = await currentSubscription();
    if (subscription) {
      const data = await call(client,'rr_driver_push_preferences',{p_operator:operatorId,p_endpoint:subscription.endpoint});
      if (typeof data?.loads !== 'boolean' || typeof data?.notices !== 'boolean') throw new Error('Phone alert settings are unavailable.');
      return data;
    }
  }
  return {loads:false,notices:false};
}

async function registrationForAlerts() {
  // Ensure an installed legacy worker cannot label a new driver notice as an assigned load.
  const registration = await navigator.serviceWorker.register(workerPath, {scope,updateViaCache:'none'});
  const scriptURL = new URL(workerPath, location.origin).href;
  const worker = [registration.installing,registration.waiting,registration.active].find(candidate => candidate?.scriptURL === scriptURL);
  if (!worker) throw new Error('Reopen My Loads and try enabling alerts again.');
  await new Promise((resolve,reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange',check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (registration.active?.scriptURL === scriptURL && registration.active.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('Try enabling alerts again.'));
    };
    const timer = setTimeout(() => finish(new Error('Reopen My Loads and try enabling alerts again.')),15000);
    worker.addEventListener('statechange',check);
    check();
  });
  return registration;
}

export async function enablePhoneAlerts(client, operatorId, channel) {
  // Keep the permission prompt within the driver's tap, before any asynchronous lookup.
  if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') return false;
  const registration = await registrationForAlerts();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const key = await call(client,'rr_load_push_public_key');
    if (!key) throw new Error('Phone alerts are still starting. Try again shortly.');
    const raw = atob(key.replace(/-/g,'+').replace(/_/g,'/'));
    subscription = await registration.pushManager.subscribe({userVisibleOnly:true,
      applicationServerKey:Uint8Array.from(raw, ch => ch.charCodeAt(0))});
  }
  const rpc = channel === 'notices' ? 'rr_driver_notice_push_subscribe' : 'rr_load_push_subscribe';
  await call(client,rpc,{p_operator:operatorId,p_subscription:subscription.toJSON()});
  return true;
}

export async function disablePhoneAlerts(client, operatorId, channel) {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const args = {p_endpoint:subscription.endpoint};
  if (channel === 'notices') {
    await call(client,'rr_driver_notice_push_unsubscribe',{p_operator:operatorId,...args});
  } else {
    await call(client,'rr_load_push_unsubscribe',args);
  }
}

export async function forgetDriverPhoneAlerts(client) {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const mayRemove = await call(client,'rr_driver_push_forget_device',{p_endpoint:subscription.endpoint});
  if (mayRemove === true) await subscription.unsubscribe();
}
