// Preserve legacy generic inspection entries, while keeping an explicitly
// recorded roadside/DOT inspection separate from a driver's pre-trip check.
export function isPreTripActivity(value = '') {
  const activity = String(value || '').replace(/\b(?:dot|roadside)\s+inspection\b/gi, '');
  return /pre[-\s]?trip|inspection/i.test(activity);
}
