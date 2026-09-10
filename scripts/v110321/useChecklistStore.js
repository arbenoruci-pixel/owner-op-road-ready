import { useEffect, useState } from 'react';
import { BUSINESS_STORE_EVENT, BUSINESS_STORE_KEY, readBusinessStore } from '../business/businessStore.js';

export function useChecklistStoreV110321() {
  const [store,setStore]=useState(()=>readBusinessStore());
  useEffect(()=>{
    const refresh=event=>{if(event?.type==='storage'&&event.key&&event.key!==BUSINESS_STORE_KEY)return;setStore(readBusinessStore());};
    window.addEventListener(BUSINESS_STORE_EVENT,refresh);
    window.addEventListener('storage',refresh);
    window.addEventListener('pageshow',refresh);
    return ()=>{window.removeEventListener(BUSINESS_STORE_EVENT,refresh);window.removeEventListener('storage',refresh);window.removeEventListener('pageshow',refresh);};
  },[]);
  return store;
}
