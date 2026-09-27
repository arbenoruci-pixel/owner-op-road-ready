import {useCallback, useEffect, useRef, useState} from 'react';
import {getAccurateGpsLocation} from '../../core/gps/locationService.js';

export default function useGpsRequest() {
  const active = useRef(null);
  const [pending,setPending] = useState(false);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setPending(false);
  }, []);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const run = useCallback(async (options = {}) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    try {
      const fix = await getAccurateGpsLocation({...options, signal:controller.signal});
      return active.current === controller && !controller.signal.aborted ? fix : null;
    } catch (error) {
      if (active.current !== controller || controller.signal.aborted || error?.name === 'AbortError') return null;
      throw error;
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); }
    }
  }, []);
  return {run,cancel,pending};
}
