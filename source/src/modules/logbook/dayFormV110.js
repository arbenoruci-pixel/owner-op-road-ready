// Version 1: daily form overrides belong to Logbook, never to fleet settings.
export const DAY_FORM_FIELDS = Object.freeze(['driverName','carrierName','mainOfficeAddress','homeTerminalAddress','coDrivers','truck','trailer']);
const own = (o,k) => Object.prototype.hasOwnProperty.call(o || {},k);
export function readLogbookDayState(state, day = state.activeDay) {
  const context=state.signatureByDay?.[day]?.certificationContext;
  const dayForm=state.formByDay?.[day] || {};
  if(!context && !DAY_FORM_FIELDS.some(key=>own(dayForm,key)))return state;
  const frozen=context?.form || {};
  const values={...('driver' in frozen?{driverName:frozen.driver}:{}),...('carrier' in frozen?{carrierName:frozen.carrier}:{}),...('mainOffice' in frozen?{mainOfficeAddress:frozen.mainOffice}:{}),...('truck' in frozen?{truck:frozen.truck}:{}),...('trailer' in frozen?{trailer:frozen.trailer}:{}),...('coDrivers' in frozen?{coDrivers:frozen.coDrivers}:{})};
  if(context?.profileAtBackup && own(context.profileAtBackup,'homeTerminal'))values.homeTerminalAddress=context.profileAtBackup.homeTerminal;
  for(const key of DAY_FORM_FIELDS)if(own(dayForm,key))values[key]=dayForm[key];
  const view={...state,driver:{...state.driver},driverProfile:{...state.driverProfile}};
  if(own(values,'driverName')){view.driverProfile.name=values.driverName;view.driver.name=values.driverName;}
  if(own(values,'carrierName')){view.carrierName=values.carrierName;view.driver.carrier=values.carrierName;}
  if(own(values,'mainOfficeAddress')){view.mainOfficeAddress=values.mainOfficeAddress;view.driver.mainOffice=values.mainOfficeAddress;}
  for(const key of ['homeTerminalAddress','coDrivers'])if(own(values,key))view[key]=values[key];
  if(own(values,'truck'))view.driver.truck=values.truck;
  if(own(values,'trailer')){view.driver.trailer=values.trailer;view.currentTrailer=values.trailer || 'No trailer';}
  return view;
}
export function applyDayFormEdit(before, proposed, payload, day=before.activeDay) {
  if(!DAY_FORM_FIELDS.some(key=>own(payload,key)))return proposed;
  const view=readLogbookDayState(before,day);
  const current={driverName:view.driverProfile?.name || view.driver?.name || '',carrierName:view.carrierName || '',mainOfficeAddress:view.mainOfficeAddress || '',homeTerminalAddress:view.homeTerminalAddress || '',coDrivers:view.coDrivers || '',truck:view.driver?.truck || '',trailer:/no trailer/i.test(view.currentTrailer || '') ? '' : view.currentTrailer || view.driver?.trailer || ''};
  const comparable=value=>String(value ?? '').replace(/\s+/g,' ').trim().toUpperCase();
  const patch={};
  for(const key of DAY_FORM_FIELDS)if(own(payload,key) && comparable(payload[key])!==comparable(current[key]))patch[key]=String(payload[key] ?? '').trim();
  const previous=before.formByDay?.[day] || {};
  let next={...proposed,...(Object.keys(patch).length ? {formByDay:{...before.formByDay,[day]:{...previous,...patch}}} : {})};
  // Editing a historical log's form never changes the live driver's settings.
  for(const key of ['driver','driverProfile','carrierName','mainOfficeAddress','homeTerminalAddress','coDrivers','currentTrailer']){
    if(own(before,key))next[key]=before[key];else delete next[key];
  }
  const sig=before.signatureByDay?.[day];
  const changed=Object.keys(patch).some(key=>patch[key]!==previous[key]);
  if(changed && sig?.signed && !sig.certificationContext)next={...next,signatureByDay:{...next.signatureByDay,[day]:{...sig,needsRecertification:true,recertificationReason:'Daily form changed'}}};
  return next;
}
