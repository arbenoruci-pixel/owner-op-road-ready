'use client';

import { useEffect, useState } from 'react';
import { cloudClient } from '../../lib/owner-op-cloud/client.js';
import { inboxRequest, useInboxFeed } from '../../source/src/modules/recruiting/inboxClient.js';
import styles from './inbox.module.css';

const documentLabels = {
  cdl: 'Commercial driver’s license',
  registration: 'Truck registration / cab card',
  experience: 'Driving experience verification',
};

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function months(value) {
  const years = Math.floor(value / 12);
  const remainder = value % 12;
  const units = [];
  if (years) units.push(years + (years === 1 ? ' year' : ' years'));
  if (remainder || !years) units.push(remainder + (remainder === 1 ? ' month' : ' months'));
  return units.join(', ');
}

function dateLabel(value) {
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DetailGroup({ title, rows }) {
  return (
    <section className={styles.group}>
      <h3>{title}</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Application({ record, onReview, busy }) {
  const d = record.details;
  const docs = (d.documents || []).map(key => documentLabels[key] || key);
  return (
    <details className={styles.card}>
      <summary>
        <span className={styles.identity}>
          <strong>{d.fullName}</strong>
          <small>Received {dateLabel(record.createdAt)}</small>
        </span>
        <span className={record.reviewedAt ? styles.reviewed : styles.newTag}>
          {record.reviewedAt ? 'Reviewed' : 'New'}
        </span>
      </summary>
      <div className={styles.detail}>
        <DetailGroup title="Contact" rows={[
          ['Email', <a href={'mailto:' + d.email}>{d.email}</a>],
          ['Phone', <a href={'tel:' + d.phone.replace(/[^+0-9]/g, '')}>{d.phone}</a>],
          ['Available to start', dateLabel(d.startDate)],
        ]}/>
        <DetailGroup title="Driver experience" rows={[
          ['Active U.S. Class A CDL', yesNo(d.activeClassA)],
          ['CDL state', d.cdlState],
          ['Time holding CDL', months(d.cdlMonths)],
          ['Age 24 or older', yesNo(d.age24)],
          ['Verifiable recent OTR experience', months(d.otrMonths)],
          ['Prior carrier', d.priorCarrier],
          ['Amazon Relay experience', months(d.amazonMonths)],
          ['Amazon Relay carrier', d.amazonCarrier],
          ['Driving history', d.drivingHistory === 'clear' ? 'No issues reported' : 'Discuss during review'],
        ]}/>
        <DetailGroup title="Truck and parking" rows={[
          ['Tractor', [d.truckYear, d.truckMake, d.truckModel].join(' ')],
          ...(d.truckVin ? [['Tractor VIN', d.truckVin]] : []),
          ['Registration', [d.registrationState, d.registrationStatus].join(' · ')],
          ['Garaging address', d.garagingAddress],
          ['Trailer', d.trailer || 'None listed'],
          ['Physical damage coverage requested', yesNo(d.physicalDamage)],
          ...(d.physicalDamage && d.declaredValue ? [['Declared tractor value', Number(d.declaredValue).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })]] : []),
          ['Documents available', docs.length ? docs.join(', ') : 'None listed'],
        ]}/>
        {record.reviewedAt ? <p className={styles.muted}>Reviewed {dateLabel(record.reviewedAt)}</p> :
          <button className={styles.primary} type="button" disabled={busy} onClick={() => onReview(record.id)}>Mark reviewed</button>}
      </div>
    </details>
  );
}

function Inbox({ token }) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [marking, setMarking] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const feed = useInboxFeed(token, '?page=' + page, revision);

  async function markReviewed(id) {
    if (marking) return;
    setMarking(id);
    setReviewError('');
    try {
      await inboxRequest(token, '', { method: 'PATCH', body: JSON.stringify({ id }) });
      setRevision(value => value + 1);
    } catch {
      setReviewError('Could not mark this application reviewed. Try again.');
    } finally {
      setMarking('');
    }
  }

  async function copyLink() {
    const url = new URL('/apply', window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Public application link copied.');
    } catch {
      setCopyStatus(url);
    }
  }

  if (!feed) return <p role="status">Loading applications…</p>;
  if (feed.error === 403) return <p>This account does not have access to Narta Express applications.</p>;
  if (feed.error === 401) return <p>Sign in to your Road Ready recruiting account to continue. <a href="/">Open Road Ready</a></p>;
  if (feed.error) return (
    <div role="alert"><p>Could not load applications. Check your connection and try again.</p>
      <button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button>
    </div>
  );

  const { total, unread, applications } = feed.data;
  return (
    <>
      <div className={styles.toolbar}>
        <span aria-live="polite">{unread} new · {total} total</span>
        <button className={styles.secondary} onClick={copyLink} type="button">Copy public application link</button>
      </div>
      {copyStatus && <p className={styles.muted} role="status">{copyStatus}</p>}
      {reviewError && <p className={styles.error} role="alert">{reviewError}</p>}
      {applications.length === 0 ? <p className={styles.empty}>New owner-operator applications will appear here.</p> :
        applications.map(record => <Application key={record.id} record={record} onReview={markReviewed} busy={Boolean(marking)}/>)}
      {total > 25 && <nav className={styles.pager} aria-label="Application pages">
        <button className={styles.secondary} type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page + 1} of {Math.ceil(total / 25)}</span>
        <button className={styles.secondary} type="button" disabled={(page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>Next</button>
      </nav>}
    </>
  );
}

export default function RecruitingInbox() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    const { data } = cloudClient().auth.onAuthStateChange((_event, current) => setSession(current));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <a href="/">Road Ready</a>
          <p>Narta Express LLC</p>
          <h1>Owner-operator applications</h1>
        </header>
        {session === undefined ? <p role="status">Checking your account…</p> :
          session?.access_token ? <Inbox key={session.user.id} token={session.access_token}/> :
          <div><p>Sign in with your Narta Express recruiting account to view applications.</p>
            <a className={styles.primary} href="/">Sign in to Road Ready</a></div>}
      </div>
    </main>
  );
}
