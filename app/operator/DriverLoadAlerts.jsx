'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalClient } from './PortalSession.jsx';
import { needsHomeScreen, pushAvailable, readPhoneAlertSettings, enablePhoneAlerts, disablePhoneAlerts } from './loadAlerts.js';

export function DriverPhoneAlertSettings({operatorId,noticeOnly=false}) {
  const client = usePortalClient();
  const [settings,setSettings] = useState(null);
  const [busy,setBusy] = useState(false);
  const [help,setHelp] = useState('');
  const pending = useRef(false);
  const revision = useRef(0);
  const refresh = useRef(null);

  useEffect(() => {
    let mounted = true;
    pending.current = false;
    setBusy(false);setSettings(null);setHelp('');
    const read = async () => {
      if (!mounted || pending.current || document.visibilityState === 'hidden') return;
      const current = ++revision.current;
      try {
        const next = await readPhoneAlertSettings(client,operatorId);
        if (mounted && current === revision.current) {setSettings(next);setHelp('');}
      } catch {
        if (mounted && current === revision.current) {
          setSettings(null);
          setHelp('Could not load your phone alert settings.');
        }
      }
    };
    refresh.current = read;
    void read();
    window.addEventListener('focus',read);
    document.addEventListener('visibilitychange',read);
    window.addEventListener('rr-phone-alerts-changed',read);
    return () => {
      mounted = false;
      revision.current++;
      refresh.current = null;
      window.removeEventListener('focus',read);
      document.removeEventListener('visibilitychange',read);
      window.removeEventListener('rr-phone-alerts-changed',read);
    };
  },[client,operatorId]);

  async function toggle(channel) {
    if (pending.current || !settings) return;
    setHelp('');
    if (needsHomeScreen()) {
      setHelp('In Safari, tap Share → Add to Home Screen. Open My Loads from that icon to enable phone alerts.');
      return;
    }
    if (!pushAvailable()) {
      setHelp('Open My Loads as an installed app on a device that supports phone notifications.');
      return;
    }
    const current = ++revision.current;
    pending.current = true;setBusy(true);
    try {
      const turningOn = !settings[channel];
      if (turningOn) {
        if (!await enablePhoneAlerts(client,operatorId,channel)) {
          if (revision.current === current) setHelp('Allow My Loads notifications in your device settings, then try again.');
          return;
        }
      } else await disablePhoneAlerts(client,operatorId,channel);
      if (revision.current === current) {
        setSettings(previous=>({...previous,[channel]:turningOn}));
        window.dispatchEvent(new Event('rr-phone-alerts-changed'));
      }
    } catch (e) {
      if (revision.current === current) setHelp(e.message || 'Could not change phone alerts. Please try again.');
    } finally {
      if (revision.current === current) {pending.current = false;setBusy(false);}
    }
  }

  const channels = noticeOnly ? ['notices'] : ['loads','notices'];
  return <div style={{display:'grid',gap:8}}>
    {channels.map(channel=>{
      const enabled = settings?.[channel] === true;
      const text = channel === 'notices' ? 'notice alerts' : 'load alerts';
      return <button key={channel} type="button" disabled={busy || !settings} aria-pressed={enabled}
        onClick={()=>toggle(channel)}>{enabled ? 'Turn off '+text : 'Enable '+text}</button>;
    })}
    {help && <p role="status">{help}</p>}
    {help && !settings && <button type="button" onClick={()=>refresh.current?.()}>Retry phone alert settings</button>}
  </div>;
}

export default function DriverLoadAlerts({ operatorId, onRefresh, noticeTarget }) {
  const client = usePortalClient();
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    let checking = false;
    let known;
    let clearNotice;
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

  const noticeRegion = <div role="status" aria-live="polite">{notice && <strong>{notice}</strong>}</div>;
  return <div>
    <DriverPhoneAlertSettings operatorId={operatorId}/>
    {noticeTarget ? createPortal(noticeRegion, noticeTarget) : noticeRegion}
  </div>;
}
