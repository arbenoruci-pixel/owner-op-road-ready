// Source functions installed after the legacy build finalizers.
// Keep the officer view and exported HTML on the same minimal manual RODS form.

function reportEventsForDay(state, day) {
  // Export recorded intervals. Review-only coverage must never become a
  // recorded OFF/Driving event merely because a roadside report was opened.
  const rows = sortEvents(state.eventsByDay?.[day] || []).filter(event =>
    !event.voided && !event.displayOnly && !event.syntheticCoverage
    && ['OFF','SB','D','ON'].includes(event.status)
    && event.startMin != null && event.endMin != null
    && String(event.startMin).trim() !== '' && String(event.endMin).trim() !== ''
    && Number.isFinite(Number(event.startMin)) && Number.isFinite(Number(event.endMin))
    && Number(event.startMin) >= 0 && Number(event.endMin) <= 1440
    && Number(event.endMin) > Number(event.startMin)
  );
  const zone = getHomeTerminalTimeZone(state);
  if (day !== localDayKey(new Date(), zone)) return rows.map(event => ({ ...event }));
  const minute = nowMin(zone);
  return rows.map((event, index) => {
    const live = index === rows.length - 1 && event.status === state.currentStatus
      && (event.source === 'live_status'
        || (state.manualDrivingSession?.active && state.manualDrivingSession.eventId === event.id));
    return { ...event, endMin:live ? minute : Math.min(Number(event.endMin), minute) };
  }).filter(event => event.endMin > Number(event.startMin));
}

function drivingMilesForDay(state, day, events = []) {
  const driving = events.filter(event => event.status === 'D');
  const recorded = value => value != null && String(value).trim() !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  const dayMiles = state.manualMilesByDay?.[day];
  if (recorded(dayMiles) && (Number(dayMiles) > 0 || !driving.length)) return Number(dayMiles);
  if (driving.length) {
    if (!driving.every(event => recorded(event.manualMiles))) return null;
    const total = driving.reduce((sum, event) => sum + Number(event.manualMiles), 0);
    return total > 0 ? total : null;
  }
  const zone = getHomeTerminalTimeZone(state);
  const end = day === localDayKey(new Date(), zone) ? nowMin(zone) : 1440;
  const covered = events.length && Number(events[0].startMin) === 0
    && Number(events.at(-1).endMin) === end
    && events.every((event, index) => !index || Number(events[index - 1].endMin) === Number(event.startMin));
  return covered ? 0 : null;
}

function reportEquipmentForDay(dayState, events = []) {
  const unique = values => [...new Set(values
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .map(value => String(value).trim().replace(/^Trailer\s+/i, ''))
    .filter(value => value && !/^(?:No trailer|None|Unit not set)$/i.test(value)))];
  const trucks = unique([unitName(dayState), ...events.flatMap(event => [event.truck, event.vehicleNumber])]);
  const trailers = unique([trailerName(dayState), ...events.flatMap(event => [
    event.trailer, event.trailerNumber, event.droppedTrailer, event.hookedTrailer,
  ])]);
  return { trucks:trucks.join(' · ') || 'Not recorded', trailers:trailers.join(' · ') || 'No trailer' };
}

function svgGraphMarkup(events = []) {
  const W = 930;
  const H = 205;
  const LEFT = 58;
  const RIGHT = 76;
  const TOP = 28;
  const ROW_H = 34;
  const BODY_W = W - LEFT - RIGHT;
  const statuses = ['OFF','SB','D','ON'];
  const totals = dutyTotals(events);
  const center = (status) => TOP + statuses.indexOf(status) * ROW_H + ROW_H / 2;
  const xFromMin = (m) => LEFT + (Math.max(0, Math.min(1440, Number(m || 0))) / 1440) * BODY_W;
  const rows = statuses.map((status, index) => `
    <text x="${LEFT - 10}" y="${center(status) + 4}" text-anchor="end" class="row-label">${status}</text>
    <line x1="${LEFT}" x2="${W - RIGHT}" y1="${TOP + index * ROW_H}" y2="${TOP + index * ROW_H}" class="grid-line" />
    <text x="${W - 10}" y="${center(status) + 4}" text-anchor="end" class="duty-total" data-status="${status}">${(totals[status] / 60).toFixed(2)}</text>`).join('');
  const bottom = `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${TOP + 4 * ROW_H}" y2="${TOP + 4 * ROW_H}" class="grid-line" />`;
  const ticks = Array.from({ length: 25 }).map((_, hour) => {
    const x = LEFT + (hour / 24) * BODY_W;
    const txt = hour === 0 || hour === 24 ? 'Midnight' : hour === 12 ? 'Noon' : String(hour > 12 ? hour - 12 : hour);
    return `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${TOP + 4 * ROW_H}" class="${hour % 6 === 0 ? 'hour-line major' : 'hour-line'}" /><text x="${x}" y="12" text-anchor="middle" class="hour-label">${txt}</text>`;
  }).join('');
  const quarterTicks = Array.from({ length:96 }, (_, quarter) => {
    if (quarter % 4 === 0) return '';
    const x = xFromMin(quarter * 15);
    return statuses.map((status, index) => {
      const bottom = TOP + (index + 1) * ROW_H;
      return `<line x1="${x}" x2="${x}" y1="${bottom - (quarter % 2 ? 8 : 15)}" y2="${bottom}" class="grid-line" />`;
    }).join('');
  }).join('');
  const sorted = sortEvents(events).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
  const body = sorted.map(event => {
    const y = center(event.status);
    return `<line x1="${xFromMin(event.startMin)}" x2="${xFromMin(event.endMin)}" y1="${y}" y2="${y}" stroke="#111" stroke-width="4" />`;
  }).join('');
  const transitions = sorted.slice(0, -1).map((event, index) => {
    const next = sorted[index + 1];
    if (event.status === next.status || Number(event.endMin) !== Number(next.startMin)) return '';
    const x = xFromMin(next.startMin);
    return `<line x1="${x}" x2="${x}" y1="${center(event.status)}" y2="${center(next.status)}" stroke="#111" stroke-width="3" />`;
  }).join('');
  const sum = `<text x="${W - 10}" y="12" text-anchor="end" class="hour-label">Hours</text><line x1="${W - RIGHT + 12}" x2="${W - 8}" y1="${TOP + 4 * ROW_H + 4}" y2="${TOP + 4 * ROW_H + 4}" stroke="#111" /><text x="${W - 10}" y="${H - 13}" text-anchor="end" class="duty-total">${(totalHours(events) / 60).toFixed(2)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="24-hour duty status graph with hours by status on the right" class="report-svg"><rect width="${W}" height="${H}" fill="#fff" />${ticks}${quarterTicks}${rows}${bottom}${transitions}${body}${sum}</svg>`;
}

function dailyLogStyleText() {
  return `
  .manual-rods{box-sizing:border-box;max-width:1040px;margin:16px auto;padding:20px;background:#fff;color:#111;border:1px solid #bbb;border-radius:0;box-shadow:none;font:13px/1.3 Arial,Helvetica,sans-serif;overflow:visible}
  .manual-rods *{box-sizing:border-box}
  .manual-rods .rods-head{display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;align-items:start;border-bottom:1px solid #777;padding-bottom:10px}
  .manual-rods .rods-brand{font-size:24px;font-weight:800;font-style:italic}
  .manual-rods .rods-title{text-align:center}
  .manual-rods .rods-title h1{font-size:20px;line-height:1.2;margin:0 0 3px;text-transform:uppercase}
  .manual-rods .rods-title p{font-size:11px;margin:0}
  .manual-rods .rods-date{text-align:right;font-size:11px}
  .manual-rods .rods-date span{display:block;margin-top:3px}
  .manual-rods .rods-meta{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 14px;font-size:12px}
  .manual-rods .rods-meta th,.manual-rods .rods-meta td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid #999;overflow-wrap:anywhere}
  .manual-rods .rods-meta th{width:17%;font-weight:700}
  .manual-rods .rods-meta td{width:33%}
  .manual-rods .rods-meta small{display:block;font-size:11px;margin-top:2px}
  .manual-rods .graph-wrap{border:0;border-radius:0;padding:0;overflow-x:auto;background:#fff;break-inside:avoid}
  .manual-rods .report-svg{display:block;width:100%;height:auto}
  .manual-rods .grid-line,.manual-rods .hour-line{stroke:#999;stroke-width:.8}
  .manual-rods .hour-line.major{stroke:#777;stroke-width:1}
  .manual-rods .hour-label{font-size:11px;fill:#111;font-weight:400}
  .manual-rods .row-label,.manual-rods .duty-total{font-size:15px;fill:#111;font-weight:400}
  .manual-rods .graph-hint{display:none}
  .manual-rods .event-table-wrap{overflow-x:auto;border:0;border-radius:0;margin-top:10px}
  .manual-rods .event-table{width:100%;border-collapse:collapse;font-size:12px}
  .manual-rods .event-table th,.manual-rods .event-table td{padding:7px 5px;border-bottom:1px solid #999;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  .manual-rods .event-table th{background:#fff;border-top:1px solid #777;font-size:12px;letter-spacing:0;text-transform:none}
  .manual-rods .rods-cert{margin-top:20px;text-align:center;break-inside:avoid}
  .manual-rods .rods-cert p{margin:0 0 12px;font-size:12px}
  .manual-rods .rods-cert small{display:block;margin:6px 0;font-size:11px}
  .manual-rods .rods-signature{display:grid;justify-items:center;min-height:55px}
  .manual-rods .rods-signature img{max-height:45px;max-width:240px;object-fit:contain}
  .manual-rods .rods-signature span{min-width:220px;padding-top:5px;border-top:1px solid #888;font-size:12px;font-weight:700}
  @media screen and (max-width:760px){
    .manual-rods{margin:8px 0;padding:12px;border-left:0;border-right:0;width:100%;min-width:0}
    .manual-rods .rods-head{grid-template-columns:1fr auto;gap:8px}
    .manual-rods .rods-brand{font-size:18px}
    .manual-rods .rods-title{grid-column:1/-1;grid-row:2;text-align:left}
    .manual-rods .rods-title h1{font-size:18px}
    .manual-rods .rods-meta th{width:22%}.manual-rods .rods-meta td{width:28%}
    .manual-rods .rods-meta th,.manual-rods .rods-meta td{padding:5px 4px;font-size:11px}
    .manual-rods .graph-wrap .report-svg{width:930px;max-width:none}
    .manual-rods .graph-hint{display:block;font-size:10px;margin:4px 0 8px;color:#555}
    .manual-rods .event-table{min-width:720px;display:table}
    .manual-rods .event-table thead{display:table-header-group}
    .manual-rods .event-table tbody{display:table-row-group}
    .manual-rods .event-table tr{display:table-row;margin:0;padding:0;border:0}
    .manual-rods .event-table th,.manual-rods .event-table td{display:table-cell;width:auto;font-size:11px;padding:6px 5px}
    .manual-rods .event-table td:before{content:none}
  }
  @page{size:Letter portrait;margin:.35in}
  @media print{
    .manual-rods{max-width:none;margin:0;padding:0;border:0;break-after:page;page-break-after:always}
    .manual-rods .rods-meta{margin-bottom:8px}.manual-rods .rods-meta th,.manual-rods .rods-meta td{padding:4px 5px;font-size:10px}
    .manual-rods .graph-wrap{overflow:visible;min-height:0}.manual-rods .report-svg{width:100%;min-width:0;min-height:0}
    .manual-rods .graph-hint{display:none}.manual-rods .event-table-wrap{overflow:visible}
    .manual-rods .event-table{font-size:9px}.manual-rods .event-table th,.manual-rods .event-table td{padding:4px;font-size:9px}
    .manual-rods .event-table thead{display:table-header-group}.manual-rods .event-table tr,.manual-rods .rods-head,.manual-rods .rods-meta{break-inside:avoid}
  }`;
}

function dayReportHtml(state, day) {
  const dayState = readLogbookDayState(state, day);
  const events = reportEventsForDay(state, day);
  const drivingMiles = drivingMilesForDay(state, day, events);
  const equipment = reportEquipmentForDay(dayState, events);
  const timeZone = getHomeTerminalTimeZone(dayState);
  const timeZoneLabel = timeZoneShortLabel(timeZone, new Date(`${day}T12:00:00Z`));
  const sig = signatureForDay(state, day);
  const eventRows = events.length ? events.map((event, index) => `
    <tr>
      <td data-label="No.">${index + 1}</td>
      <td data-label="Status">${htmlEscape(dotLineLabel(event))}</td>
      <td data-label="Start">${htmlEscape(timeLabel(event.startMin, true))}</td>
      <td data-label="Duration">${htmlEscape(durLabel(Number(event.endMin || 0) - Number(event.startMin || 0)))}</td>
      <td data-label="Location">${htmlEscape(joinLocation(event))}</td>
      <td data-label="CMV">${htmlEscape(event.truck || event.vehicleNumber || unitName(dayState))}</td>
      <td data-label="Remarks">${htmlEscape(sanitizeLogText(event.note || event.description || ''))}</td>
    </tr>`).join('') : '<tr><td colspan="7">No duty status entries recorded for this day.</td></tr>';
  const certified = Boolean(sig.signed && !sig.needsRecertification);
  const signatureDataUrl = certified ? (sig.signatureDataUrl || (sig.signatureRef === 'driverSignature' ? state.driverSignature?.dataUrl : '') || '') : '';
  const signatureHtml = signatureDataUrl ? `<img src="${htmlEscape(signatureDataUrl)}" alt="Driver signature" />` : '';
  const active = day === localDayKey(new Date(), timeZone);
  return `
  <section class="daily-log-page manual-rods" id="log-day-${htmlEscape(day)}">
    <header class="rods-head">
      <div class="rods-brand">Road Ready</div>
      <div class="rods-title"><h1>Driver's Daily Log</h1><p>Manual record of duty status</p></div>
      <div class="rods-date"><b>Log date:</b> ${htmlEscape(day)}${active ? '<span>In progress</span>' : ''}</div>
    </header>

    <table class="rods-meta" aria-label="Daily log identification">
      <tbody>
        <tr><th scope="row">Driver</th><td>${htmlEscape(driverName(dayState))}</td><th scope="row">Co-driver</th><td>${htmlEscape(dayState.coDrivers || 'None')}</td></tr>
        <tr><th scope="row">Carrier / USDOT</th><td colspan="3">${htmlEscape(carrierName(dayState))} (${htmlEscape(dotNumber(dayState))})</td></tr>
        <tr><th scope="row">Main office</th><td colspan="3">${htmlEscape(mainOffice(dayState))}</td></tr>
        <tr><th scope="row">Truck / tractor</th><td>${htmlEscape(equipment.trucks)}</td><th scope="row">Trailer</th><td>${htmlEscape(equipment.trailers)}</td></tr>
        <tr><th scope="row">Miles today</th><td>${htmlEscape(drivingMiles == null ? 'Not recorded' : drivingMiles.toFixed(2))}</td><th scope="row">Shipping docs</th><td>${htmlEscape(shippingDocs(state, day))}</td></tr>
        <tr><th scope="row">24-hour period starts</th><td>Midnight</td><th scope="row">Home-terminal time</th><td>${htmlEscape(timeZoneLabel)}<small>${htmlEscape(timeZone)}</small></td></tr>
      </tbody>
    </table>

    <div class="graph-wrap" role="region" aria-label="Scrollable 24-hour duty status graph" tabindex="0">${svgGraphMarkup(events)}</div>
    <div class="graph-hint">Swipe horizontally to review the full 24-hour graph.</div>

    <div class="event-table-wrap" role="region" aria-label="Duty status events" tabindex="0">
      <table class="event-table">
        <thead><tr><th>No.</th><th>Status</th><th>Start (${htmlEscape(timeZoneLabel)})</th><th>Duration</th><th>Location</th><th>CMV</th><th>Remarks</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </div>

    <div class="rods-cert">
      <p>I hereby certify that my data entries and my record of duty status for this day are true and correct.</p>
      <div class="rods-signature">${signatureHtml}<span>Driver Signature</span></div>
      <small>${htmlEscape(officerSignatureLabel(state, day))}</small>
    </div>
  </section>`;
}

function DailyPaper({ state, day }) {
  // The standalone file and in-app officer view share the same escaped markup.
  return <div className="dot-manual-report" dangerouslySetInnerHTML={{ __html:dayReportHtml(state, day) }} />;
}
