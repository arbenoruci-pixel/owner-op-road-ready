'use client';

import { useEffect, useRef, useState } from 'react';
import { operatorClient } from '../portalData.js';
import { takePodInvoice } from '../podLoginIntent.js';
import styles from '../operator.module.css';

export default function EmailConfirmation() {
  const [ready, setReady] = useState(false);
  const [tokenHash, setTokenHash] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    if (window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.slice(1)).get('token_hash');
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (hash && /^[a-zA-Z0-9_-]{24,160}$/.test(hash)) setTokenHash(hash);
    }
    setReady(true);
  }, []);

  async function confirm(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      const proof = tokenHash
        ? { token_hash: tokenHash, type: 'email' }
        : { email: email.trim(), token: code.trim(), type: 'email' };
      const { data, error } = await operatorClient().auth.verifyOtp(proof);
      if (error || !data.session) {
        setTokenHash('');
        setMessage('This link or code could not be verified. Use your newest Road Ready email.');
        return;
      }
      const loadId = takePodInvoice(data.session.user.email);
      window.location.replace(loadId ? '/operator?podInvoice=' + loadId : '/operator');
    } catch {
      setMessage('Could not reach Road Ready. Check your connection and try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.signin}>
        <header className={styles.cover}><h1>My loads &amp; pay</h1></header>
        {ready && (
          <form className={styles.form} onSubmit={confirm}>
            {tokenHash ? <p>Confirm your email sign-in to open your driver workspace.</p> : (
              <>
                <label>Operator email
                  <input type="email" autoComplete="email" required value={email}
                    onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label>Email code
                  <input type="text" inputMode="numeric" autoComplete="one-time-code"
                    pattern="[0-9]{4,10}" maxLength={10} required value={code}
                    onChange={(event) => setCode(event.target.value)} />
                </label>
              </>
            )}
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Signing in…' : tokenHash ? 'Open My Loads' : 'Verify email code'}
            </button>
            {message && <p role="alert">{message}</p>}
            {!tokenHash && <a href="/operator">Request a new sign-in email</a>}
          </form>
        )}
      </section>
    </main>
  );
}
