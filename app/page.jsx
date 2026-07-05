import RoadReadyClient from './road-ready-client.jsx';

const recoveryScript = `
(function () {
  var shown = false;
  function showRecovery() {
    if (shown) return;
    shown = true;
    var el = document.getElementById('road-ready-recovery');
    if (el) el.style.display = 'grid';
  }
  function clearRoadReadyStorage() {
    var jobs = [];
    try {
      if ('serviceWorker' in navigator) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
        }));
      }
    } catch (e) {}
    try {
      if ('caches' in window) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }));
      }
    } catch (e) {}
    try {
      localStorage.removeItem('owner-op-road-ready-v95-46-cache-cleaned');
      localStorage.removeItem('owner-op-road-ready-v95-47-cache-cleaned');
    } catch (e) {}
    try {
      if ('indexedDB' in window) {
        jobs.push(new Promise(function (resolve) {
          var req = indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');
          req.onsuccess = req.onerror = req.onblocked = function () { resolve(); };
        }));
      }
    } catch (e) {}
    return Promise.allSettled(jobs);
  }
  var params = new URLSearchParams(window.location.search || '');
  if (params.has('rrreset')) {
    document.documentElement.style.background = '#f4f6f8';
    document.addEventListener('DOMContentLoaded', showRecovery);
    clearRoadReadyStorage().then(function () {
      window.location.replace('/?recovered=' + Date.now());
    });
    return;
  }
  window.addEventListener('error', showRecovery);
  window.addEventListener('unhandledrejection', showRecovery);
  setTimeout(function () {
    if (!document.body || document.body.dataset.roadReadyReady !== '1') showRecovery();
  }, 1800);
})();
`;

export default function Page() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: recoveryScript }} />
      <div id="road-ready-recovery" style={{ display:'none', minHeight:'100vh', placeItems:'center', background:'#f4f6f8', padding:20, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <section style={{ width:'100%', maxWidth:420, background:'#fff', border:'1px solid #dbe2ea', borderRadius:20, padding:18, boxShadow:'0 12px 36px rgba(15,23,42,.12)' }}>
          <b style={{ display:'block', color:'#111827', fontSize:25, lineHeight:1.1, marginBottom:8 }}>Road Ready did not finish opening</b>
          <p style={{ color:'#4b5563', fontSize:15, fontWeight:750, lineHeight:1.35, margin:'0 0 14px' }}>A bad cached build or damaged local test data may still be stuck on this phone.</p>
          <a href="/?rrreset=1" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', minHeight:54, borderRadius:15, background:'#2f5bd8', color:'#fff', textDecoration:'none', fontSize:17, fontWeight:950 }}>Reset local app and reload</a>
          <a href="/?v=9547" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', minHeight:46, borderRadius:14, border:'1px solid #dbe2ea', background:'#fff', color:'#111827', textDecoration:'none', fontSize:15, fontWeight:900, marginTop:8 }}>Try reload without reset</a>
          <small style={{ display:'block', color:'#667085', fontSize:12, fontWeight:750, lineHeight:1.35, marginTop:10 }}>Reset clears local test data on this phone. Use it only if the app stays blank.</small>
        </section>
      </div>
      <RoadReadyClient />
    </>
  );
}
