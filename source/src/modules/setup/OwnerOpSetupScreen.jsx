import React, { useMemo, useState } from 'react';
import {
  MODULE_CATALOG,
  OPERATOR_MODES,
  defaultsForMode,
  emptyOperatorProfile,
  modeLabel,
  normalizeOperatorProfile,
  writeOperatorProfile,
} from './operatorProfile.js';

function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'truck') return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if (name === 'briefcase') return <svg {...common}><path d="M4 7h16v13H4zM9 7V4h6v3M4 12h16"/></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z"/><path d="m8.8 12 2.1 2.1 4.4-4.5"/></svg>;
  if (name === 'percent') return <svg {...common}><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="m6 18 12-12"/></svg>;
  if (name === 'modules') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'chevron') return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function StepDots({ step, count = 4 }) {
  return (
    <div className="setup-progress" aria-label={`Step ${step + 1} of ${count}`}>
      {Array.from({ length:count }, (_, index) => <span key={index} className={index <= step ? 'active' : ''} />)}
    </div>
  );
}

function moduleTone(id = '') {
  if (['loads','settlements'].includes(id)) return 'indigo';
  if (['fuel','money'].includes(id)) return 'amber';
  if (['maintenance','expenses'].includes(id)) return 'slate';
  if (id === 'wallet') return 'violet';
  if (['logbook','dot','drive'].includes(id)) return 'blue';
  return 'teal';
}

export default function OwnerOpSetupScreen({ initialProfile, onComplete, onCancel }) {
  const initial = normalizeOperatorProfile(initialProfile || emptyOperatorProfile());
  const [step, setStep] = useState(initial.setupComplete ? 1 : 0);
  const [draft, setDraft] = useState(initial);
  const editing = Boolean(initial.setupComplete);

  const selectedMode = useMemo(() => OPERATOR_MODES.find(item => item.id === draft.mode) || null, [draft.mode]);

  function chooseMode(mode) {
    setDraft(current => ({
      ...current,
      mode,
      modules:defaultsForMode(mode),
      driverSharePercent:mode === 'leased_on' ? (current.driverSharePercent || 85) : current.driverSharePercent,
      carrierSharePercent:mode === 'leased_on' ? (current.carrierSharePercent || 15) : current.carrierSharePercent,
    }));
  }

  function setDriverShare(value) {
    const parsed = Math.max(0, Math.min(100, Number(value || 0)));
    setDraft(current => ({ ...current, driverSharePercent:parsed, carrierSharePercent:Math.max(0, 100 - parsed) }));
  }

  function toggleModule(id) {
    setDraft(current => {
      const active = current.modules.includes(id);
      let modules = active ? current.modules.filter(module => module !== id) : [...current.modules, id];
      if (id === 'logbook' && !active) modules = [...new Set([...modules, 'dot', 'drive'])];
      if (id === 'logbook' && active) modules = modules.filter(module => !['dot','drive'].includes(module));
      if (id === 'dot' && !active && !modules.includes('logbook')) modules.push('logbook');
      if (id === 'drive' && !active && !modules.includes('logbook')) modules.push('logbook');
      return { ...current, modules };
    });
  }

  function finish() {
    if (!draft.mode) return;
    const saved = writeOperatorProfile({ ...draft, setupComplete:true });
    onComplete?.(saved);
  }

  const canContinue = step === 0 || Boolean(draft.mode);

  return (
    <section className="screen setup-screen">
      <header className="setup-head">
        {editing && onCancel ? <button type="button" onClick={onCancel} aria-label="Close setup">‹</button> : <span />}
        <div><b>Road Ready</b><em>{editing ? 'Customize your setup' : 'Set up your owner-op hub'}</em></div>
        <span />
      </header>

      <main className="setup-body">
        <StepDots step={step} />

        {step === 0 && (
          <section className="setup-welcome">
            <span className="setup-hero-mark"><Icon name="truck" size={34} /></span>
            <p className="setup-kicker">Built around your operation</p>
            <h1>One app for the road and the business.</h1>
            <p className="setup-lead">Choose how you work. Road Ready will show only the modules you need, and Logbook stays optional.</p>
            <div className="setup-platform-card">
              <span><Icon name="shield" size={20} /></span>
              <div><b>Mobile-first from day one</b><em>Camera, offline storage and modular navigation are structured for the future iPhone and Android apps.</em></div>
            </div>
            <div className="setup-value-grid">
              <div><b>Scan anything</b><span>Rate con, BOL, POD, fuel, repair and receipts</span></div>
              <div><b>Know the numbers</b><span>Gross, percentage pay, costs, miles and profit</span></div>
              <div><b>Stay ready</b><span>Wallet, expirations, paperwork and next actions</span></div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="setup-step">
            <p className="setup-kicker">Step 1 · Your operation</p>
            <h1>How do you run?</h1>
            <p className="setup-lead">This controls your Home screen, bottom navigation and smart reminders.</p>
            <div className="setup-mode-list">
              {OPERATOR_MODES.map(mode => (
                <button key={mode.id} type="button" className={draft.mode === mode.id ? 'selected' : ''} onClick={() => chooseMode(mode.id)}>
                  <span className="setup-mode-icon"><Icon name={mode.id === 'leased_on' ? 'percent' : mode.id === 'driver' ? 'shield' : 'briefcase'} /></span>
                  <span><b>{mode.title}</b><em>{mode.detail}</em><small>{mode.badge}</small></span>
                  {draft.mode === mode.id ? <i><Icon name="check" size={17} /></i> : <Icon name="chevron" size={17} />}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="setup-step">
            <p className="setup-kicker">Step 2 · Business details</p>
            <h1>{selectedMode ? modeLabel(selectedMode.id) : 'Your operation'}</h1>
            <p className="setup-lead">These details personalize documents, load records and business reports.</p>
            <div className="setup-form-card">
              <label><span>Company or business name</span><input value={draft.companyName} onChange={event => setDraft({ ...draft, companyName:event.target.value })} placeholder="Narta Express LLC" /></label>
              {draft.mode === 'leased_on' ? (
                <label><span>Carrier you are leased to</span><input value={draft.carrierName} onChange={event => setDraft({ ...draft, carrierName:event.target.value })} placeholder="Carrier name" /></label>
              ) : null}
              <div className="setup-two-fields">
                <label><span>Truck / unit</span><input value={draft.truckNumber} onChange={event => setDraft({ ...draft, truckNumber:event.target.value })} placeholder="Unit 12" /></label>
                <label><span>Trailer optional</span><input value={draft.trailerNumber} onChange={event => setDraft({ ...draft, trailerNumber:event.target.value })} placeholder="Trailer 53" /></label>
              </div>
              {draft.mode === 'small_fleet' ? (
                <label><span>Number of trucks</span><input type="number" min="1" inputMode="numeric" value={draft.fleetSize} onChange={event => setDraft({ ...draft, fleetSize:event.target.value })} /></label>
              ) : null}
            </div>

            {draft.mode === 'leased_on' ? (
              <div className="setup-percentage-card">
                <div className="setup-card-title"><span><Icon name="percent" size={19} /></span><div><b>Lease percentage</b><em>Road Ready will calculate expected settlement pay per load.</em></div></div>
                <div className="setup-percent-grid">
                  <label><span>You receive</span><div><input inputMode="decimal" value={draft.driverSharePercent} onChange={event => setDriverShare(event.target.value)} /><b>%</b></div></label>
                  <label><span>Carrier keeps</span><div><input value={draft.carrierSharePercent} readOnly /><b>%</b></div></label>
                </div>
                <label className="setup-select-label"><span>Percentage applies to</span><select value={draft.percentageBasis} onChange={event => setDraft({ ...draft, percentageBasis:event.target.value })}><option value="linehaul">Linehaul only</option><option value="linehaul_fsc">Linehaul + fuel surcharge</option><option value="total_gross">Total gross</option></select></label>
              </div>
            ) : null}
          </section>
        )}

        {step === 3 && (
          <section className="setup-step">
            <p className="setup-kicker">Step 3 · Your modules</p>
            <h1>Keep Home simple.</h1>
            <p className="setup-lead">Turn modules on or off anytime. Scan stays available for every setup.</p>
            <div className="setup-module-list">
              {MODULE_CATALOG.map(module => {
                const active = draft.modules.includes(module.id);
                return (
                  <button key={module.id} type="button" className={active ? `selected ${moduleTone(module.id)}` : moduleTone(module.id)} onClick={() => toggleModule(module.id)}>
                    <span className="setup-module-check">{active ? <Icon name="check" size={16} /> : null}</span>
                    <span><b>{module.label}</b><em>{module.detail}</em></span>
                  </button>
                );
              })}
            </div>
            <div className="setup-summary-card">
              <span><Icon name="modules" size={21} /></span>
              <div><b>{draft.modules.length} modules selected</b><em>{draft.modules.includes('logbook') ? 'Logbook and driver workflow are enabled.' : 'Business tools work independently from Logbook.'}</em></div>
            </div>
          </section>
        )}
      </main>

      <footer className="setup-actions">
        {step > 0 ? <button type="button" className="setup-back" onClick={() => setStep(value => Math.max(0, value - 1))}>Back</button> : null}
        {step < 3 ? (
          <button type="button" className="setup-next" disabled={!canContinue} onClick={() => setStep(value => Math.min(3, value + 1))}>{step === 0 ? 'Get started' : 'Continue'} <Icon name="chevron" size={17} /></button>
        ) : (
          <button type="button" className="setup-next finish" disabled={!draft.modules.length} onClick={finish}><Icon name="check" size={18} /> Finish setup</button>
        )}
      </footer>
    </section>
  );
}
