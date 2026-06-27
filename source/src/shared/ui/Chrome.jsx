import React from 'react';

export function Header({ title, onBack, onRight, right='⋮' }) {
  return (
    <div className="dark-head">
      <button onClick={onBack}>{onBack ? '‹' : '☰'}</button>
      <div className="dark-title">{title}</div>
      <button onClick={onRight}>{right}</button>
    </div>
  );
}

export function Tabs({ active='log', onTab=()=>{} }) {
  const tabs = [
    ['log', 'Log'],
    ['form', 'Form'],
    ['sign', 'Sign'],
    ['inspection', 'Inspection'],
  ];

  return (
    <div className="tabs compact-tabs">
      {tabs.map(([id, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
