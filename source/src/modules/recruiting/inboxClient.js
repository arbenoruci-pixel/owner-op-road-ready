'use client';

import { useEffect, useState } from 'react';

const ENDPOINT = '/api/recruiting/applications';

export async function inboxRequest(token, query = '', options = {}) {
  const response = await fetch(ENDPOINT + query, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    const error = new Error('Could not reach the application inbox.');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Refresh only while the app is visible. Abort the previous request when the
// account, page, or refresh key changes so old responses cannot update the UI.
export function useInboxFeed(token, query, refreshKey = 0) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) return;
    let controller;
    let active = true;
    let denied = false;
    async function refresh() {
      if (!active || denied || controller || document.hidden) return;
      controller = new AbortController();
      try {
        const data = await inboxRequest(token, query, { signal: controller.signal });
        if (active) setResult({ token, query, data });
      } catch (error) {
        if (!active) return;
        denied = error.status === 401 || error.status === 403;
        setResult({ token, query, error: error.status || 503 });
      } finally {
        controller = null;
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [token, query, refreshKey]);

  return token && result?.token === token && result.query === query ? result : null;
}
