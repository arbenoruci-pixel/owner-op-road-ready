const storageKey = 'road-ready-pending-pod-invoice';
const lifetimeMs = 15 * 60 * 1000;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

// A sign-in email can open a new tab. Store only the load ID for this origin and mailbox.
export function rememberPodInvoice(email, browser = window) {
  try {
    const url = new URL(browser.location.href);
    if (url.pathname !== '/operator' || url.origin !== browser.location.origin) return;
    const values = url.searchParams.getAll('podInvoice');
    if (values.length === 1 && uuid.test(values[0])) {
      const intent = { loadId: values[0].toLowerCase(), email: email.trim().toLowerCase(), created: Date.now() };
      browser.localStorage.setItem(storageKey, JSON.stringify(intent));
    } else {
      takePodInvoice(email, browser);
    }
  } catch {
    // Sign-in still works if storage is unavailable.
  }
}

export function takePodInvoice(email, browser = window) {
  try {
    const url = new URL(browser.location.href);
    if (url.origin !== browser.location.origin || !['/operator', '/operator/confirm'].includes(url.pathname)) return;
    const intent = JSON.parse(browser.localStorage.getItem(storageKey));
    if (!intent) return;
    const age = Date.now() - intent.created;
    if (!Number.isFinite(intent.created) || age < 0 || age >= lifetimeMs || typeof intent.loadId !== 'string' || !uuid.test(intent.loadId)) {
      browser.localStorage.removeItem(storageKey);
      return;
    }
    if (!email || intent.email !== email.trim().toLowerCase()) return;
    browser.localStorage.removeItem(storageKey);
    return intent.loadId;
  } catch {
    // A sign-in without a usable intent opens the normal workspace.
  }
}
