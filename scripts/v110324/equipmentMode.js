export function isIntermodalModeActive(state = {}) {
  const equipment = state.equipment || {};
  const currentTrailer = String(state.currentTrailer || '').trim();
  const hasIntermodalNumber = Boolean(String(equipment.container || '').trim() || String(equipment.chassis || '').trim());
  const currentLooksIntermodal = /\b(intermodal|container|chassis)\b/i.test(currentTrailer);
  const currentLooksLikeTrailer = Boolean(
    currentTrailer
    && !/^(no\s+(trailer|equipment)|trailer|equipment\s+hooked)$/i.test(currentTrailer)
    && !currentLooksIntermodal
  );

  // Older saves defaulted equipment.type to intermodal even while a normal
  // trailer number was active. A real trailer number is authoritative unless
  // container/chassis data or an intermodal equipment label is present.
  if (currentLooksLikeTrailer && !hasIntermodalNumber) return false;
  return equipment.type === 'intermodal' || hasIntermodalNumber || currentLooksIntermodal;
}
