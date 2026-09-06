'use client';
import { useEffect, useState } from 'react';
import { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';
// One instant feeds the range, duration, preview and Now label. No data writes.
export function useLogbookClockV110(state = {}) {
  const [at,setAt] = useState(() => new Date());
  const timeZone = getHomeTerminalTimeZone(state);
  useEffect(() => {
    const tick = () => setAt(new Date());
    const visible = () => { if (!document.hidden) tick(); };
    tick();
    const timer = window.setInterval(visible,10000);
    window.addEventListener('focus',tick); document.addEventListener('visibilitychange',visible);
    return () => { clearInterval(timer); window.removeEventListener('focus',tick); document.removeEventListener('visibilitychange',visible); };
  },[timeZone]);
  return { at,timeZone,day:homeTerminalDayKey(at,timeZone),minute:homeTerminalMinute(at,timeZone) };
}
