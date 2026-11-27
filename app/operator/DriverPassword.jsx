'use client';

import React, { useRef, useState } from 'react';
import { usePortalClient } from './PortalSession.jsx';
import css from './step3.module.css';

export default function DriverPassword({ email }) {
  const client = usePortalClient();
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const password = form.elements.namedItem('newPassword').value;
    if (password !== form.elements.namedItem('confirmPassword').value) {
      setError('The passwords do not match. Enter them again.');
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: updateError } = await client.auth.updateUser({ password });
      if (updateError || !data?.user) {
        setError(updateError?.message || 'Could not save your password. Try again.');
        return;
      }
      form.reset();
      setOpen(false);
      setSaved(true);
    } catch {
      setError('Could not reach RoadReady to save your password. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return <>
      <button type="button" onClick={() => { setError(''); setSaved(false); setOpen(true); }}>
        Set my password
      </button>
      {saved && <p role="status">Password saved. On the sign-in screen, choose Use my password.</p>}
    </>;
  }

  return <form className={css.form} onSubmit={save} data-operator-update-pending="true">
    <label>Sign-in email
      <input type="email" autoComplete="username" value={email} readOnly />
    </label>
    <label>New password
      <input name="newPassword" type="password" autoComplete="new-password" required disabled={busy} />
    </label>
    <label>Confirm new password
      <input name="confirmPassword" type="password" autoComplete="new-password" required disabled={busy} />
    </label>
    <button type="submit" className={css.primary} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
    <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
