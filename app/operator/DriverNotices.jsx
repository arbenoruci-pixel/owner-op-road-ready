'use client';
import React, { useEffect, useRef, useState } from 'react';
import { usePortalClient } from './PortalSession.jsx';
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

export default function DriverNotices({operatorId, publish = false}) {
  const client = usePortalClient();
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  const [readError, setReadError] = useState('');
  const reload = () => setRefresh(n => n + 1);

  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setError('');
      try {
        const {data, error} = await client.rpc('rr_driver_notices', {p_operator:operatorId, p_page:page});
        if (error || !Array.isArray(data?.items)) throw Error();
        if (active) setFeed({...data, page});
      } catch {
        if (active) setError('Could not refresh driver notices.');
      }
    }
    void load();
    return () => { active = false; };
  }, [client, operatorId, page, refresh]);

  async function markRead(id) {
    setReadError('');
    setReading(id);
    try {
      const {error} = await client.rpc('rr_driver_notice_read', {p_operator:operatorId, p_notice:id});
      if (error) throw error;
      reload();
    } catch {
      setReadError('Could not mark the notice as read. Please try again.');
    } finally {
      setReading('');
    }
  }

  const display = feed?.page === page ? feed : null;
  return <details className={css.inbox} onToggle={e => { if (e.currentTarget.open) reload(); }}>
    <summary>
      <span>Driver notices</span>
      {feed?.unread > 0 && <strong aria-live="polite">{feed.unread} unread</strong>}
    </summary>
    <div className={css.body}>
      {publish && <PublishNotice workspaceId={operatorId} onPublished={() => { setPage(0); reload(); }}/>}
      {error && <div role="alert">{error} <button type="button" onClick={reload}>Retry</button></div>}
      {readError && <p role="alert">{readError}</p>}
      {!display && !error && <p role="status">Loading notices…</p>}
      {display?.total === 0 && <p>No driver notices yet.</p>}
      {display?.items.map(item => <article key={item.id} className={css.item} aria-label={item.title}>
        <header><h3>{item.title}</h3><small>{new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric'}).format(new Date(item.published_at))}</small></header>
        <p>{item.message}</p>
        {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">View source</a>}
        {item.is_read ? <small>Read</small> : <button type="button" onClick={() => markRead(item.id)} disabled={Boolean(reading)}>
          {reading === item.id ? 'Saving…' : 'Mark as read'}
        </button>}
      </article>)}
      {display && display.total > 20 && <nav aria-label="Notice pages">
        <button type="button" disabled={page === 0} onClick={() => setPage(n => n-1)}>Newer</button>
        <button type="button" disabled={(page+1)*20 >= display.total} onClick={() => setPage(n => n+1)}>Older</button>
      </nav>}
    </div>
  </details>;
}
