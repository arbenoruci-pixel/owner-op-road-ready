'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './apply.module.css';

const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' ');
const steps = ['Experience', 'Contact', 'Equipment'];
const documents = [
  ['cdl', 'CDL copy'],
  ['registration', 'Truck registration or IRP cab card'],
  ['experience', 'Work references or records of driving experience'],
];

function Field({ name, label, hint, options, wide, ...props }) {
  return (
    <label className={wide ? styles.wideField : styles.field}>
      <span>{label}</span>
      {hint && <small id={name + '-hint'}>{hint}</small>}
      {options ? (
        <select name={name} required aria-describedby={hint ? name + '-hint' : undefined} {...props}>
          <option value="">Select an answer</option>
          {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      ) : (
        <input name={name} type="text" required maxLength={200} aria-describedby={hint ? name + '-hint' : undefined} {...props} />
      )}
    </label>
  );
}

function StateField(props) {
  return <Field {...props} options={states.map(state => [state, state])} />;
}

function readStep(form) {
  const data = new FormData(form);
  const values = Object.fromEntries(data);
  if (form.elements.namedItem('documents')) {
    values.documents = data.getAll('documents');
    values.consent = data.get('consent') || '';
  }
  return values;
}

function submission(values) {
  return {
    website: values.website || '',
    fullName: values.fullName.trim(), email: values.email.trim(), phone: values.phone.trim(),
    age24: values.age24 === 'yes', activeClassA: values.activeClassA === 'yes', cdlState: values.cdlState,
    cdlMonths: Number(values.cdlYears) * 12, otrMonths: Number(values.otrYears) * 12, amazonMonths: Number(values.amazonMonths),
    priorCarrier: values.priorCarrier.trim(), amazonCarrier: values.amazonCarrier.trim(), drivingHistory: values.drivingHistory,
    startDate: values.startDate, truckYear: Number(values.truckYear), truckMake: values.truckMake.trim(), truckModel: values.truckModel.trim(),
    truckVin: (values.truckVin || '').trim().toUpperCase(),
    registrationState: values.registrationState, registrationStatus: values.registrationStatus,
    garagingAddress: values.garagingAddress.trim(), trailer: (values.trailer || '').trim(), physicalDamage: values.physicalDamage === 'yes',
    declaredValue: values.physicalDamage === 'yes' ? Number(values.declaredValue) : null,
    documents: values.documents || [], consent: values.consent === 'on',
  };
}

export default function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState({});
  const [physicalDamage, setPhysicalDamage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef(null);
  const form = useRef(null);
  const lastRequest = useRef(null);
  const focusHeading = useRef(false);

  useEffect(() => {
    if (focusHeading.current) heading.current?.focus();
  }, [step, done]);

  function value(name) {
    return { name, defaultValue: saved[name] || '' };
  }

  function move(next, values) {
    setSaved(values);
    setError('');
    focusHeading.current = true;
    setStep(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = { ...saved, ...readStep(event.currentTarget) };
    setError('');
    if (step === 0 && (values.activeClassA !== 'yes' || Number(values.cdlYears) < 3 || Number(values.otrYears) < 3 || Number(values.amazonMonths) < 12)) {
      setError('To apply, you need an active U.S. Class A CDL held for at least 3 years, 3 recent years of verifiable OTR driving and 12 months driving Amazon Relay loads.');
      return;
    }
    if (step === 1) {
      const digits = values.phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15 || !/^[+0-9.()\s-]+$/.test(values.phone)) {
        setError('Enter a phone number with 10 to 15 digits, including your area code.');
        return;
      }
    }
    if (step < steps.length - 1) {
      move(step + 1, values);
      return;
    }

    setBusy(true);
    try {
      const data = submission(values);
      const fingerprint = JSON.stringify(data);
      if (lastRequest.current?.fingerprint !== fingerprint) {
        lastRequest.current = { fingerprint, id: crypto.randomUUID() };
      }
      data.requestId = lastRequest.current.id;
      const response = await fetch('/api/recruiting/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        setError(result?.error || 'We could not confirm receipt. Please try submitting again.');
        return;
      }
      focusHeading.current = true;
      setDone(true);
    } catch {
      setError('We could not confirm receipt. Check your connection and try submitting again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className={styles.panel}>
        <h2 ref={heading} tabIndex={-1}>Application received</h2>
        <p>Narta Express has received your pre-application. Our recruiting team will review it and contact you using the phone number or email you provided if we move forward.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <ol className={styles.progress} aria-label="Application progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className={index <= step ? styles.reached : undefined}>{label}</li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1}>{['Driving experience', 'Contact & work history', 'Truck & parking'][step]}</h2>
      <noscript><p>Enable JavaScript in your browser to complete this pre-application.</p></noscript>
      <form key={step} method="post" action="/api/recruiting/applications" ref={form} onSubmit={submit} onChange={() => { if (error) setError(''); }}>
        <div className={styles.fields}>
          {step === 0 && <>
            <Field {...value('age24')} label="Are you at least 24 years old?" options={yesNo} />
            <Field {...value('activeClassA')} label="Do you hold an active U.S. Class A CDL?" options={yesNo} />
            <StateField {...value('cdlState')} label="CDL issuing state" />
            <Field {...value('cdlYears')} label="Full years holding a Class A CDL" type="number" min="0" max="75" step="1" inputMode="numeric" />
            <Field {...value('otrYears')} label="Recent, verifiable OTR driving" hint="Enter full years driving over the road." type="number" min="0" max="75" step="1" inputMode="numeric" />
            <Field {...value('amazonMonths')} label="Amazon Relay driving" hint="Enter total months driving Relay loads." type="number" min="0" max="900" step="1" inputMode="numeric" />
          </>}
          {step === 1 && <>
            <Field {...value('fullName')} label="Full name" autoComplete="name" minLength={2} maxLength={120} wide />
            <Field {...value('email')} label="Email address" type="email" maxLength={254} autoComplete="email" autoCapitalize="none" />
            <Field {...value('phone')} label="Phone number" type="tel" autoComplete="tel" maxLength={32} />
            <Field {...value('priorCarrier')} label="Carrier that can verify your OTR driving" hint="Enter the carrier or business name." wide />
            <Field {...value('amazonCarrier')} label="Carrier you drove Amazon Relay loads for" hint="If you ran under your own authority, enter your business name." wide />
            <Field {...value('drivingHistory')} label="Driving record in the past 3 years" hint="Include personal and commercial driving. We review the details privately." options={[
              ['clear', 'No accidents, moving violations or suspensions'],
              ['review', 'I have something to discuss or I’m unsure'],
            ]} wide />
            <Field {...value('startDate')} label="When could you start?" type="date" />
          </>}
          {step === 2 && <>
            <Field {...value('truckYear')} label="Tractor model year" type="number" inputMode="numeric" min="1900" max={new Date().getUTCFullYear() + 1} />
            <Field {...value('truckMake')} label="Tractor make" />
            <Field {...value('truckModel')} label="Tractor model" />
            <Field {...value('truckVin')} label="Tractor VIN (optional)" hint="If available, enter the 17-character vehicle identification number." required={false} minLength={17} maxLength={17} pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}" title="Enter 17 letters and numbers, excluding I, O and Q." autoCapitalize="characters" spellCheck={false} />
            <StateField {...value('registrationState')} label="Truck registration state" />
            <Field {...value('registrationStatus')} label="Registration status" options={[['current', 'Current'], ['pending', 'Pending'], ['expired', 'Expired']]} />
            <Field {...value('trailer')} label="Trailer type (optional)" hint="Leave blank for power only." required={false} />
            <Field {...value('garagingAddress')} minLength={6} label="Where do you park your truck?" hint="Enter the actual parking street address, city, state and ZIP code." maxLength={400} wide />
            <Field name="physicalDamage" label="Do you want physical damage coverage for your tractor?" value={physicalDamage} onChange={event => setPhysicalDamage(event.target.value)} options={yesNo} wide />
            {physicalDamage === 'yes' && <Field {...value('declaredValue')} label="Declared tractor value (USD)" type="number" min="1" max="10000000" step="1" inputMode="numeric" />}
            <fieldset className={styles.documents}>
              <legend>Which documents can you provide privately?</legend>
              {documents.map(([id, label]) => <label className={styles.check} key={id}><input type="checkbox" name="documents" value={id} defaultChecked={saved.documents?.includes(id) || false} /><span>{label}</span></label>)}
            </fieldset>
            <label className={styles.checkConsent}>
              <input type="checkbox" name="consent" required defaultChecked={saved.consent === 'on'} />
              <span>I confirm these details are accurate and agree that Narta Express LLC may use them to review my pre-application and contact me about this opportunity.</span>
            </label>
            <label className={styles.trap} aria-hidden="true">Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
          </>}
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {step > 0 && <button type="button" className={styles.back} disabled={busy} onClick={() => move(step - 1, { ...saved, ...readStep(form.current) })}>Back</button>}
          <button className={styles.next} type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 2 ? 'Submit pre-application' : 'Continue'}</button>
        </div>
      </form>
    </section>
  );
}

const yesNo = [['yes', 'Yes'], ['no', 'No']];
