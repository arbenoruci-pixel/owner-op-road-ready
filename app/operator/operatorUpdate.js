const reloadKey = 'rr-operator-release-reload';
const authParams = ['code', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_description'];

function signInReturn(url) {
  const { pathname, searchParams, hash } = new URL(url);
  const fragment = new URLSearchParams(hash.slice(1));
  return pathname.replace(/\/$/, '') === '/operator/confirm' ||
    authParams.some(name => searchParams.has(name) || fragment.has(name));
}

let uploads = 0;
export async function trackPodUpload(request) {
  uploads++;
  try { return await request; }
  finally {
    uploads--;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('rr-pod-upload-settled'));
  }
}

function controlValue(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
  return field.isContentEditable ? field.textContent : field.value;
}

export function watchOperatorBuild(win, doc, build, report) {
  const navigation = win.performance?.getEntriesByType?.('navigation')[0];
  if (!build || signInReturn(win.location.href) || (navigation && signInReturn(navigation.name))) {
    return { stop() {}, apply() {} };
  }

  const lifetime = new AbortController();
  const initial = new WeakMap();
  const edited = new Set();
  const actions = new Set();
  let touched = false;
  let onlyNavigated = true;
  let interactions = 0;
  let wasHidden = false;
  let latest = null;
  let checking = false;
  let reloading = false;
  let observer;
  let retryTimer;

  function hasWork() {
    if (uploads || doc.querySelector('[data-operator-update-pending="true"], [aria-busy="true"], [role="dialog"], dialog[open], video')) return true;
    if (Array.from(doc.querySelectorAll('input, textarea')).some(field => {
      if (field.type === 'file') return field.files?.length;
      if (field.closest('[data-operator-update-pending]')) return false;
      // The browser can restore or autofill entries before React subscribes.
      return ['email','password'].includes(field.type) && field.value ||
        ['text','search','tel','url','number','textarea'].includes(field.type) && field.value !== field.defaultValue;
    })) return true;
    for (const field of edited) {
      if (!field.isConnected || controlValue(field) === initial.get(field)) edited.delete(field);
      else return true;
    }
    for (const button of actions) {
      if (!button.isConnected) actions.delete(button);
      else if (button.disabled) return true;
    }
    return false;
  }

  function updateNotice() {
    if (latest && !reloading) report(hasWork() ? 'busy' : 'ready');
  }

  function interact(event) {
    const target = event.target;
    if (!target?.closest || target.closest('[data-operator-update-control]')) return;
    touched = true;
    interactions++;
    if (!target.closest('[data-operator-navigation], summary')) onlyNavigated = false;
    const button = event.submitter || target.closest('button');
    if (button) actions.add(button);
    if (target.matches('input,textarea,select,[contenteditable="true"]') &&
        !target.closest('[data-operator-update-pending]') &&
        // The workspace selector and date filters navigate between views.
        (target.tagName !== 'SELECT' || target.form || target.closest('[role="dialog"]'))) {
      if (event.type === 'input' || event.type === 'change') {
        if (!initial.has(target)) {
          const defaultValue = ['checkbox','radio'].includes(target.type) ? target.defaultChecked : target.defaultValue;
          initial.set(target, defaultValue);
        }
        edited.add(target);
      } else if (!initial.has(target)) initial.set(target, controlValue(target));
    }
    if (latest) queueMicrotask(updateNotice);
  }

  function reload(manual) {
    if (!latest || reloading || doc.visibilityState !== 'visible' || win.navigator.onLine === false ||
        signInReturn(win.location.href) || hasWork()) { updateNotice(); return; }
    try {
      const previous = JSON.parse(win.sessionStorage.getItem(reloadKey) || 'null');
      if (!manual && previous &&
          (previous.from === build && previous.to === latest || Date.now() - previous.time < 60000)) {
        updateNotice();
        return;
      }
      win.sessionStorage.setItem(reloadKey, JSON.stringify({ from:build, to:latest, time:Date.now() }));
    } catch {
      // A storage-restricted web view cannot guard a recurring automatic reload.
      if (!manual) { updateNotice(); return; }
    }
    reloading = true;
    win.location.reload();
  }

  async function check(manual = false, resumed = false) {
    if (checking || reloading || doc.visibilityState !== 'visible' || win.navigator.onLine === false || signInReturn(win.location.href)) return;
    checking = true;
    const startingInteractions = interactions;
    const request = new AbortController();
    const cancel = () => request.abort();
    lifetime.signal.addEventListener('abort', cancel, {once:true});
    retryTimer = win.setTimeout(cancel, 8000);
    try {
      const response = await win.fetch('/app-version.json?operator=' + Date.now(), {
        cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error', signal:request.signal,
      });
      if (!response.ok) return;
      const metadata = await response.json();
      if (lifetime.signal.aborted || typeof metadata?.build !== 'string' || !/^[\w.-]{1,200}$/.test(metadata.build)) return;
      latest = metadata.build === build ? null : metadata.build;
      if (!latest) { observer?.disconnect(); report(null); return; }
      if (!observer) observer = new win.MutationObserver(updateNotice);
      observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['disabled','aria-busy','data-operator-update-pending','open','value','checked']});
      const passiveResume = resumed && onlyNavigated && interactions === startingInteractions &&
        doc.querySelector('[data-operator-passive-view="true"]');
      if (manual || !touched || passiveResume) reload(manual);
      else updateNotice();
    } catch { /* Offline and interrupted requests keep the current workspace open. */ }
    finally {
      win.clearTimeout(retryTimer);
      lifetime.signal.removeEventListener('abort', cancel);
      checking = false;
    }
  }

  function foreground(event) {
    if (doc.visibilityState !== 'visible') { wasHidden = true; return; }
    const resumed = wasHidden || (event.type === 'pageshow' && event.persisted === true);
    wasHidden = false;
    void check(false, resumed);
  }

  const events = ['pointerdown','keydown','focusin','click','input','change','submit','drop'];
  events.forEach(type => doc.addEventListener(type, interact, true));
  doc.addEventListener('visibilitychange', foreground);
  win.addEventListener('pageshow', foreground);
  win.addEventListener('online', foreground);
  win.addEventListener('rr-pod-upload-settled', updateNotice);
  void check();

  return {
    apply() { return check(true); },
    stop() {
      lifetime.abort();
      observer?.disconnect();
      events.forEach(type => doc.removeEventListener(type, interact, true));
      doc.removeEventListener('visibilitychange', foreground);
      win.removeEventListener('pageshow', foreground);
      win.removeEventListener('online', foreground);
      win.removeEventListener('rr-pod-upload-settled', updateNotice);
    },
  };
}
