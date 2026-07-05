'use client';

import React from 'react';
import App from '../source/src/App.jsx';

async function clearCachesAndWorkersOnce() {
  try {
    if (typeof window === 'undefined') return;
    const key = 'owner-op-road-ready-v95-47-cache-cleaned';
    if (window.localStorage?.getItem(key)) return;

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((cacheKey) => caches.delete(cacheKey)));
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }

    window.localStorage?.setItem(key, '1');
  } catch (error) {
    console.warn('Road Ready cache cleanup skipped', error);
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
          <p style={{ color:'#4b5563', fontSize:15, fontWeight:700, lineHeight:1.35, margin:'0 0 14px' }}>A cached build or local test data may be blocking the app.</p>
          {this.state.message ? <p style={{ color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:10, fontSize:12, fontWeight:800 }}>{this.state.message}</p> : null}
          <a href="/?rrreset=1" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', minHeight:52, borderRadius:15, background:'#2f5bd8', color:'#fff', textDecoration:'none', fontSize:17, fontWeight:900 }}>Reset local app and reload</a>
          <small style={{ display:'block', color:'#667085', fontSize:12, fontWeight:750, lineHeight:1.35, marginTop:10 }}>This clears local test data on this phone.</small>
        </section>
      </main>
    );
  }
}

export default function RoadReadyClient() {
  React.useEffect(() => {
    document.body.dataset.roadReadyReady = '1';
    const recovery = document.getElementById('road-ready-recovery');
    if (recovery) recovery.style.display = 'none';
    clearCachesAndWorkersOnce();
  }, []);

  return (
    <RoadReadyErrorBoundary>
      <App />
    </RoadReadyErrorBoundary>
  );
}
