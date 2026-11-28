'use client';
import React, { useEffect, useRef, useState } from 'react';
import { usePortalClient } from './PortalSession.jsx';
import { DriverPhoneAlertSettings } from './DriverLoadAlerts.jsx';
import css from './driverNotices.module.css';

function PublishNotice({ workspaceId, onPublished }) {
  const client = usePortalClient();
  const intent = useRef(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState(false);

  async function publish(event) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const title = fields.get('title').trim();
    const message = fields.get('message').trim();
    const source = fields.get('source').trim() || null;
    setError('');
    setPublished(false);
    if (!title || !message || (source && !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(source))) {
      setError('Enter a title, a message and a valid HTTPS source if applicable.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const content = JSON.stringify([workspaceId, title, message, source]);
      if (intent.current?.content !== content) intent.current = {content, key:'dispatch:' + crypto.randomUUID()};
      const {error} = await client.rpc('rr_driver_notice_publish', {
        p_workspace: workspaceId, p_key: intent.current.key, p_title: title, p_message: message, p_source_url: source,
      });
      if (error) throw error;
      intent.current = null;
      form.reset();
      setPublished(true);
      onPublished();
    } catch {
      setError('Could not confirm publication. Retry with the same details.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <details className={css.composer}>
    <summary>Write a driver notice</summary>
    <form className={css.form} onSubmit={publish}>
      <label>Title<input name="title" maxLength={120} required disabled={busy}/></label>
      <label>What drivers need to know or do<textarea name="message" maxLength={1800} required disabled={busy}/></label>
      <label>Source link (optional)<input type="url" name="source" maxLength={1600} disabled={busy} placeholder="https://"/></label>
      <button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish to fleet drivers'}</button>
      {error && <p role="alert">{error}</p>}
      {published && <p role="status">Published to your fleet.</p>}
    </form>
  </details>;
}

const pageSize = 20;
const noticeIdPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const noticeDate = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric'});

export default function DriverNotices({operatorId, publish = false, openNotice:requestedNotice, onNoticeOpened}) {
  const client = usePortalClient();
  const inbox = useRef(null), previousTop = useRef(null), lastFocused = useRef(null), resolved = useRef(null);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [target, setTarget] = useState(null);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  const [readError, setReadError] = useState('');
  const [alert, setAlert] = useState(null);
  const reload = () => setRefresh(n => n + 1);

  function openNotice(id, request = null) {
    if (!noticeIdPattern.test(id || '')) return;
    if (inbox.current) inbox.current.open = true;
    setAlert(null);
    setTarget({id, request});
  }

  useEffect(() => {
    if (requestedNotice?.operatorId === operatorId) openNotice(requestedNotice.noticeId, requestedNotice);
  }, [requestedNotice, operatorId]);

  useEffect(() => {
    function refreshVisible() { if (document.visibilityState === 'visible') reload(); }
    function message(event) {
      const data = event.data;
      if (data?.type === 'RR_DRIVER_NOTICE' && (!data.operatorId || data.operatorId === operatorId)) refreshVisible();
    }
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, [operatorId]);

  useEffect(() => {
    const control = new AbortController();
    async function getPage(number) {
      const {data, error} = await client.rpc('rr_driver_notices',{p_operator:operatorId,p_page:number}).abortSignal(control.signal);
      if (error || !Array.isArray(data?.items)) throw Error();
      return data;
    }
    async function load() {
      const first = await getPage(0);
      if (control.signal.aborted) return;
      const top = first.items[0];
      const prior = previousTop.current;
      const latestUnread = first.items.find(item => !item.is_read && prior &&
        (!prior.id || item.published_at > prior.date || (item.published_at === prior.date && item.id > prior.id)));
      if (latestUnread && !target && !inbox.current?.open) setAlert(latestUnread);
      else setAlert(current=>first.items.some(item=>item.id === current?.id && !item.is_read) ? current : null);
      previousTop.current = {id:top?.id, date:top?.published_at};
      let selected = Math.min(page, Math.max(0, Math.ceil(first.total / pageSize) - 1));
      let result = first;
      if (target) {
        selected = 0;
        // A saved notification can refer to an older page. The same membership-
        // scoped inbox supplies its content, including whether this user read it.
        const cached = resolved.current;
        if (cached?.target === target && cached.topId === top?.id) {
          selected = cached.page;
          if (selected) result = await getPage(selected);
        } else {
          while (!result.items.some(item => item.id === target.id) && (selected+1)*pageSize < first.total) {
            result = await getPage(++selected);
          }
          if (control.signal.aborted) return;
          if (!result.items.some(item => item.id === target.id)) {selected = 0; result = first;}
          resolved.current = {target, topId:top?.id, page:selected};
        }
      } else if (selected) result = await getPage(selected);
      if (control.signal.aborted) return;
      setFeed({first, result, selected, target, requestedPage:page});
      setError('');
    }
    void load().catch(()=>{if (!control.signal.aborted) setError('Could not refresh driver notices.');});
    return () => control.abort();
  }, [client, operatorId, page, refresh, target]);

  const linked = target && feed?.target === target && feed.result.items.find(item => item.id === target.id);
  useEffect(() => {
    if (!target || feed?.target !== target || lastFocused.current === target) return;
    lastFocused.current = target;
    const element = linked ? inbox.current?.querySelector('[data-notice="'+linked.id+'"]') : inbox.current?.querySelector('[data-notice-unavailable]');
    element?.focus();
    if (target.request) onNoticeOpened?.(target.request);
  }, [linked, feed, target, onNoticeOpened]);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(()=>setAlert(null), 18_000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  async function markRead(id) {
    setReadError('');
    setReading(id);
    try {
      const {error} = await client.rpc('rr_driver_notice_read', {p_operator:operatorId, p_notice:id});
      if (error) throw error;
      setAlert(current => current?.id === id ? null : current);
      setFeed(current=>{
        if (!current) return current;
        const mark = list=>({...list, unread:Math.max(0,list.unread-1), items:list.items.map(item=>item.id === id ? {...item,is_read:true} : item)});
        return {...current,first:mark(current.first), result:mark(current.result)};
      });
      reload();
    } catch {
      setReadError('Could not mark the notice as read. Please try again.');
    } finally { setReading(''); }
  }

  function choosePage(number) {
    setTarget(null);
    setPage(number);
    setReadError('');
    reload();
  }
  const display = feed?.target === target && feed?.requestedPage === page ? feed : null;
  const unread = feed?.first.unread || 0;
  const preview = unread ? feed.first.items.find(item=>!item.is_read) : null;
  return <>
    <details className={css.inbox} ref={inbox} data-unread={unread > 0 || undefined}
      onToggle={e=>{
        if (e.currentTarget.open) {setAlert(null);reload();}
        else {setPage(0);setTarget(null);}
      }}>
      <summary>
        <span>Driver notices</span>
        {unread > 0 && <strong className={css.badge}>{unread} unread</strong>}
        {preview && <span className={css.preview}>{preview.title}</span>}
      </summary>
      <div className={css.body}>
        {publish && <><DriverPhoneAlertSettings operatorId={operatorId} noticeOnly/>
          <PublishNotice workspaceId={operatorId} onPublished={() => choosePage(0)}/></>}
        {error && <div role="alert">{error} <button type="button" onClick={reload}>Retry</button></div>}
        {readError && <p role="alert">{readError}</p>}
        {!display && !error && <p role="status">Loading notices…</p>}
        {target && display && !linked && <p role="status" tabIndex={-1} data-notice-unavailable>This notice is unavailable in this workspace.</p>}
        {display?.result.total === 0 && <p>No driver notices yet.</p>}
        {display?.result.items.map(item => <article key={item.id} className={css.item} data-notice={item.id}
          tabIndex={-1} aria-label={item.title}>
          <header><h3>{item.title}</h3><small>{noticeDate.format(new Date(item.published_at))}</small></header>
          <p>{item.message}</p>
          {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">View source</a>}
          {item.is_read ? <small>Read</small> : <button type="button" onClick={() => markRead(item.id)} disabled={Boolean(reading)}>
            {reading === item.id ? 'Saving…' : 'Mark as read'}
          </button>}
        </article>)}
        {display && display.result.total > pageSize && <nav aria-label="Notice pages">
          <button type="button" disabled={display.selected === 0} onClick={() => choosePage(display.selected-1)}>Newer</button>
          <button type="button" disabled={(display.selected+1)*pageSize >= display.result.total} onClick={() => choosePage(display.selected+1)}>Older</button>
        </nav>}
        {!publish && <small>Manage phone alerts in Profile.</small>}
      </div>
    </details>
    {alert && <aside className={css.alert} aria-label="New driver notice">
      <div role="status"><small>New driver notice</small><strong>{alert.title}</strong></div>
      <button type="button" onClick={()=>openNotice(alert.id)}>Open</button>
      <button type="button" aria-label="Dismiss alert" onClick={()=>setAlert(null)}>×</button>
    </aside>}
  </>;
}
