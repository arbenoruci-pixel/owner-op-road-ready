// Envelope IDs bind pages and dates; they are never shipment/load numbers.
export function documentReferences(pages) {
  return pages.flatMap(page=>page.observations.flatMap(observation=>observation.lines.flatMap(line=>{
    const match=/^\s*DOCUMENT REF(?:ERENCE)?\s*:\s*([A-Z0-9][A-Z0-9-]{7,})(?=\s|$)/id.exec(line.text)
      ||/^\s*DOC\s*ID\s*:\s*(\d{8,})(?=\s|$|Send Carrier Bills\b)/id.exec(line.text);
    return match?[{value:match[1],page,observation,line,start:match.indices[1][0],end:match.indices[1][1]}]:[];
  })));
}
