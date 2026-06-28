import { durLabel, nowMin } from '../../shared/utils/time.js';
import { makeContinuousLogEvents } from '../timeline/timelineEngine.js';

const HOUR = 60;

function dayIndex(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function absMin(dayKey, min) {
  return dayIndex(dayKey) * 1440 + Number(min || 0);
}

function dayStartAbs(dayKey) {
  return absMin(dayKey, 0);
}

function shortTime(absMinute) {
  const m = ((Math.round(absMinute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

function sortByStart(events) {
  return [...(events || [])].sort((a,b) => a.startAbs - b.startAbs);
}

function isRestStatus(status) {
  return status === 'OFF' || status === 'SB';
}

function isOnDuty(status) {
  return status === 'ON' || status === 'D';
}

function reasonText(e) {
  return `${e.note || ''} ${e.description || ''} ${e.reason || ''}`.toLowerCase();
}

function statusReasonMismatch(e) {
  const t = reasonText(e);

  const onDutyWords = [
    'pre-trip', 'pre trip', 'pretrip',
    'post-trip', 'post trip', 'posttrip',
    'inspection', 'fuel', 'loading', 'unloading',
    'pickup', 'pick up', 'delivery', 'drop', 'hook',
    'paperwork', 'waiting', 'dock', 'maintenance', 'repair',
    'scale', 'washout', 'on duty', 'on-duty', 'working'
  ];

  const restWords = [
    'sleep', 'sleeper', 'break', 'rest', 'off duty', 'off-duty',
    'parking', 'home', 'hotel'
  ];

  const drivingWords = ['driving', 'drive', 'en route', 'moving'];

  if (e.status === 'D' && onDutyWords.some(w => t.includes(w))) {
    return {
      severity: 'high',
      type: 'statusReason',
      text: `${e.note || 'This event'} should be ON, not Driving.`
    };
  }

  if ((e.status === 'OFF' || e.status === 'SB') && onDutyWords.some(w => t.includes(w))) {
    return {
      severity: 'high',
      type: 'statusReason',
      text: `${e.note || 'This event'} is work time, not rest.`
    };
  }

  if (e.status === 'ON' && restWords.some(w => t.includes(w))) {
    return {
      severity: 'medium',
      type: 'statusReason',
      text: `${e.note || 'This event'} looks like rest, not ON duty.`
    };
  }

  if (e.status !== 'D' && drivingWords.some(w => t.includes(w))) {
    return {
      severity: 'medium',
      type: 'statusReason',
      text: `${e.note || 'This event'} looks like driving.`
    };
  }

  return null;
}

function statusReasonWarnings(timeline) {
  return timeline
    .map(e => ({ e, m: statusReasonMismatch(e) }))
    .filter(x => x.m)
    .map(x => ({ severity: x.m.severity, text: x.m.text }));
}

function eventDuration(e) {
  return Math.max(0, e.endAbs - e.startAbs);
}

function eventPartOnDay(e, activeDay, startAbs, endAbs, type, text, severity = 'high') {
  const ds = dayStartAbs(activeDay);
  const de = ds + 1440;
  const s = Math.max(startAbs, ds);
  const en = Math.min(endAbs, de);
  if (en <= s) return null;
  return {
    id: `${type}_${e.id}_${Math.round(s)}`,
    eventId: e.id,
    status: e.status,
    startMin: Math.max(0, Math.round(s - ds)),
    endMin: Math.min(1440, Math.round(en - ds)),
    type,
    text,
    severity,
  };
}

export function buildContinuousTimeline(eventsByDay = {}, activeDay) {
  const today = todayKey();
  const n = nowMin();
  const out = [];

  Object.entries(eventsByDay || {}).forEach(([dayKey, rawEvents]) => {
    const continuousEvents = makeContinuousLogEvents(rawEvents || [], {
      isCurrentDay: dayKey === today && dayKey === activeDay,
      nowMinute: n,
    });

    continuousEvents.forEach((raw) => {
      const start = Number(raw.startMin || 0);
      const end = Number(raw.endMin ?? start + 1);
      if (end <= start) return;
      out.push({
        ...raw,
        dayKey,
        startAbs: absMin(dayKey, Math.max(0, Math.min(1440, start))),
        endAbs: absMin(dayKey, Math.max(1, Math.min(1440, end))),
      });
    });
  });

  return sortByStart(out);
}

export function findGapsAndOverlaps(timeline) {
  const warnings = [];
  const evs = sortByStart(timeline);
  for (let i = 0; i < evs.length - 1; i++) {
    const a = evs[i];
    const b = evs[i+1];
    const gap = b.startAbs - a.endAbs;
    if (gap > 1 && a.dayKey === b.dayKey) {
      warnings.push({ severity:'medium', text:`Gap in log around ${shortTime(a.endAbs)}.` });
    }
    if (gap < -1) {
      warnings.push({ severity:'high', text:`Overlap in log around ${shortTime(b.startAbs)}.` });
    }
  }
  return warnings;
}

export function findRestBlocks(timeline) {
  const evs = sortByStart(timeline);
  const blocks = [];

  for (const e of evs) {
    if (!isRestStatus(e.status)) continue;
    const last = blocks[blocks.length - 1];
    const dur = eventDuration(e);

    if (last && e.startAbs <= last.endAbs + 1 && isRestStatus(e.status)) {
      last.endAbs = Math.max(last.endAbs, e.endAbs);
      last.duration = Math.max(0, last.endAbs - last.startAbs);
      last.events.push(e);
      last.statusSet.add(e.status);
      if (e.status === 'SB') last.sleeperMins += dur;
      if (e.status === 'OFF') last.offMins += dur;
      last.allSleeper = last.allSleeper && e.status === 'SB';
    } else {
      blocks.push({
        startAbs: e.startAbs,
        endAbs: e.endAbs,
        duration: dur,
        events: [e],
        statusSet: new Set([e.status]),
        sleeperMins: e.status === 'SB' ? dur : 0,
        offMins: e.status === 'OFF' ? dur : 0,
        allSleeper: e.status === 'SB',
      });
    }
  }

  return blocks;
}

function latestFullReset(restBlocks, beforeAbs) {
  return restBlocks
    .filter(b => b.duration >= 10 * HOUR && b.endAbs <= beforeAbs)
    .sort((a,b) => b.endAbs - a.endAbs)[0] || null;
}

function latest34Restart(restBlocks, beforeAbs) {
  return restBlocks
    .filter(b => b.duration >= 34 * HOUR && b.endAbs <= beforeAbs)
    .sort((a,b) => b.endAbs - a.endAbs)[0] || null;
}

function findSplitPairs(restBlocks, beforeAbs) {
  const qualifying = restBlocks.filter(b => b.endAbs <= beforeAbs && b.duration >= 2 * HOUR);
  const pairs = [];

  for (let i = 0; i < qualifying.length; i++) {
    for (let j = i + 1; j < qualifying.length; j++) {
      const a = qualifying[i];
      const b = qualifying[j];

      const aIsLongSleeper = a.allSleeper && a.duration >= 7 * HOUR;
      const bIsLongSleeper = b.allSleeper && b.duration >= 7 * HOUR;
      const total = a.duration + b.duration;

      if ((aIsLongSleeper || bIsLongSleeper) && total >= 10 * HOUR) {
        pairs.push({
          first: a,
          second: b,
          longSleeper: aIsLongSleeper ? a : b,
          shortRest: aIsLongSleeper ? b : a,
          total,
          recalculationPoint: a.endAbs,
          pairEnd: b.endAbs,
        });
      }
    }
  }

  return pairs.sort((a,b) => b.pairEnd - a.pairEnd);
}

function currentRestProgress(restBlocks, currentEndAbs) {
  const current = restBlocks
    .filter(b => b.startAbs <= currentEndAbs && b.endAbs >= currentEndAbs - 2)
    .sort((a,b) => b.endAbs - a.endAbs)[0];

  if (!current) return null;

  return {
    duration: current.duration,
    fullResetLeft: Math.max(0, 10 * HOUR - current.duration),
    sleeperLeft: current.allSleeper ? Math.max(0, 7 * HOUR - current.duration) : null,
    block: current,
  };
}

function calculateBreak(events, resetAbs) {
  const evs = sortByStart(events).filter(e => e.endAbs > resetAbs);
  let driveSinceBreak = 0;
  let needed = false;

  for (const e of evs) {
    const dur = eventDuration(e);
    if (e.status === 'D') {
      driveSinceBreak += dur;
      if (driveSinceBreak > 8 * HOUR) needed = true;
    } else if (dur >= 30) {
      driveSinceBreak = 0;
      needed = false;
    }
  }

  return { driveSinceBreak, needed, left: Math.max(0, 8 * HOUR - driveSinceBreak) };
}

function calculateCycle(events, restBlocks, currentEndAbs, cycleHours = 70, cycleDays = 8) {
  const restart = latest34Restart(restBlocks, currentEndAbs);
  const windowStart = Math.max(
    currentEndAbs - cycleDays * 1440,
    restart ? restart.endAbs : -Infinity
  );

  const used = events
    .filter(e => e.endAbs > windowStart && e.startAbs <= currentEndAbs && isOnDuty(e.status))
    .reduce((sum, e) => sum + eventDuration(e), 0);

  return {
    used,
    left: Math.max(0, cycleHours * HOUR - used),
    exceeded: used > cycleHours * HOUR,
    cycleHours,
    cycleDays,
    restart,
  };
}

function windowLimitAbs(dutyStartAbs, currentEndAbs, split) {
  if (!split) return dutyStartAbs + 14 * HOUR;

  const exclusions = [split.first, split.second]
    .filter(Boolean)
    .map(b => ({ startAbs: b.startAbs, endAbs: b.endAbs }))
    .sort((a,b)=>a.startAbs-b.startAbs);

  let cursor = dutyStartAbs;
  let remaining = 14 * HOUR;

  for (const ex of exclusions) {
    if (ex.endAbs <= cursor) continue;
    const openEnd = Math.min(ex.startAbs, currentEndAbs);
    if (openEnd > cursor) {
      const openDur = openEnd - cursor;
      if (openDur >= remaining) return cursor + remaining;
      remaining -= openDur;
    }
    cursor = Math.max(cursor, ex.endAbs);
    if (cursor >= currentEndAbs) return null;
  }

  if (currentEndAbs - cursor >= remaining) return cursor + remaining;
  return null;
}

export function violationRangesForDay(eventsByDay = {}, activeDay) {
  const timeline = buildContinuousTimeline(eventsByDay, activeDay);
  if (!timeline.length || !activeDay) return [];

  const currentEndAbs = Math.max(...timeline.map(e => e.endAbs));
  const restBlocks = findRestBlocks(timeline);
  const fullReset = latestFullReset(restBlocks, currentEndAbs);
  const latestSplit = findSplitPairs(restBlocks, currentEndAbs)[0] || null;

  const resetAbs = Math.max(
    fullReset ? fullReset.endAbs : -Infinity,
    latestSplit ? latestSplit.recalculationPoint : -Infinity
  );
  const validResetAbs = Number.isFinite(resetAbs) ? resetAbs : -Infinity;
  const afterReset = timeline.filter(e => e.endAbs > validResetAbs && e.startAbs <= currentEndAbs);

  const ranges = [];
  const pushRange = (range) => {
    if (!range) return;
    if (range.endMin <= range.startMin) return;
    ranges.push(range);
  };

  // Status/reason mismatch: example D + Pre-trip inspection should be ON.
  for (const e of timeline) {
    const mismatch = statusReasonMismatch(e);
    if (mismatch) {
      pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, mismatch.type, mismatch.text, mismatch.severity));
    }
  }

  // Current rest watch: not a violation yet, but show orange progress when user is short of a 10h reset.
  for (const b of restBlocks) {
    if (b.duration > 0 && b.duration < 10 * HOUR) {
      for (const e of b.events) {
        pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'restWatch', `Current rest ${durLabel(b.duration)} / 10h.`, 'medium'));
      }
    }
  }

  // Overlap: mark exact overlapping portion on both touched event lines.
  const evs = sortByStart(timeline);
  for (let i = 0; i < evs.length - 1; i++) {
    const a = evs[i];
    const b = evs[i+1];
    if (b.startAbs < a.endAbs) {
      const s = b.startAbs;
      const en = Math.min(a.endAbs, b.endAbs);
      pushRange(eventPartOnDay(a, activeDay, s, en, 'overlap', `Overlap from ${shortTime(s)} to ${shortTime(en)}.`));
      pushRange(eventPartOnDay(b, activeDay, s, en, 'overlap', `Overlap from ${shortTime(s)} to ${shortTime(en)}.`));
    }
  }

  // 11h drive: mark DRIVING only after the exact minute limit is crossed.
  let driveUsed = 0;
  for (const e of afterReset) {
    if (e.status !== 'D') continue;
    const dur = eventDuration(e);
    if (driveUsed >= 11 * HOUR) {
      pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'drive11', 'Driving after 11-hour limit.'));
    } else if (driveUsed + dur > 11 * HOUR) {
      const s = e.startAbs + ((11 * HOUR) - driveUsed);
      pushRange(eventPartOnDay(e, activeDay, s, e.endAbs, 'drive11', 'Driving after 11-hour limit.'));
    }
    driveUsed += dur;
  }

  // 30-minute break: mark DRIVING only after 8h cumulative driving without 30m interruption.
  let driveSinceBreak = 0;
  for (const e of afterReset) {
    const dur = eventDuration(e);
    if (e.status === 'D') {
      if (driveSinceBreak >= 8 * HOUR) {
        pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'break8', 'Driving after 8h without 30-min break.'));
      } else if (driveSinceBreak + dur > 8 * HOUR) {
        const s = e.startAbs + ((8 * HOUR) - driveSinceBreak);
        pushRange(eventPartOnDay(e, activeDay, s, e.endAbs, 'break8', 'Driving after 8h without 30-min break.'));
      }
      driveSinceBreak += dur;
    } else if (dur >= 30) {
      driveSinceBreak = 0;
    }
  }

  // 14h window: mark DRIVING after exact window limit point.
  const dutyStartEvent = afterReset.find(e => isOnDuty(e.status));
  if (dutyStartEvent) {
    const limit = windowLimitAbs(dutyStartEvent.startAbs, currentEndAbs, latestSplit);
    if (limit != null) {
      afterReset
        .filter(e => e.status === 'D' && e.endAbs > limit)
        .forEach(e => pushRange(eventPartOnDay(e, activeDay, Math.max(e.startAbs, limit), e.endAbs, 'window14', 'Driving after 14-hour window.')));
    }
  }

  // 70h / 8d cycle: mark ON/D after the minute the cycle crosses 70h.
  const cycleHours = 70;
  const cycleDays = 8;
  const restart = latest34Restart(restBlocks, currentEndAbs);
  const cycleStart = Math.max(currentEndAbs - cycleDays * 1440, restart ? restart.endAbs : -Infinity);
  let cycleUsed = 0;
  for (const e of timeline.filter(e => e.endAbs > cycleStart && e.startAbs <= currentEndAbs && isOnDuty(e.status))) {
    const dur = eventDuration(e);
    if (cycleUsed >= cycleHours * HOUR) {
      pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'cycle70', 'On-duty after 70-hour cycle limit.'));
    } else if (cycleUsed + dur > cycleHours * HOUR) {
      const s = e.startAbs + ((cycleHours * HOUR) - cycleUsed);
      pushRange(eventPartOnDay(e, activeDay, s, e.endAbs, 'cycle70', 'On-duty after 70-hour cycle limit.'));
    }
    cycleUsed += dur;
  }

  // Rest watch: if active day sleeper block is being used but is under 7h, show red/orange line on that sleeper block.
  for (const b of restBlocks) {
    if (b.allSleeper && b.duration >= 2 * HOUR && b.duration < 7 * HOUR) {
      for (const e of b.events) {
        if (e.status === 'SB') {
          pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'split7watch', `Sleeper under 7h. Need ${durLabel(7*HOUR-b.duration)} more.`, 'medium'));
        }
      }
    }
  }

  // Deduplicate identical ranges.
  const seen = new Set();
  return ranges.filter(r => {
    const key = `${r.eventId}|${r.status}|${r.startMin}|${r.endMin}|${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeLinkedHos(eventsByDay = {}, activeDay, certifyStatus = {}) {
  const timeline = buildContinuousTimeline(eventsByDay, activeDay);
  const currentEndAbs = timeline.length ? Math.max(...timeline.map(e => e.endAbs)) : absMin(activeDay || todayKey(), nowMin());
  const restBlocks = findRestBlocks(timeline);
  const gaps = findGapsAndOverlaps(timeline);

  const fullReset = latestFullReset(restBlocks, currentEndAbs);
  const splitPairs = findSplitPairs(restBlocks, currentEndAbs);
  const latestSplit = splitPairs[0] || null;

  const resetAbs = Math.max(
    fullReset ? fullReset.endAbs : -Infinity,
    latestSplit ? latestSplit.recalculationPoint : -Infinity
  );

  const validResetAbs = Number.isFinite(resetAbs) ? resetAbs : -Infinity;
  const afterReset = timeline.filter(e => e.endAbs > validResetAbs && e.startAbs <= currentEndAbs);

  const dutyStartEvent = afterReset.find(e => isOnDuty(e.status));
  const dutyStartAbs = dutyStartEvent ? dutyStartEvent.startAbs : currentEndAbs;

  const driveMins = afterReset.filter(e => e.status === 'D').reduce((sum, e) => sum + eventDuration(e), 0);

  const limit14 = dutyStartEvent ? windowLimitAbs(dutyStartAbs, currentEndAbs, latestSplit) : null;
  const windowUsed = dutyStartEvent
    ? Math.min(14 * HOUR + Math.max(0, limit14 ? currentEndAbs - limit14 : 0), Math.max(0, currentEndAbs - dutyStartAbs))
    : 0;

  const breakInfo = calculateBreak(afterReset, validResetAbs);
  const cycle = calculateCycle(timeline, restBlocks, currentEndAbs, 70, 8);
  const restProgress = currentRestProgress(restBlocks, currentEndAbs);

  const manualDrivingMins = timeline.filter(e => e.status === 'D' && e.source !== 'gps_drive').reduce((sum,e) => sum + eventDuration(e), 0);
  const missingLocation = timeline.filter(e => !e.city || !e.state).length;

  const warnings = [...gaps, ...statusReasonWarnings(timeline)];

  if (!fullReset && !latestSplit) warnings.push({ severity:'medium', text:'No valid 10h reset or split pair found in recent logs.' });
  if (driveMins > 11 * HOUR) warnings.push({ severity:'high', text:'11-hour driving limit appears exceeded.' });
  if (limit14 != null && currentEndAbs > limit14) warnings.push({ severity:'high', text:'14-hour window appears exceeded.' });
  if (breakInfo.needed) warnings.push({ severity:'high', text:'30-minute break required before more driving.' });
  if (cycle.exceeded) warnings.push({ severity:'high', text:'70-hour / 8-day cycle appears exceeded.' });
  if (manualDrivingMins > 0) warnings.push({ severity:'medium', text:'Manual driving exists. Review GPS/miles record if needed.' });
  if (missingLocation > 0) warnings.push({ severity:'medium', text:`${missingLocation} event(s) missing city/state.` });

  if (restProgress && restProgress.duration < 10 * HOUR) {
    if (restProgress.block.allSleeper && restProgress.duration < 7 * HOUR) {
      warnings.push({ severity:'medium', text:`Sleeper under 7h. Need ${durLabel(7*HOUR - restProgress.duration)} more for split long period.` });
    } else {
      warnings.push({ severity:'low', text:`Rest ${durLabel(restProgress.duration)} / 10h full reset.` });
    }
  }

  if (certifyStatus?.[activeDay] !== 'Certified') warnings.push({ severity:'low', text:'Day is not certified.' });

  return {
    cards: [
      { label:'Reset', value: fullReset ? '10h OK' : latestSplit ? 'Split OK' : restProgress ? `${durLabel(restProgress.duration)}` : 'Needs reset', sub: (fullReset || latestSplit) ? (restProgress ? `Current rest ${durLabel(restProgress.duration)}` : 'Ready') : (restProgress ? `${durLabel(Math.max(0, 10*HOUR-restProgress.duration))} to 10h` : 'Need 10h'), ok: !!fullReset || !!latestSplit },
      { label:'11h Drive', value:`${durLabel(driveMins)} used`, sub:`${durLabel(Math.max(0, 11*HOUR-driveMins))} left`, ok: driveMins <= 11*HOUR },
      { label:'14h Window', value: limit14 != null && currentEndAbs > limit14 ? 'Over' : `${durLabel(Math.min(windowUsed, 14*HOUR))} used`, sub: limit14 != null && currentEndAbs > limit14 ? `${durLabel(currentEndAbs-limit14)} over` : `${durLabel(Math.max(0, 14*HOUR-windowUsed))} left`, ok: !(limit14 != null && currentEndAbs > limit14) },
      { label:'Break', value: breakInfo.needed ? 'Needed' : 'OK', sub: breakInfo.needed ? '30 min required' : `${durLabel(breakInfo.left)} to break`, ok: !breakInfo.needed },
      { label:'Cycle', value:`${durLabel(cycle.used)} / ${cycle.cycleHours}h`, sub:`${durLabel(cycle.left)} left`, ok: !cycle.exceeded },
      { label:'Split', value: latestSplit ? 'Complete' : 'Watch', sub: latestSplit ? `${durLabel(latestSplit.total)}` : '7/3 or 8/2', ok: !!latestSplit || !!fullReset },
    ],
    warnings,
    split: latestSplit,
    fullReset,
    restProgress,
    cycle,
    violationRanges: violationRangesForDay(eventsByDay, activeDay),
  };
}

// Backward-compatible wrapper used by older UI
export function analyzeHos(events, certifyStatus = '') {
  return {
    cards: [
      { label:'11h Drive', value:'Linked', sub:'Use full rules', ok:true },
      { label:'14h Window', value:'Linked', sub:'Use full rules', ok:true },
      { label:'Break', value:'Linked', sub:'Use full rules', ok:true },
      { label:'Certify', value: certifyStatus === 'Certified' ? 'OK' : 'Needs review', sub:'', ok: certifyStatus === 'Certified' },
    ],
    warnings: certifyStatus === 'Certified' ? [] : [{ severity:'low', text:'Day is not certified.' }],
  };
}

export function trackingSummary(state) {
  const trip = state.gpsTrip;
  if (!trip) {
    return { status:'No tracking', sub:'No GPS yet.', milesByState:{}, totalMiles:0, points:0 };
  }
  return {
    status: trip.status === 'active' ? 'Tracking active' : 'Tracking saved',
    sub: trip.adjustedToLogWindow?.note || 'GPS saved.',
    milesByState: trip.milesByState || {},
    totalMiles: Number(trip.totalMiles || 0),
    points: (trip.points || []).length,
  };
}
