'use client';

import React from 'react';
import App from '../source/src/App.jsx';

const OWNER_OP_DB_NAME = 'owner-op-road-ready-offline-v1';
const CACHE_CLEAN_KEY = 'owner-op-road-ready-v95-46-cache-cleaned';

async function clearCachesAndOldWorkers() {
  try {
    if (typeof window === 'undefined') return;
    if (window.localStorage?.getItem(CACHE_CLEAN_KEY)) return;

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    // Emergency cache breaker for the bad v95.44/v95.45 deploy. The current app
    // does not rely on service-worker fetch caching, so unregistering is safe.
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }

    window.localStorage?.setItem(CACHE_CLEAN_KEY, '1');
  } catch (error) {
    console.warn('Road Ready cache cleanup skipped', error);
  }
}

function deleteDatabase(name) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function resetRoadReadyAndReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    window.localStorage?.removeItem(CACHE_CLEAN_KEY);
    await deleteDatabase(OWNER_OP_DB_NAME);
  } finally {
    window.location.reload();
  }
}

class RoadReadyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed:false, message:'' };
  }

  static getDerivedStateFromError(error) {
    return { crashed:true, message:error?.message || 'App failed to load.' };
  }

  componentDidCatch(error, info) {
    console.error('Owner-Op Road Ready crashed', error, info);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#f4f6f8', padding:20, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <section style={{ width:'100%', maxWidth:420, background:'#fff', border:'1px solid #dbe2ea', borderRadius:20, padding:18, boxShadow:'0 12px 36px rgba(15,23,42,.12)' }}>
          <b style={{ display:'block', color:'#111827', fontSize:24, lineHeight:1.1, marginBottom:8 }}>Road Ready could not open</b>
          <p style={{ color:'#4b5563', fontSize:15, fontWeight:700, lineHeight:1.35, margin:'0 0 14px' }}>A bad cached build or damaged local test data may be blocking the app.</p>
          {this.state.message ? <p style={{ color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:10, fontSize:12, fontWeight:800 }}>{this.state.message}</p> : null}
          <button onClick={resetRoadReadyAndReload} style={{ width:'100%', minHeight:52, border:0, borderRadius:15, background:'#2f5bd8', color:'#fff', fontSize:17, fontWeight:900 }}>Reset local app and reload</button>
          <small style={{ display:'block', color:'#667085', fontSize:12, fontWeight:750, lineHeight:1.35, marginTop:10 }}>This clears local test data on this phone. Use only if the app will not open.</small>
        </section>
      </main>
    );
  }
}

export default function RoadReadyClient() {
  React.useEffect(() => {
    clearCachesAndOldWorkers();
  }, []);

  return (
    <RoadReadyErrorBoundary>
      <App />
    </RoadReadyErrorBoundary>
  );
}
