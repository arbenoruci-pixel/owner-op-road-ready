import {useEffect,useState} from 'react';

// Refresh derived clocks on the device. Never write to app state or sync state.
export function useHosNow() {
  const [at,setAt]=useState(()=>new Date());
  useEffect(()=>{
    const tick=()=>setAt(new Date());
    const visible=()=>{if(!document.hidden)tick();};
    const timer=window.setInterval(visible,60000);
    window.addEventListener('focus',tick);
    document.addEventListener('visibilitychange',visible);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return at;
}
