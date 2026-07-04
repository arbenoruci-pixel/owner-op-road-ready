import React, { useState } from 'react';
import { analyzeLinkedHos } from '../../core/hos/hosEngine.js';

function warningTypeFromText(text = '') {
  const t = String(text || '').toLowerCase();
  if (t.includes('14-hour')) return 'window14';
  if (t.includes('11-hour')) return 'drive11';
  if (t.includes('30-minute') || t.includes('8h without')) return 'break8';
  if (t.includes('70-hour') || t.includes('cycle')) return 'cycle70';
  if (t.includes('overlap')) return 'overlap';
  if (t.includes('rest')) return 'restWatch';
  if (t.includes('sleeper')) return 'split7watch';
  if (t.includes('certified')) return 'sign';
  if (t.includes('city/state') || t.includes('location')) return 'missingLocation';
  return '';
}

function targetForWarning(warning, ranges = []) {
  const text = String(warning?.text || '');
  const direct = ranges.find(range => range.text === text);
  if (direct) return direct;

  const type = warningTypeFromText(text);
  if (!type) return null;

  if (type === 'sign' || type === 'missingLocation') {
    return { type };
  }

  return ranges.find(range => range.type === type) || null;
}

function actionLabelForWarning(warning, target) {
  const type = target?.type || warningTypeFromText(warning?.text);
  if (type === 'sign') return 'Sign';
  if (type === 'missingLocation') return 'Fix location';
  if (target) return 'Review';
  return 'Review';
}

export default function HosCheck({ events, state, onIssueAction }) {
  const [open, setOpen] = useState(false);
  const result = analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {});
  const high = result.warnings.filter(w => w.severity === 'high').length;
  const medium = result.warnings.filter(w => w.severity === 'medium').length;
  const ok = result.warnings.length === 0;

  function issueClick(warning) {
    const target = targetForWarning(warning, result.violationRanges || []);
    onIssueAction?.({ warning, target, type: target?.type || warningTypeFromText(warning?.text) });
  }

  return (
    <div className={`logcheck-compact ${open ? 'open' : ''}`}>
      <button className="logcheck-summary" onClick={() => setOpen(!open)}>
        <div>
          <b>Log Check</b>
          <span>{ok ? 'No reviews' : `${result.warnings.length} review${result.warnings.length === 1 ? '' : 's'}`}</span>
        </div>
        <em className={high ? 'bad' : medium ? 'warn' : 'ok'}>{ok ? 'OK' : high ? `${high} high` : `${medium} watch`}</em>
      </button>

      {open && (
        <>
          <div className="logcheck-cards">
            {result.cards.map(card => (
              <div key={card.label} className={card.ok ? 'ok' : 'warn'}>
                <span>{card.label}</span>
                <b>{card.value}</b>
                <small>{card.sub}</small>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="logcheck-warnings">
              {result.warnings.map((w, i) => {
                const target = targetForWarning(w, result.violationRanges || []);
                const canOpen = !!target || /certified|city\/state|location/i.test(String(w.text || ''));
                return (
                  <button
                    key={i}
                    type="button"
                    className={`hos-warning ${w.severity} ${canOpen ? 'tap-fix' : ''}`}
                    onClick={() => issueClick(w)}
                  >
                    <span>⚠ {w.text}</span>
                    <b>{actionLabelForWarning(w, target)}</b>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
