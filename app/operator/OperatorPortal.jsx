'use client';

import { useEffect, useRef, useState } from 'react';
import { allRows, appointment, loadFields, loadOriginal, operatorClient, rows, usd } from './portalData.js';
import { PortalSession, usePortalClient } from './PortalSession.jsx';
import OperatorWallet, { WalletProof } from './OperatorWallet.jsx';
import OwnerEarnings from './OwnerEarnings.jsx';
import LegacyHistory from './LegacyHistory.jsx';
import { activityDays, formatDay as dateOnly, paymentRecorded, recordedRevenue } from './financials.js';
import styles from './operator.module.css';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const labels = {
  staging: 'Pending dispatch review',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  closed: 'Closed',
  cancelled: 'Cancelled',
  issued: 'Issued',
  paid: 'Paid',
  draft: 'Draft',
};
const docLabels = {
  ratecon: 'Rate confirmation',
  pod: 'Proof of delivery',
  bol: 'Bill of lading',
  invoice: 'Invoice',
  supporting: 'Supporting document',
};

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [withPassword, setWithPassword] = useState(false);
  const [linkRequested, setLinkRequested] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const auth = operatorClient().auth;
      if (!withPassword && linkRequested && code) {
        const { error } = await auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (error) throw error;
        return;
      }
      const { error } = withPassword
        ? await auth.signInWithPassword({ email: email.trim(), password })
        : await auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + '/operator' },
          });
      if (error) throw error;
      if (!withPassword) {
        setLinkRequested(true);
        setMessage(
          'If this email is registered with dispatch, open the sign-in link in this browser. If the email includes a code, enter it below.'
        );
      }
    } catch {
      setMessage(
        !withPassword && code
          ? 'The code could not be verified. Try again.'
          : withPassword
            ? 'Sign-in failed. Check your email and password.'
            : 'Could not send a sign-in link. Check the address registered with dispatch and try again.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.signin}>
      <div className={styles.cover}>
        <h1>My loads &amp; pay</h1>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label>
          Operator email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setCode('');
              setLinkRequested(false);
              setMessage('');
            }}
          />
        </label>
        {withPassword && (
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {!withPassword && linkRequested && (
          <label>
            Email code (if provided)
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={10}
            />
          </label>
        )}
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy
            ? 'Please wait…'
            : withPassword
              ? 'Sign in'
              : code && linkRequested
                ? 'Verify email code'
                : linkRequested
                  ? 'Resend sign-in link'
                  : 'Email me a sign-in link'}
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            setWithPassword(!withPassword);
            setMessage('');
            setPassword('');
            setCode('');
          }}
        >
          {withPassword ? 'Use a sign-in link' : 'Use my password'}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}

function Pair({ name, value }) {
  return (
    <div className={styles.pair}>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Original({ doc }) {
  const client = usePortalClient();
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file]
  );
  async function open() {
    setPending(true);
    setError('');
    try {
      const blob = await loadOriginal(client, doc);
      if (active.current) setFile({ url: URL.createObjectURL(blob), type: blob.type });
    } catch (err) {
      if (active.current) setError(err.message);
    } finally {
      if (active.current) setPending(false);
    }
  }
  return (
    <div className={styles.document}>
      <button type="button" className={styles.link} onClick={open} disabled={pending || Boolean(file)}>
        {pending
          ? 'Opening…'
          : (docLabels[doc.kind] || 'Document') +
            (doc.kind === 'ratecon' && !doc.is_current ? ' · Previous revision ' + doc.revision : '')}
      </button>
      {file && (
        <div>
          <p>
            {file.type === 'application/pdf' && (
              <a href={file.url} target="_blank" rel="noreferrer">
                View PDF
              </a>
            )}{' '}
            <a href={file.url} download={doc.file_name}>
              Download {doc.file_name}
            </a>{' '}
            <button className={styles.link} type="button" onClick={() => setFile(null)}>
              Close
            </button>
          </p>
          {file.type.startsWith('image/') && (
            <img className={styles.photo} alt={doc.file_name} src={file.url} />
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Documents({ loadId, refresh }) {
  const client = usePortalClient();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    rows(
      client
        .from('rr_lease_documents')
        .select(
          'id,kind,file_name,storage_path,storage_backend,byte_size,mime_type,chunk_count,is_ready,sha256,revision,is_current'
        )
        .eq('load_id', loadId)
        .eq('is_ready', true)
        .order('is_current', { ascending: false })
        .order('created_at', { ascending: false })
    )
      .then((result) => {
        if (active) setDocs(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client, loadId, refresh]);
  if (error) return <p role="alert">Could not load documents. Tap Refresh to try again.</p>;
  if (docs === null) return <p role="status">Loading documents…</p>;
  return (
    <div>
      <h4>Original documents</h4>
      {docs.length ? (
        docs.map((d) => <Original key={d.id + d.sha256} doc={d} />)
      ) : (
        <p>No documents available yet.</p>
      )}
    </div>
  );
}

function Stop({ label, address, at, zone, reference }) {
  return (
    <section className={styles.stop}>
      <h4>{label}</h4>
      <strong>{appointment(at, zone) || 'Appointment pending'}</strong>
      {address && <div className={styles.address}>{address}</div>}
      {reference && (
        <div>
          {label} # <b>{reference}</b>
        </div>
      )}
    </section>
  );
}

function LoadCard({ load, refresh, owner = false }) {
  const [opened, setOpened] = useState(false);
  return (
    <details className={styles.card} onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>
        <span>
          <strong>Load {load.load_number}</strong>
          <small>{load.broker_name}</small>
        </span>
        <span>{labels[load.status] || load.status}</span>
      </summary>
      {opened && (
        <div className={styles.detail}>
          <div className={styles.stops}>
            <Stop
              label="Pickup"
              address={load.pickup_address}
              at={load.pickup_at}
              zone={load.pickup_timezone}
              reference={load.pickup_number}
            />
            <Stop
              label="Delivery"
              address={load.delivery_address}
              at={load.delivery_at}
              zone={load.delivery_timezone}
              reference={load.delivery_number}
            />
          </div>
          {load.reefer_instructions && (
            <section className={styles.reefer}>
              <h4>Reefer instructions</h4>
              <div>{load.reefer_instructions}</div>
            </section>
          )}
          {load.steps?.length > 0 && (
            <section>
              <h4>What to do</h4>
              <ol className={styles.steps}>
                {load.steps.map((step, i) => (
                  <li key={i}>
                    <strong>{step.title}</strong>
                    {step.detail && <div>{step.detail}</div>}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <dl>
            <Pair name="Load revenue" value={usd(load.gross_cents)} />
            {!owner && <>
              <Pair name="Narta share" value={usd(load.carrier_share_cents)} />
              <Pair name="Operator share before expenses" value={usd(load.operator_share_cents)} />
            </>}
          </dl>
          {load.actual_delivery_date && (
            <dl>
              <Pair name="Delivered" value={dateOnly(load.actual_delivery_date)} />
              {!owner && load.payment_deadline && (
                <Pair name="Payment due by" value={dateOnly(load.payment_deadline)} />
              )}
            </dl>
          )}
          <Documents loadId={load.id} refresh={refresh} />
        </div>
      )}
    </details>
  );
}

function StatementDocuments({ loadId, refresh }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.noPrint} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>View load documents</summary>
    {open && <Documents loadId={loadId} refresh={refresh} />}
  </details>;
}

function WeekDetail({ statement, operator, refresh }) {
  const client = usePortalClient();
  const printArea = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    const loadQuery = () =>
      client
        .from('rr_lease_loads')
        .select('id,load_number,broker_name,actual_delivery_date,gross_cents,carrier_share_cents,operator_share_cents')
        .eq('operator_id', statement.operator_id)
        .eq('settlement_id', statement.id)
        .order('id');
    const adjustmentQuery = () =>
      client
        .from('rr_lease_adjustments')
        .select('id,kind,description,amount_cents,paid_by,settlement_effect_cents,evidence_reference,wallet_document_id')
        .eq('operator_id', statement.operator_id)
        .eq('settlement_id', statement.id)
        .order('id');
    const totals = rows(
      client
        .from('rr_lease_settlement_totals')
        .select(
          'gross_cents,carrier_share_cents,operator_share_cents,estimated_net_cents,net_cents,costs_reviewed'
        )
        .eq('settlement_id', statement.id)
    );
    const reviews = rows(
      client.from('rr_lease_cost_reviews').select('kind,outcome,evidence_reference').eq('settlement_id', statement.id)
    );
    Promise.all([allRows(loadQuery), allRows(adjustmentQuery), totals, reviews])
      .then(([loads, adjustments, summary, checks]) => {
        if (summary.length !== 1) throw new Error('Settlement totals unavailable.');
        if (active) setResult({ loads, adjustments, summary: summary[0], checks });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client, statement.id, statement.operator_id, refresh]);
  if (error) return <p role="alert">Could not load the statement. Tap Refresh to try again.</p>;
  if (!result) return <p role="status">Loading statement…</p>;
  const { loads, adjustments, summary, checks } = result;
  const gross = recordedRevenue(loads);
  const confirmed = statement.status !== 'draft' && summary.costs_reviewed && Number.isSafeInteger(summary.net_cents);
  const paid = paymentRecorded(statement, summary.net_cents);
  const ownExpenses = adjustments.filter((a) => a.paid_by === 'operator');
  const cashEntries = adjustments.filter((a) => a.paid_by === 'carrier');
  function print() {
    const target = printArea.current;
    if (!target) return;
    document.querySelectorAll('[data-print-statement]').forEach((item) => item.removeAttribute('data-print-statement'));
    target.setAttribute('data-print-statement', '');
    window.addEventListener('afterprint', () => target.removeAttribute('data-print-statement'), { once: true });
    window.print();
  }
  return (
    <section ref={printArea} className={styles.detail} aria-label="Settlement breakdown">
      <header className={styles.statementHead}>
        <div>
          <small className={styles.meta}>{operator.company_name} · {operator.driver_name}</small>
          <h3>{paid ? 'Payment statement' : statement.status === 'draft' ? 'Draft settlement' : 'Settlement statement'}</h3>
          <p>Week of {dateOnly(statement.week_start)}</p>
        </div>
        <button type="button" onClick={print}>Print / Save PDF</button>
      </header>
      <dl>
        <Pair name="Completed loads" value={loads.length} />
        <Pair name="Gross revenue" value={usd(gross)} />
        <Pair name="Narta share" value={usd(gross === null ? null : summary.carrier_share_cents)} />
        <Pair name="Operator share before expenses" value={usd(gross === null ? null : summary.operator_share_cents)} />
      </dl>
      <div className={styles.dailyLoads}>
        {activityDays(loads).map((day) => <section key={day.date}>
          <h4>{day.date ? dateOnly(day.date) : 'Delivery date pending'}</h4>
          {day.loads.map((load) => <div key={load.id} className={styles.loadLine}>
            <b>Load {load.load_number}</b><span>{load.broker_name}</span>
            <dl>
              <Pair name="Gross" value={usd(load.gross_cents)} />
              <Pair name="Operator share" value={usd(load.operator_share_cents)} />
            </dl>
            <StatementDocuments loadId={load.id} refresh={refresh} />
          </div>)}
        </section>)}
      </div>
      <h4>Expenses &amp; credits</h4>
      <dl>
        {['insurance', 'fuel', 'eld'].map((k) => {
          const review = checks.find((c) => c.kind === k);
          const amount = cashEntries
            .filter((a) => a.kind === k)
            .reduce((sum, a) => sum + a.settlement_effect_cents, 0);
          return (
            <Pair
              key={k}
              name={k === 'eld' ? 'ELD' : k === 'fuel' ? 'Fuel' : 'Insurance'}
              value={
                review?.outcome === 'deferred'
                  ? usd(amount) + ' recorded · Deferred: ' + review.evidence_reference
                  : review
                    ? usd(amount)
                    : 'Pending verification'
              }
            />
          );
        })}
      </dl>
      {cashEntries.length > 0 && (
        <section>
          <h4>Settlement entries</h4>
          <div>
            {cashEntries.map((a) => (
              <div key={a.id} className={styles.entry}>
                <dl><Pair name={a.description} value={usd(a.settlement_effect_cents)} /></dl>
                <small className={styles.meta}>{a.evidence_reference}</small>
                {a.wallet_document_id && <div className={styles.noPrint}><WalletProof documentId={a.wallet_document_id} operatorId={operator.id} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}
      {ownExpenses.length > 0 && (
        <section>
          <h4>Expenses paid directly by operator</h4>
          <div>
            {ownExpenses.map((a) => (
              <div key={a.id} className={styles.entry}>
                <dl><Pair name={a.description} value={usd(a.amount_cents)} /></dl>
                <small className={styles.meta}>{a.evidence_reference} · $0 deducted</small>
                {a.wallet_document_id && <div className={styles.noPrint}><WalletProof documentId={a.wallet_document_id} operatorId={operator.id} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}
      <dl>
        <Pair
          name={confirmed ? 'Net settlement' : 'Estimated net'}
          value={usd(gross === null ? null : confirmed ? summary.net_cents : summary.estimated_net_cents)}
        />
        <Pair name="Pay date" value={dateOnly(statement.expected_pay_date)} />
        {paid && <>
          <Pair name="Amount paid" value={usd(statement.payment_amount_cents)} />
          <Pair name="Payment date" value={dateOnly(statement.paid_at)} />
          <Pair name="Payment reference" value={statement.payment_reference} />
        </>}
      </dl>
    </section>
  );
}

function Week({ statement, operator, refresh }) {
  const [opened, setOpened] = useState(false);
  return (
    <details className={styles.card} onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>
        <strong>Week of {dateOnly(statement.week_start)}</strong>
        <span>{statement.status === 'paid' && !paymentRecorded(statement, statement.payment_amount_cents) ? 'Payment details pending' : labels[statement.status] || statement.status}</span>
      </summary>
      {opened && <WeekDetail statement={statement} operator={operator} refresh={refresh} />}
    </details>
  );
}

function Workspace({ operator }) {
  const client = usePortalClient();
  const owner = operator.workspace_kind === 'carrier';
  const [tab, setTab] = useState('loads');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const pageSize = 12;
  const listTab = tab === 'loads' || tab === 'history' || (tab === 'pay' && !owner);
  const headings = { loads: 'Active loads', history: 'Load history', pay: owner ? 'Income & expenses' : 'Weekly settlements', wallet: 'Digital wallet' };
  useEffect(() => {
    function check() {
      if (document.visibilityState === 'visible') setRefresh((v) => v + 1);
    }
    const timer = window.setInterval(check, 60000);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError(false);
    if (!listTab) return;
    let query;
    if (tab === 'pay') {
      query = client.from('rr_lease_settlements')
        .select('id,operator_id,week_start,status,paid_at,expected_pay_date,payment_reference,payment_amount_cents', { count: 'exact' })
        .order('week_start', { ascending: false });
    } else {
      query = client.from('rr_lease_loads').select(loadFields, { count: 'exact' });
      query = tab === 'history'
        ? query.in('status', ['delivered', 'closed', 'cancelled'])
            .order('actual_delivery_date', { ascending: false, nullsFirst: false })
        : query.in('status', ['staging', 'assigned', 'picked_up']);
      query = query.order('updated_at', { ascending: false });
    }
    query
      .eq('operator_id', operator.id)
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .then(
        ({ data: records, count, error: failure }) => {
          if (!active) return;
          if (failure) {
            setError(true);
            return;
          }
          if (page && !records?.length) {
            setPage(0);
            return;
          }
          setData({ tab, page, records: records || [], count: count || 0 });
        },
        () => {
          if (active) setError(true);
        }
      );
    return () => {
      active = false;
    };
  }, [client, listTab, operator.id, tab, page, refresh]);
  const displayed = listTab && data?.tab === tab && data?.page === page ? data : null;
  function switchTo(nextTab) {
    setPage(0);
    setTab(nextTab);
  }
  return (
    <section>
      <div className={styles.hero}>
        <div className={styles.wrap}>
          <p>{operator.driver_name}</p>
          <h1>{operator.company_name}</h1>
          {!owner && operator.pay_weekday && <p>Weekly payday · {weekdays[operator.pay_weekday - 1]}</p>}
        </div>
      </div>
      <div className={styles.wrap}>
        <nav className={styles.tabs} aria-label="Operator workspace">
          {Object.entries({ loads: 'Loads', history: 'History', pay: owner ? 'Income' : 'Pay', wallet: 'Wallet' }).map(([key, name]) => (
            <button key={key} type="button" aria-pressed={tab === key} onClick={() => switchTo(key)}>{name}</button>
          ))}
        </nav>
        <div className={styles.sectionHeading}>
          <h2>
            {headings[tab]}
            {displayed && ' (' + displayed.count + ')'}
          </h2>
          <button type="button" className={styles.link} onClick={() => setRefresh((v) => v + 1)}>
            Refresh
          </button>
        </div>
        {tab === 'wallet' && <OperatorWallet operatorId={operator.id} refresh={refresh} />}
        {tab === 'pay' && owner && <OwnerEarnings operatorId={operator.id} refresh={refresh} />}
        {listTab && error ? (
          <p role="alert">Could not refresh your records. Tap Refresh to try again.</p>
        ) : listTab && !displayed ? (
          <p role="status">Loading…</p>
        ) : null}
        <div className={styles.list}>
          {displayed?.records.map((record) =>
            tab !== 'pay' ? (
              <LoadCard key={record.id} load={record} owner={owner} refresh={refresh} />
            ) : (
              <Week key={record.id} statement={record} operator={operator} refresh={refresh} />
            )
          )}
        </div>
        {displayed?.count === 0 && (
          <p className={styles.empty}>
            {tab === 'loads'
              ? 'Your assigned loads will appear here.'
              : tab === 'history' ? 'Completed and cancelled loads will appear here.' : 'Your weekly statements will appear here.'}
          </p>
        )}
        {displayed && displayed.count > pageSize && (
          <div className={styles.pager}>
            <button type="button" disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.ceil(displayed.count / pageSize)}
            </span>
            <button
              type="button"
              disabled={(page + 1) * pageSize >= displayed.count}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
        {owner && tab === 'history' && <LegacyHistory operatorId={operator.id} refresh={refresh} />}
      </div>
    </section>
  );
}

function Membership({ session, carrierEntry }) {
  const client = usePortalClient();
  const [operators, setOperators] = useState(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    async function resolve() {
      setError(false);
      if (!carrierEntry) {
        const { error: claimError } = await client.rpc('rr_lease_claim_membership');
        if (claimError) throw claimError;
      }
      let membership = client.from('rr_lease_operators')
        .select('id,company_name,driver_name,pay_weekday,carrier_user_id,workspace_kind');
      if (carrierEntry) membership = membership.eq('carrier_user_id', session.user.id);
      const list = await rows(membership.order('company_name').order('id'));
      if (active) {
        setOperators(list);
        const own = list.find((o) => o.workspace_kind === 'carrier' && o.carrier_user_id === session.user.id);
        setSelected((id) => (list.some((o) => o.id === id) ? id : own?.id || list[0]?.id || ''));
      }
    }
    resolve().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [client, carrierEntry, session.user.id, retry]);
  if (error || !operators?.length)
    return (
      <section className={styles.notice}>
        <h1>My loads &amp; pay</h1>
        <p role="status">
          {error
            ? 'Could not verify your operator access.'
            : operators
              ? 'Dispatch has not assigned access to this email yet.'
              : 'Opening your workspace…'}
        </p>
        {(operators || error) && (
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Check access again
          </button>
        )}
      </section>
    );
  const operator = operators.find((o) => o.id === selected);
  return (
    <>
      {operators.length > 1 && (
        <label className={styles.select}>
          Workspace
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.company_name} · {o.driver_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {operator && <Workspace key={operator.id} operator={operator} />}
    </>
  );
}

export default function OperatorPortal({ client, carrierEntry = false }) {
  const [auth, setAuth] = useState({ ready: false, session: null });
  const [signoutError, setSignoutError] = useState(false);
  useEffect(() => {
    const {
      data: { subscription },
    } = (client || operatorClient()).auth.onAuthStateChange((_event, session) => {
      setAuth({ ready: true, session });
      setSignoutError(false);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  async function signOut() {
    const { error } = await operatorClient().auth.signOut({ scope: 'local' });
    setSignoutError(Boolean(error));
  }
  return (
    <PortalSession.Provider value={client || null}><main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.wrap}>
          <span className={styles.brand}>
            <i aria-hidden="true" /> Road Ready
          </span>
          {carrierEntry && <a className={styles.back} href="/">Back to RoadReady</a>}
          {!carrierEntry && auth.session && (
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </header>
      {signoutError && (
        <p role="alert" className={styles.notice}>
          Could not sign out. Try again.
        </p>
      )}
      {!auth.ready ? (
        <p role="status" className={styles.notice}>
          Opening Road Ready…
        </p>
      ) : auth.session ? (
        <Membership key={auth.session.user.id} session={auth.session} carrierEntry={carrierEntry} />
      ) : carrierEntry ? (
        <section className={styles.notice}><h1>Carrier workspace</h1><p><a href="/">Sign in to your RoadReady account</a></p></section>
      ) : (
        <Login />
      )}
    </main></PortalSession.Provider>
  );
}
