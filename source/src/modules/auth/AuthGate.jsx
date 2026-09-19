'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloudClient } from '../../../../lib/owner-op-cloud/client.js';
import { ACCESS_CHECK_TIMEOUT_MS, OFFLINE_GRACE_MS, SESSION_CHECK_TIMEOUT_MS, approvalIsFresh, cachedApprovedUser, settleWithin } from './authStartupV110377.js';
import './auth.css';

function approvalKey(user) {
  return `owner-op-approved-device-v1:${user?.id || 'none'}`;
}

function readApproval(user) {
  if (!user || typeof window === 'undefined') return null;
  try {
    const row = JSON.parse(localStorage.getItem(approvalKey(user)) || 'null');
    if (!approvalIsFresh(row, user)) return null;
    return row;
  } catch {
    return null;
  }
}

function writeApproval(user) {
  if (!user || typeof window === 'undefined') return;
  localStorage.setItem(approvalKey(user), JSON.stringify({
    userId: user.id,
    email: user.email || '',
    verifiedAt: Date.now(),
  }));
}

function clearApproval(user) {
  if (!user || typeof window === 'undefined') return;
  localStorage.removeItem(approvalKey(user));
}

function strongPassword(password) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function AuthPanel({ mode, setMode, email, setEmail, password, setPassword, busy, error, message, onSubmit }) {
  const recovery = mode === 'recover';
  return (
    <main className="owner-auth-shell">
      <section className="owner-auth-card" aria-labelledby="owner-auth-title">
        <div className="owner-auth-brand">
          <span>ROAD READY</span>
          <b id="owner-auth-title">Owner Operator</b>
          <p>{recovery ? 'Reset the password for your approved account.' : 'Secure access to your logbook, wallet and truck records.'}</p>
        </div>

        {!recovery ? (
          <div className="owner-auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setPassword(''); }}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setPassword(''); }}>Create account</button>
          </div>
        ) : null}

        <form onSubmit={onSubmit}>
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {!recovery ? (
            <label>
              <span>Password</span>
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? '12+ characters' : 'Your password'} />
            </label>
          ) : null}
          {mode === 'signup' ? <p className="owner-auth-hint">Use at least 12 characters with uppercase, lowercase, a number and a symbol.</p> : null}
          {recovery ? <p className="owner-auth-hint">We will send a single-use password reset link to this email.</p> : null}
          {error ? <div className="owner-auth-error" role="alert">{error}</div> : null}
          {message ? <div className="owner-auth-message" role="status">{message}</div> : null}
          <button className="owner-auth-primary" type="submit" disabled={busy || !email || (!recovery && !password)}>
            {busy ? 'Checking…' : recovery ? 'Send reset email' : mode === 'signup' ? 'Create secure account' : 'Sign in securely'}
          </button>
          {mode === 'signin' ? <button type="button" className="owner-auth-link" onClick={() => { setMode('recover'); setPassword(''); }}>Forgot password?</button> : null}
          {recovery ? <button type="button" className="owner-auth-secondary" onClick={() => setMode('signin')}>Back to sign in</button> : null}
        </form>
        <small>{recovery ? 'The reset link does not approve a new account. Existing Owner Operator approval still applies.' : 'New accounts require email confirmation and manual Owner Operator approval before any truck data can be opened.'}</small>
      </section>
    </main>
  );
}

function PasswordResetPanel({ password, setPassword, confirmPassword, setConfirmPassword, busy, error, onSubmit }) {
  return (
    <main className="owner-auth-shell">
      <section className="owner-auth-card" aria-labelledby="owner-reset-title">
        <div className="owner-auth-brand">
          <span>ROAD READY</span>
          <b id="owner-reset-title">Choose a new password</b>
          <p>This recovery session can only change the password for the verified email that opened the reset link.</p>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            <span>New password</span>
            <input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="12+ characters" />
          </label>
          <label>
            <span>Confirm new password</span>
            <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
          </label>
          <p className="owner-auth-hint">Use at least 12 characters with uppercase, lowercase, a number and a symbol.</p>
          {error ? <div className="owner-auth-error" role="alert">{error}</div> : null}
          <button className="owner-auth-primary" type="submit" disabled={busy || !password || !confirmPassword}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      </section>
    </main>
  );
}

export default function AuthGate({ children }) {
  const supabase = useMemo(() => cloudClient(), []);
  const [session, setSession] = useState(null);
  const [stage, setStage] = useState('loading');
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [offlineAccess, setOfflineAccess] = useState(false);
  const stageRef = useRef(stage);
  const verificationRef = useRef(0);

  useEffect(() => { stageRef.current = stage; }, [stage]);

  const verifyAccess = useCallback(async nextSession => {
    const requestId = ++verificationRef.current;
    const user = nextSession?.user;
    setSession(nextSession || null);
    setError('');
    if (!user) {
      setOfflineAccess(false);
      setStage('signed_out');
      return;
    }
    if (!user.email_confirmed_at) {
      setOfflineAccess(false);
      setStage('confirm_email');
      return;
    }

    const cached = readApproval(user);
    if (navigator.onLine === false) {
      if (cached) {
        setOfflineAccess(true);
        setStage('approved');
      } else {
        setStage('needs_online_check');
      }
      return;
    }

    try {
      const { data, error: accessError } = await settleWithin(
        supabase.rpc('owner_op_access_v1'),
        ACCESS_CHECK_TIMEOUT_MS,
        'Account access check'
      );
      if (requestId !== verificationRef.current) return;
      if (accessError) throw accessError;
      if (data?.approved === true) {
        writeApproval(user);
        setOfflineAccess(false);
        setStage('approved');
      } else {
        clearApproval(user);
        setOfflineAccess(false);
        setStage('pending_approval');
      }
    } catch (accessError) {
      if (requestId !== verificationRef.current) return;
      if (cached) {
        setOfflineAccess(true);
        setStage('approved');
      } else {
        setError(accessError?.name === 'TimeoutError'
          ? 'Secure access check is taking too long. Tap Check access again.'
          : (accessError?.message || 'Could not verify account access.'));
        setStage('needs_online_check');
      }
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;
    const recoveryInUrl = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');
    const startupApproval = !recoveryInUrl && typeof window !== 'undefined'
      ? cachedApprovedUser(window.localStorage)
      : null;

    // A recently approved device should never sit behind a network-dependent
    // splash screen. Open local records immediately, then revalidate in the
    // background. Sign-out clears both the Supabase session and approval row.
    if (startupApproval) {
      setSession({ user:startupApproval.user });
      setOfflineAccess(true);
      setStage('approved');
    }

    (async () => {
      try {
        const { data, error: sessionError } = await settleWithin(
          supabase.auth.getSession(),
          SESSION_CHECK_TIMEOUT_MS,
          'Secure session check'
        );
        if (!active) return;
        if (sessionError) throw sessionError;
        if (recoveryInUrl && data.session) {
          setSession(data.session);
          setStage('reset_password');
          setError('');
          return;
        }
        await verifyAccess(data.session);
      } catch (sessionError) {
        if (!active || startupApproval) return;
        setError(sessionError?.name === 'TimeoutError'
          ? 'Secure session check is taking too long. Tap Check access again.'
          : (sessionError?.message || 'Could not restore the secure session.'));
        setStage('needs_online_check');
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setTimeout(() => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') {
          setSession(nextSession || null);
          setStage('reset_password');
          setError('');
          return;
        }
        verifyAccess(nextSession);
      }, 0);
    });

    const online = async () => {
      if (stageRef.current === 'reset_password') return;
      try {
        const current = await settleWithin(
          supabase.auth.getSession(),
          SESSION_CHECK_TIMEOUT_MS,
          'Secure session check'
        );
        if (active) verifyAccess(current.data.session);
      } catch {
        // Keep an already-approved local session open. The manual retry button
        // remains available if no cached approval exists.
      }
    };

    window.addEventListener('online', online);
    return () => {
      active = false;
      verificationRef.current += 1;
      data.subscription.unsubscribe();
      window.removeEventListener('online', online);
    };
  }, [supabase, verifyAccess]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'recover') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (resetError) throw resetError;
        setMessage('Reset email sent. Open it on this phone and tap Reset password.');
        return;
      }
      if (mode === 'signup') {
        if (!strongPassword(password)) throw new Error('Choose a stronger password: 12+ characters with uppercase, lowercase, number and symbol.');
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        setPassword('');
        if (!data.session) {
          setMessage('Account created. Check your email and confirm the address, then return here and sign in.');
          setMode('signin');
        } else {
          await verifyAccess(data.session);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        setPassword('');
        await verifyAccess(data.session);
      }
    } catch (authError) {
      setError(authError?.message || 'Secure sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!strongPassword(password)) throw new Error('Choose a stronger password: 12+ characters with uppercase, lowercase, number and symbol.');
      if (password !== confirmPassword) throw new Error('The two password fields do not match.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearApproval(session?.user);
      await supabase.auth.signOut();
      setSession(null);
      setPassword('');
      setConfirmPassword('');
      setMode('signin');
      setMessage('Password changed. Sign in with the new password.');
      setStage('signed_out');
      if (typeof history !== 'undefined') history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (resetError) {
      setError(resetError?.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setAccountOpen(false);
    clearApproval(session?.user);
    await supabase.auth.signOut();
    setSession(null);
    setStage('signed_out');
  }

  if (stage === 'loading') return <main className="owner-auth-shell"><div className="owner-auth-loading">Checking secure session…</div></main>;

  if (stage === 'reset_password') {
    return <PasswordResetPanel password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} busy={busy} error={error} onSubmit={submitNewPassword} />;
  }

  if (stage === 'signed_out') {
    return <AuthPanel mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} error={error} message={message} onSubmit={submit} />;
  }

  if (stage !== 'approved') {
    const userEmail = session?.user?.email || '';
    const title = stage === 'confirm_email' ? 'Confirm your email' : stage === 'pending_approval' ? 'Account waiting for approval' : 'Internet check required';
    const detail = stage === 'confirm_email'
      ? `Open the confirmation email sent to ${userEmail}, then return and sign in.`
      : stage === 'pending_approval'
        ? `The email ${userEmail} is verified. Owner Operator access has not been approved yet.`
        : 'Connect to the internet once so this device can verify that your approved account is still valid.';
    return (
      <main className="owner-auth-shell">
        <section className="owner-auth-card owner-auth-state">
          <span className="owner-auth-shield">✓</span>
          <h1>{title}</h1>
          <p>{detail}</p>
          {error ? <div className="owner-auth-error" role="alert">{error}</div> : null}
          <button className="owner-auth-primary" type="button" disabled={busy || (typeof navigator !== 'undefined' && navigator.onLine === false)} onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const current = await settleWithin(supabase.auth.getSession(), SESSION_CHECK_TIMEOUT_MS, 'Secure session check');
              await verifyAccess(current.data.session);
            } catch (retryError) {
              setError(retryError?.name === 'TimeoutError' ? 'Secure session check is still taking too long. Try again in a moment.' : (retryError?.message || 'Could not check secure access.'));
            } finally {
              setBusy(false);
            }
          }}>Check access again</button>
          <button type="button" className="owner-auth-secondary" onClick={signOut}>Use another email</button>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      <button type="button" className="owner-auth-account-button" aria-label="Account security" onClick={() => setAccountOpen(v => !v)}>🔒</button>
      {accountOpen ? <div className="owner-auth-account-menu"><b>{session?.user?.email}</b><span>{offlineAccess ? 'Approved · cached secure session' : 'Approved · secure session'}</span><button type="button" onClick={signOut}>Sign out</button></div> : null}
      {offlineAccess ? <div className="owner-auth-offline-badge">Secure cached session</div> : null}
    </>
  );
}
