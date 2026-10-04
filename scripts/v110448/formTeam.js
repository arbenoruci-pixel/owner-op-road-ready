import {addTeamDriver, teamDriverSummary} from './teamLogbook.js';

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
  const members = new Set(formCoDriverNames(view.coDrivers, summary.drivers).map(key));
  return {...summary, drivers:summary.drivers.filter(driver =>
    driver.id === summary.activeDriverId || members.has(key(driver.name)))};
}

export function registerFormTeamDrivers(state, value, day) {
  let next = state;
  for (const name of formCoDriverNames(value, teamDriverSummary(state).drivers)) {
    if (!teamDriverSummary(next).drivers.some(driver => key(driver.name) === key(name))) {
      next = addTeamDriver(next, name, day);
    }
  }
  // Keep all recorded books and reuse existing IDs when someone is re-added.
  // Form text and certification remain owned by applyDayFormEdit.
  return next === state ? state : {...state,
    teamDrivers:next.teamDrivers,
    activeDriverId:next.activeDriverId,
    teamLogbooksByDriverId:next.teamLogbooksByDriverId};
}
