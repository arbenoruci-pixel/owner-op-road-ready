// A suggested number can prefill the driver's confirmation. Only a printed
// final with both amount and currency evidence can create an expense directly.
export function scanTotalDecision(receipt) {
  if (receipt?.documentKind === 'bill_of_lading') return {status:'freight', cents:null};
  if (receipt?.multipleInvoices) return {status:'multiple', cents:null};
  if (receipt?.foreignCurrency) return {status:'foreign', cents:null};
  if (!receipt || receipt.conflictFields?.includes('totalCents') || receipt.competingFinal) {
    return {status:'confirm', cents:null};
  }
  const candidate = receipt.printedTotalCents ?? receipt.weakFinalCents ?? receipt.suggestedTotalCents;
  const cents = Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= 100000000000 ? candidate : null;
  const auto = cents != null && cents > 0 && cents === receipt.printedTotalCents && receipt.strongFinal &&
    !receipt.incompleteSource && !receipt.currencyNeedsConfirmation && receipt.usdContext &&
    !receipt.conflictFields?.includes('vendor');
  if (auto) return {status:'auto', cents};
  const reason = cents != null && (!receipt.usdContext || receipt.currencyNeedsConfirmation)
    ? 'Check that this is the final amount in US dollars.' : undefined;
  return {status:'confirm', cents, reason};
}
