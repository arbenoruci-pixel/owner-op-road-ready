import {addTeamDriver, teamDriverSummary, normalizeTeamDriverState} from './teamLogbook.js';
import {readLogbookDayState,applyDayFormEdit} from '../../modules/logbook/public-api.js';

const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const key = value => clean(value).toLocaleLowerCase();

// Match saved full names before considering separators: a comma can belong
// to a person's name. New names can be separated with semicolons or newlines.
export function formCoDriverNames(value, drivers = []) {
  const remaining = clean(value);
  if (!remaining || /^(none|no co-?drivers?)$/i.test(remaining)) return [];
  const known = [...drivers].sort((a,b) => b.name.length - a.name.length);
  const names = [];
  for (const entry of String(value).split(/[;\n]+/).map(clean).filter(Boolean)) {
    let rest = entry;
    while (rest) {
      const match = known.find(driver => key(rest) === key(driver.name)
        || key(rest).startsWith(key(driver.name) + ', '));
      if (!match) { names.push(rest); break; }
      names.push(match.name);
      rest = rest.slice(match.name.length).replace(/^,\s*/, '').trim();
    }
  }
  return [...new Map(names.map(name => [key(name), name])).values()];
}

// The caller supplies the same selected-day view displayed by the Form.
// Saved drivers are an archive, not proof of membership in this Form.
export function formTeamDriverSummary(view = {}) {
  const summary = teamDriverSummary(view);
  if(Array.isArray(view.activeTeamDriverIds)) {
    return {...summary,drivers:summary.drivers.filter(driver=>driver.id===summary.activeDriverId||view.activeTeamDriverIds.includes(driver.id))};
  }
  const members = new Set(formCoDriverNames(view.coDrivers, summary.drivers).map(key));
  return {...summary, drivers:summary.drivers.filter(driver =>
    driver.id === summary.activeDriverId || members.has(key(driver.name)))};
}

export function registerFormTeamDrivers(state, value, day) {
  let next = normalizeTeamDriverState(state);
  for (const name of formCoDriverNames(value, teamDriverSummary(state).drivers)) {
    if (!teamDriverSummary(next).drivers.some(driver => key(driver.name) === key(name))) {
      next = addTeamDriver(next, name, day);
    }
  }
  // Keep all recorded books and reuse existing IDs when someone is re-added.
  // Form text and certification remain owned by applyDayFormEdit.
  const names=new Set(formCoDriverNames(value,next.teamDrivers).map(key));
  return normalizeTeamDriverState({...state,
    teamDrivers:next.teamDrivers,
    activeDriverId:next.activeDriverId,
    teamLogbooksByDriverId:next.teamLogbooksByDriverId,
    activeTeamDriverIds:next.teamDrivers.filter(driver=>driver.id===next.activeDriverId||names.has(key(driver.name))).map(driver=>driver.id),
    legacyCoDrivers:'',
  });
}

function setCurrentCoDrivers(state,names,day) {
  const value=names.join('; ');
  const proposed=registerFormTeamDrivers(state,value,day);
  const edited=applyDayFormEdit(state,proposed,{coDrivers:value},day);
  // An explicit day choice stays explicit even when it equals today's default.
  return normalizeTeamDriverState({...edited,formByDay:{...edited.formByDay,[day]:{...edited.formByDay?.[day],coDrivers:value}}});
}
export function addCurrentCoDriver(state,name,day=state.activeDay) {
  const cleanName=clean(name);if(!cleanName)return state;
  const summary=formTeamDriverSummary(readLogbookDayState(state,day));
  if(key(cleanName)===key(summary.activeDriver.name))return state;
  const names=summary.drivers.filter(driver=>driver.id!==summary.activeDriverId).map(driver=>driver.name);
  if(!names.some(name=>key(name)===key(cleanName)))names.push(cleanName);
  return setCurrentCoDrivers(state,names,day);
}
export function removeCurrentCoDriver(state,id,day=state.activeDay) {
  const summary=formTeamDriverSummary(readLogbookDayState(state,day));
  if(id===summary.activeDriverId||!summary.drivers.some(driver=>driver.id===id))return state;
  return setCurrentCoDrivers(state,summary.drivers.filter(driver=>driver.id!==summary.activeDriverId&&driver.id!==id).map(driver=>driver.name),day);
}
