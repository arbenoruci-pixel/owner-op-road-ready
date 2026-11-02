// Personal use is an explicit driver choice. Bobtail equipment, a drop event,
// a destination, mileage and free-form notes never establish eligibility.
export const PC_MODE = 'personal_conveyance';
export const PC_REASON = 'Personal Conveyance';
export const PC_GUIDANCE = 'Select PC only for qualifying personal travel while relieved of work. Returning home or to a terminal from a dispatched delivery is a continuation of that trip. Bobtail alone does not establish personal use.';

export function activitySpecialMode(status, reasons = []) {
  const list = Array.isArray(reasons) ? reasons : [];
  if (status === 'OFF' && list.includes(PC_REASON)) return PC_MODE;
  if (status === 'D' && list.includes('Yard Move')) return 'yard_move';
  return 'none';
}

export function choosePersonalConveyance(event, enabled) {
  const reasons = (Array.isArray(event.reasons) ? event.reasons : []).filter(reason => reason !== PC_REASON);
  const details = String(event.note || '').split(/\s*[·•|]\s*/).filter(part => part.trim() && part.trim() !== PC_REASON).join(' · ');
  return {
    status: 'OFF',
    specialMode: enabled ? PC_MODE : 'none',
    reasons: enabled ? [...reasons.filter(reason => reason !== 'Off Duty'), PC_REASON] : reasons,
    note: enabled ? [PC_REASON, details === 'Off Duty' ? '' : details].filter(Boolean).join(' · ') : details || 'Off Duty',
  };
}

// Called only by an explicit edit/insert command, never startup, import or sync.
export function specialModeEdit(before, patch) {
  const changes = {...patch}, status = changes.status ?? before.status;
  if (Object.hasOwn(changes, 'specialMode')) {
    if (!['none', PC_MODE, 'yard_move'].includes(changes.specialMode)) return {ok:false,error:'Choose a valid special driving category.'};
    if (changes.specialMode === PC_MODE && status !== 'OFF') return {ok:false,error:'Personal Conveyance is recorded as Off Duty.'};
  } else if (before.specialMode === PC_MODE && status !== 'OFF') {
    changes.specialMode = 'none';
  }
  return {ok:true,patch:changes};
}
