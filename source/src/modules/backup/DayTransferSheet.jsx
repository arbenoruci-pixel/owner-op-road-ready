import React, { useMemo, useRef, useState } from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';
import {
  buildDayBackupPayload,
  dayBackupSummary,
  extractDayBackupPayload,
} from '../../core/backup/dayTransfer.js';

function dayLabel(day = '') {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day || 'Selected day';
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fileNameForDay(day = '') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return `road-ready-day-${day}-${stamp}.json`;
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DayTransferSheet({ state, day, onClose, onImportDay }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const summary = useMemo(() => dayBackupSummary(buildDayBackupPayload(state, day, CURRENT_APP_VERSION)), [state, day]);

  function exportDay() {
    setBusy(true);
    setStatus('Saving this day…');
    try {
      const payload = buildDayBackupPayload(state, day, CURRENT_APP_VERSION);
      const filename = fileNameForDay(day);
      downloadJson(payload, filename);
      setStatus(`Day exported: ${filename}`);
    } catch (error) {
      setStatus(error?.message || 'Day export failed');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setStatus('Reading day file…');
    try {
      const payload = extractDayBackupPayload(JSON.parse(await file.text()));
      const imported = dayBackupSummary(payload);
      const sameDay = imported.sourceDay === day;
      const message = sameDay
        ? [
          `Restore ${dayLabel(day)} from this day file?`,
          '',
          `${imported.events} duty event(s) will replace the current events on this day.`,
          'The current version of this day will be kept as a local safety backup.',
        ].join('\n')
        : [
          `Import ${dayLabel(imported.sourceDay)} into ${dayLabel(day)}?`,
          '',
          `${imported.events} duty event(s) will replace the current events on ${day}.`,
          'Event times and locations will be copied. Certification, signature, and inspection will be cleared because the date is different.',
          'The current version of the target day will be kept as a local safety backup.',
        ].join('\n');

      if (typeof window !== 'undefined' && !window.confirm(message)) {
        setStatus('Import cancelled');
        return;
      }

      await onImportDay?.(payload, { filename:file.name, sourceDay:imported.sourceDay, targetDay:day });
      setStatus(`Imported ${imported.events} event(s) into ${day}.`);
    } catch (error) {
      setStatus(error?.message || 'Day import failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy(false);
    }
  }

  return (
    <div className="sheet active day-transfer-sheet">
      <div className="sheet-head">
        <button type="button" onClick={onClose}>‹</button>
        <div>Export / Import Day</div>
        <span />
      </div>

      <div className="day-transfer-body">
        <section className="day-transfer-summary">
          <span>Selected log day</span>
          <b>{dayLabel(day)}</b>
          <em>{day}</em>
          <div>
            <strong>{summary.events}</strong><small>events</small>
            <strong>{summary.routeLegs}</strong><small>route legs</small>
            <strong>{summary.manualMiles || 0}</strong><small>miles</small>
          </div>
        </section>

        <section className="day-transfer-actions">
          <button type="button" className="primary" onClick={exportDay} disabled={busy}>Export this day</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import into this day</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => importFile(event.target.files?.[0])}
          />
        </section>

        <section className="day-transfer-note">
          <b>Safe day restore</b>
          <p>Only the open log day is replaced. Other days, DOT wallet documents, settings, and app data stay unchanged.</p>
        </section>

        {status ? <div className="day-transfer-status">{status}</div> : null}
      </div>
    </div>
  );
}
