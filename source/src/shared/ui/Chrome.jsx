import React from 'react';

export function Header({ title, onBack, onRight, right='⋯' }) {
  return (
    <header className="road-topbar">
      <button className="road-topbar-btn" onClick={onBack} aria-label={onBack ? 'Back' : 'Menu'}>{onBack ? '‹' : '☰'}</button>
      <div className="road-topbar-title">
        <span>Log day</span>
        <b>{title}</b>
      </div>
      <button className="road-topbar-btn" onClick={onRight} aria-label="Tools">{right}</button>
    </header>
  );
}

export function Tabs({ active='log', onTab=()=>{} }) {
  const tabs = [
    ['log', 'Log'],
    ['form', 'Form'],
    ['sign', 'Sign'],
    ['inspection', 'Inspect'],
  ];

  return (
    <nav className="road-tabs" aria-label="Log sections">
      {tabs.map(([id, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onTab(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
