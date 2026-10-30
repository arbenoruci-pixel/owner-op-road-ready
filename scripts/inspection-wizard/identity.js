// Update only the current carrier identifier after explicit driver input.
// Historic events, signed snapshots and certification evidence remain intact.
export function validInspectionUsdot(value) {
  const number = String(value ?? '').trim();
  return /^\d{1,9}$/.test(number) && Number(number) > 0;
}

export function saveInspectionUsdot(state, value) {
  if (!validInspectionUsdot(value)) throw Error('Enter a USDOT number using digits only.');
  return {...state, dotNumber:String(value).trim()};
}
