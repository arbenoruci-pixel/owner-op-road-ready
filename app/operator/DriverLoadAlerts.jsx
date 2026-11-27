'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalClient } from './PortalSession.jsx';
import { needsHomeScreen, pushAvailable, syncLoadAlerts, unsubscribeLoadAlerts } from './loadAlerts.js';

export default function DriverLoadAlerts({ operatorId, onRefresh, noticeTarget }) {
  const client = usePortalClient();
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    let checking = false;
    let known;
    let clearNotice;
    syncLoadAlerts(client, operatorId).then(value => { if (mounted) setEnabled(value); }).catch(() => {});
    async function check() {
      if (!mounted || checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const { data, error } = await client.from('rr_lease_loads').select('id,load_number')
          .eq('operator_id', operatorId).in('status', ['assigned','picked_up']).order('updated_at', {ascending: false}).limit(100);
        if (error || !mounted) return;
        const added = known && data.filter(row => !known.has(row.id));
        known = new Set(data.map(row => row.id));
        if (added?.length) {
          setNotice(added.length === 1 ? 'New load assigned · #' + added[0].load_number : added.length + ' new loads assigned');
          clearTimeout(clearNotice);
          clearNotice = setTimeout(() => setNotice(''), 20000);
          refresh.current();
        }
      } finally { checking = false; }
    }
    const poll = () => { check().catch(() => {}); };
    const message = event => { if (event.data?.type === 'RR_LOAD_ASSIGNED') { refresh.current(); poll(); } };
    poll();
    const interval = setInterval(poll, 30000);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('focus', poll);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => {
      mounted = false;
      clearTimeout(clearNotice);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('focus', poll);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, [client, operatorId]);

  async function toggle() {
    setHelp('');
    if (needsHomeScreen()) { setHelp('In Safari, tap Share → Add to Home Screen. Open My Loads from that icon and enable alerts.'); return; }
    if (!pushAvailable()) { setHelp('This browser supports alerts while My Loads is open. For phone alerts, open the installed app on a supported device.'); return; }
    setBusy(true);
    try {
      if (enabled) { await unsubscribeLoadAlerts(client); setEnabled(false); }
      else {
        const ok = await syncLoadAlerts(client, operatorId, true);
        setEnabled(ok);
        if (!ok) setHelp('Allow notifications for My Loads in your device settings, then try again.');
      }
    } catch (error) { setHelp(error.message || 'Could not change load alerts. Please try again.'); }
    finally { setBusy(false); }
  }

  const noticeRegion = <div role="status" aria-live="polite">{notice && <strong>{notice}</strong>}</div>;
  return <div>
    <button type="button" aria-pressed={enabled} disabled={busy} onClick={toggle}>{enabled ? 'Turn off load alerts' : 'Enable load alerts'}</button>
    {help && <p role="status">{help}</p>}
    {noticeTarget ? createPortal(noticeRegion, noticeTarget) : noticeRegion}
  </div>;
}
