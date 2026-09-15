// Route-form deletion is an explicit Logbook command, never a load closeout.
// Apply it to the latest state instead of replacing a map captured by the UI.
const idOf = leg => leg?.id == null ? '' : String(leg.id).trim();
const stable = value => value == null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? '[' + value.map(stable).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
const entries = map => Object.entries(map || {}).flatMap(([day, legs]) =>
  (Array.isArray(legs) ? legs : []).filter(leg => leg && typeof leg === 'object').map(leg => ({day,leg})));
const viewKey = (leg, day) => stable({...leg,day:leg.day || day});

export function routeLegDeleteRequest(state = {}, displayedLeg) {
  if (!displayedLeg || typeof displayedLeg !== 'object') return null;
  const id = idOf(displayedLeg);
  if (id) return {id};
  // Older imports can have no ID. Resolve the exact visible record; an empty
  // ID or shared BOL must never match every stop in the day.
  const matches = entries(state.routeLegsByDay).filter(({day,leg}) =>
    !idOf(leg) && viewKey(leg, day) === stable(displayedLeg));
  if (matches.length !== 1) return null;
  const {day,leg} = matches[0];
  return {day,recordKey:stable(leg)};
}

export function deleteRouteLegFromState(state = {}, request) {
  if (!request || typeof request !== 'object') return state;
  const id = request.id == null ? '' : String(request.id).trim();
  const legacy = state.loadInfo?.routeLegsByDay;
  let matches;
  if (id) {
    matches = leg => idOf(leg) === id;
  } else {
    if (!request.day || !request.recordKey) return state;
    const candidates = entries(state.routeLegsByDay).filter(({day,leg}) =>
      day === request.day && !idOf(leg) && stable(leg) === request.recordKey);
    // A stale/ambiguous selection is a safe no-op. Do not fall back to BOL.
    if (candidates.length !== 1) return state;
    matches = (leg, day) => day === request.day && !idOf(leg) && stable(leg) === request.recordKey;
  }
  function remove(map) {
    let next = map;
    for (const [day, legs] of Object.entries(map || {})) {
      if (!Array.isArray(legs)) continue;
      const kept = legs.filter(leg => !matches(leg, day));
      if (kept.length === legs.length) continue;
      if (next === map) next = {...map};
      // Keep an explicit empty bucket so startup history-preservation also
      // preserves the driver's deliberate removal of the final route.
      next[day] = kept;
    }
    return next;
  }
  const routeLegsByDay = remove(state.routeLegsByDay);
  const legacyRoutes = remove(legacy);
  if (routeLegsByDay === state.routeLegsByDay && legacyRoutes === legacy) return state;
  return {
    ...state,
    ...(routeLegsByDay !== state.routeLegsByDay ? {routeLegsByDay} : {}),
    ...(legacyRoutes !== legacy ? {loadInfo:{...state.loadInfo,routeLegsByDay:legacyRoutes}} : {}),
  };
}
