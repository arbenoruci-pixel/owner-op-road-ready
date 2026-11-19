'use client';

import { useEffect, useRef, useState } from 'react';
import { canEnterWorkHistory, applicationPayload, documents, drivingRecords, registrationStatuses, reviewRows, states, steps, validateStep } from './application.js';
import styles from './apply.module.css';

const yesNo = [['yes', 'Yes'], ['no', 'No']];
const stateOptions = states.map(state => [state, state]);
const monthOptions = Array.from({ length: 12 }, (_, month) => [String(month), String(month)]);
const amazonOptions = [['under', 'Less than 1 year'], ['year', '1 year'], ['longer', 'More than 1 year']];
const lastStep = steps.length - 1;

function Help({ name, hint, error }) {
  return <>
    {hint && <small id={name + '-hint'}>{hint}</small>}
    {error && <small className={styles.fieldError} id={name + '-error'}>{error}</small>}
  </>;
}

function accessibility(name, hint, error) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hint && name + '-hint', error && name + '-error'].filter(Boolean).join(' ') || undefined,
  };
}

function Field({ name, label, hint, error, options, wide, value, onChange, onBlur, type = 'text', required = true, ...props }) {
  const common = { name, id: name, value, required, onChange: event => onChange(event.target.value), onBlur, ...accessibility(name, hint, error), ...props };
  return (
    <div className={wide ? styles.wideField : styles.field}>
      <label htmlFor={name}>{label}</label>
      {options ? <select {...common}>
        <option value="">Select an answer</option>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select> : <input type={type} maxLength={200} {...common} />}
      <Help name={name} hint={hint} error={error} />
    </div>
  );
}

function Choice({ name, label, hint, error, options = yesNo, value, onChange }) {
  return (
    <fieldset className={styles.choiceGroup}>
      <legend>{label}</legend>
      <div className={styles.segmented}>
        {options.map(([key, text]) =>
          <label key={key} className={[styles.choice, value === key && styles.choiceSelected].filter(Boolean).join(' ')}>
            <input type="radio" name={name} value={key} checked={value === key} required
              onChange={() => onChange(key)} {...accessibility(name, hint, error)} /><span>{text}</span>
          </label>
        )}
      </div>
      <Help name={name} hint={hint} error={error} />
    </fieldset>
  );
}

export default function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ documents: [], consent: false, amazonExtraMonths: '0' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef(null);
  const panel = useRef(null);
  const form = useRef(null);
  const lastRequest = useRef(null);
  const focusHeading = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (focusHeading.current) {
      heading.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ block: 'start' });
    }
  }, [step, done]);

  function update(name, value) {
    setValues(previous => {
      const next = { ...previous, [name]: value };
      if (name === 'sameCarrier' && value) next.amazonCarrier = next.priorCarrier || '';
      if (name === 'priorCarrier' && next.sameCarrier) next.amazonCarrier = value;
      return next;
    });
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setServerError('');
  }

  function bind(name) {
    return {
      name, value: values[name] ?? '', error: errors[name],
      onChange: value => update(name, value),
      onBlur: () => {
        if (values[name] !== undefined && values[name] !== '') {
          const message = validateStep(step, values)[name];
          setErrors(previous => ({ ...previous, [name]: message }));
        }
      },
    };
  }

  function go(next, edit = false) {
    setErrors({});
    setServerError('');
    setEditing(edit);
    focusHeading.current = true;
    setStep(next);
  }

  function showErrors(messages) {
    setErrors(messages);
    const name = Object.keys(messages)[0];
    requestAnimationFrame(() => {
      const input = form.current?.querySelector('[name="' + name + '"]:checked') || form.current?.querySelector('[name="' + name + '"]');
      const details = input?.closest('details');
      if (details) details.open = true;
      input?.focus({ preventScroll: true });
      const field = input?.closest('fieldset') || input;
      field?.scrollIntoView({ block: 'center' });
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const messages = validateStep(step, values);
    if (Object.keys(messages).length) {
      showErrors(messages);
      return;
    }
    if (step !== lastStep) {
      go(editing ? lastStep : step + 1);
      return;
    }

    setBusy(true);
    submitting.current = true;
    setServerError('');
    try {
      const data = applicationPayload(values);
      const fingerprint = JSON.stringify(data);
      if (lastRequest.current?.fingerprint !== fingerprint) lastRequest.current = { fingerprint, id: crypto.randomUUID() };
      data.requestId = lastRequest.current.id;
      const response = await fetch('/api/recruiting/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        setServerError(result?.error || 'We could not confirm receipt. Please try submitting again.');
        return;
      }
      focusHeading.current = true;
      setDone(true);
    } catch {
      setServerError('We could not confirm receipt. Check your connection and try submitting again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (done) return (
    <section ref={panel} className={styles.panel + ' ' + styles.success}>
      <h2 ref={heading} tabIndex={-1}>Application received</h2>
      <p>Narta Express has received your pre-application. Our recruiting team will review it and contact you using the phone number or email you provided if we move forward.</p>
    </section>
  );

  const amazonTooShort = values.amazonDuration === 'under' ? 'Narta requires a full year (12 months) of Amazon Relay driving. You can apply once you reach 12 months.' : '';
  const activeCdlMessage = values.activeClassA === 'no' ? 'You need an active U.S. Class A CDL to apply.' : '';
  const showCarrierFields = canEnterWorkHistory(values);

  return (
    <section ref={panel} className={styles.panel} aria-labelledby="step-title">
      <div className={styles.progressMeta}><span className={styles.stepLabel}>Step {step + 1} of {steps.length}</span><span>{steps[step][0]}</span></div>
      <div className={styles.progressTrack} role="progressbar" aria-label="Application progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1}><span className={styles.progressFill} style={{ width: ((step + 1) * 100 / steps.length) + '%' }} /></div>
      <h2 ref={heading} id="step-title" tabIndex={-1}>{steps[step][1]}</h2>
      <p className={styles.sectionHint}>{steps[step][2]}</p>
      <noscript><p>Enable JavaScript in your browser to complete this pre-application.</p></noscript>
      <form ref={form} key={step} method="post" action="/api/recruiting/applications" onSubmit={submit} noValidate>
        <div className={styles.fields}>
          {step === 0 && <>
            <Choice {...bind('activeClassA')} label="Do you hold an active U.S. Class A CDL?" error={errors.activeClassA || activeCdlMessage} />
            <Field {...bind('cdlState')} label="CDL issuing state" options={stateOptions} />
            <Field {...bind('cdlYears')} label="Full years holding a Class A CDL" hint="Minimum 3 years." type="number" min="0" max="75" step="1" inputMode="numeric" />
            <Choice {...bind('age24')} label="Are you at least 24 years old?" hint="For insurance review." />
          </>}
          {step === 1 && <>
            <Field {...bind('otrYears')} label="Full years of recent, verifiable OTR driving" hint="Count over-the-road driving. Minimum 3 years." type="number" min="0" max="75" step="1" inputMode="numeric" wide />
            <Choice {...bind('amazonDuration')} options={amazonOptions} label="How long have you driven Amazon Relay loads?" hint="Minimum 1 year (12 months)." error={errors.amazonDuration || amazonTooShort} />
            {values.amazonDuration === 'longer' && <>
              <Field {...bind('amazonYears')} label="Full years driving Amazon Relay" type="number" min="1" max="75" step="1" inputMode="numeric" />
              <Field {...bind('amazonExtraMonths')} label="Additional months" options={monthOptions} />
            </>}
            {showCarrierFields && <>
              <Field {...bind('priorCarrier')} label="Carrier that can verify your OTR driving" hint="Enter the carrier or your own business name." wide />
              <div className={styles.wideField}>
                <label className={styles.check}><input type="checkbox" name="sameCarrier" checked={!!values.sameCarrier}
                  onChange={event => update('sameCarrier', event.target.checked)} /><span>I drove Amazon Relay for the same carrier</span></label>
                {!values.sameCarrier && <Field {...bind('amazonCarrier')} label="Carrier you drove Amazon Relay loads for" hint="If you ran under your own authority, enter your business name." />}
              </div>
              <Field {...bind('drivingHistory')} label="Driving record in the past 3 years" hint="Include personal and commercial driving. Details are reviewed privately." options={drivingRecords} wide />
            </>}
          </>}
          {step === 2 && <>
            <Field {...bind('fullName')} label="Full name" autoComplete="name" minLength={2} maxLength={120} wide />
            <Field {...bind('email')} label="Email address" type="email" maxLength={254} autoComplete="email" autoCapitalize="none" />
            <Field {...bind('phone')} label="Phone number" type="tel" autoComplete="tel" maxLength={35} />
            <Field {...bind('startDate')} label="Available start date" type="date" />
          </>}
          {step === 3 && <>
            <Field {...bind('truckYear')} label="Tractor model year" type="number" inputMode="numeric" min="1900" max={new Date().getUTCFullYear() + 1} />
            <Field {...bind('truckMake')} label="Tractor make" />
            <Field {...bind('truckModel')} label="Tractor model" />
            <Field {...bind('truckVin')} label="Tractor VIN (optional)" hint="Enter 17 characters if available." required={false} maxLength={17} autoCapitalize="characters" spellCheck={false} />
            <Field {...bind('registrationState')} label="Truck registration state" options={stateOptions} />
            <Field {...bind('registrationStatus')} label="Registration status" options={registrationStatuses} />
            <Field {...bind('trailer')} label="Trailer type (optional)" hint="Leave blank for power only." required={false} wide />
          </>}
          {step === 4 && <>
            <Field {...bind('garagingAddress')} label="Truck parking address" hint="Enter the street address, city, state and ZIP code." maxLength={400} wide />
            <Choice {...bind('physicalDamage')} label="Do you want physical damage coverage for your tractor?" />
            {values.physicalDamage === 'yes' && <Field {...bind('declaredValue')} label="Declared tractor value (USD)" hint="Enter the value in whole dollars." type="number" min="1" max="10000000" step="1" inputMode="numeric" wide />}
            <fieldset className={styles.documents}>
              <legend>Which documents can you provide privately?</legend>
              {documents.map(([key, label]) => <label className={styles.check} key={key}>
                <input type="checkbox" name="documents" value={key} checked={values.documents.includes(key)}
                  onChange={event => update('documents', event.target.checked ? [...values.documents, key] : values.documents.filter(id => id !== key))} /><span>{label}</span>
              </label>)}
            </fieldset>
          </>}
          {step === lastStep && <>
            <div className={styles.reviewList}>
              {reviewRows(values).map((rows, index) => <section className={styles.reviewGroup} key={steps[index][0]}>
                <div className={styles.reviewHead}><h3>{steps[index][0]}</h3>
                  <button className={styles.editLink} type="button" aria-label={'Edit ' + steps[index][0].toLowerCase()} disabled={busy} onClick={() => go(index, true)}>Edit</button>
                </div>
                <dl className={styles.reviewRows}>{rows.map(([label, answer]) => <div key={label}><dt>{label}</dt><dd>{answer}</dd></div>)}</dl>
              </section>)}
            </div>
            <div className={styles.wideField}>
              <label className={styles.checkConsent}>
                <input type="checkbox" name="consent" required checked={values.consent}
                  onChange={event => update('consent', event.target.checked)} {...accessibility('consent', null, errors.consent)} />
                <span>I confirm these details are accurate and agree that Narta Express LLC may review my pre-application and contact me about this opportunity.</span>
              </label>
              <Help name="consent" error={errors.consent} />
            </div>
            <label className={styles.trap} aria-hidden="true">Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website || ''} onChange={event => update('website', event.target.value)} /></label>
          </>}
        </div>
        {serverError && <p role="alert" className={styles.error}>{serverError}</p>}
        <div className={styles.actions}>
          {step > 0 && !editing && <button type="button" className={styles.back} disabled={busy} onClick={() => go(step - 1)}>Back</button>}
          <button className={styles.next} type="submit" disabled={busy}>{busy ? 'Submitting…' : step === lastStep ? 'Submit pre-application' : editing ? 'Save and return to review' : 'Continue'}</button>
        </div>
      </form>
    </section>
  );
}
