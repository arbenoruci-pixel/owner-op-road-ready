import React from 'react';
import { AppIcon } from './PhoneHomeToolsV110435.jsx';
import './today.css';

export default function TodayNav({ active, onToday, onLoads, onLog, onMore }) {
  const tabs = [
    ['today', 'Today', onToday],
    ['loads', 'Loads', onLoads],
    ['logbook', 'Logbook', onLog],
    ['more', 'More', onMore],
  ];
  return <nav className="rr-today-nav" aria-label="Driver navigation">
    {tabs.filter(([, , action]) => action).map(([id, label, action]) =>
      <button type="button" key={id} onClick={action} aria-label={id === 'logbook' ? 'Open logbook' : id === 'more' ? 'More tools' : label} aria-current={active === id ? 'page' : undefined}>
        {id === 'today' || id === 'more' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          {id === 'today' ? <path d="m3 11 9-8 9 8v9h-6v-6H9v6H3z"/> : <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>}
        </svg> : <AppIcon name={id}/>}
        <span>{label}</span>
      </button>
    )}
  </nav>;
}
