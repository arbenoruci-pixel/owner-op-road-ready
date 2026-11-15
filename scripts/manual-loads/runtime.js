import {readBusinessStore,BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../business/businessStore.js';
export function persistManualStore(next){
 if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw Error('There are unsaved changes on this device. Keep this page open and check storage before continuing.');
 const saved={...next,updatedAt:Date.now()},raw=JSON.stringify(saved);
 // setItem is atomic: a full index leaves the previous copy intact. Never
 // remove or compact unrelated paperwork to make a manual action fit.
 try{window.localStorage.setItem(BUSINESS_STORE_KEY,raw);}catch{throw Error('Storage is full. This change was not saved. Your selected pages are still here.');}
 if(window.localStorage.getItem(BUSINESS_STORE_KEY)!==raw)throw Error('Could not verify the saved change. Keep this page open.');
 window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT,{detail:null}));
 window.dispatchEvent(new Event('road-ready-evidence-filed'));
 return saved;
}
export {readBusinessStore};
