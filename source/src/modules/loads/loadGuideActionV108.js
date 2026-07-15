import { applyLoadGuideActionV103 } from './loadGuideV103.js';

function text(value = '') {
  return String(value || '').trim();
}

export function applyLoadGuideActionV108(state = {}, detail = {}) {
  const before = state && typeof state === 'object' ? state : {};
  const action = text(detail.action || 'toggle_done');
  const stepId = text(detail.stepId || detail.step?.id);

  try {
    const updated = applyLoadGuideActionV103(before, detail);
    if (!updated || typeof updated !== 'object') return before;

    const checklistOnly = action === 'toggle_done';
    return {
      ...updated,
      // Driver Mission checklist taps must never navigate, open a sheet, alter RODS,
      // change the live duty status, or replace the active log day.
      view:before.view,
      activeDay:before.activeDay,
      sheet:before.sheet,
      eventsByDay:before.eventsByDay,
      certifyStatus:before.certifyStatus,
      signatureByDay:before.signatureByDay,
      inspectionByDay:before.inspectionByDay,
      currentStatus:before.currentStatus,
      currentReason:before.currentReason,
      currentLocation:before.currentLocation,
      manualDrivingSession:before.manualDrivingSession,
      gpsTrip:before.gpsTrip,
      loadInfo:before.loadInfo,
      ...(checklistOnly ? { routeLegsByDay:before.routeLegsByDay } : {}),
      lastLoadGuideActionV108:{
        action,
        stepId,
        guideId:text(detail.guideId || before.activeLoadGuideId),
        at:Date.now(),
        safe:true,
      },
    };
  } catch (error) {
    return {
      ...before,
      lastLoadGuideActionV108:{
        action,
        stepId,
        guideId:text(detail.guideId || before.activeLoadGuideId),
        at:Date.now(),
        safe:false,
        error:text(error?.message || error || 'Driver Mission action failed'),
      },
    };
  }
}
