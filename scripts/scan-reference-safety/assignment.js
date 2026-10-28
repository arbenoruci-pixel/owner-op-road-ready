// A selected folder and a verified match are separate facts.
export function scanAssignmentBadge(match={},selection='',loadNo='',type='') {
 if(selection==='driver_selected')return 'Your selection';
 if(match.automatic&&match.matched&&match.loadNo===loadNo)
  return match.source==='document_route'?'Route/date match':'Reference match';
 if(type==='rate_confirmation'&&!match.loadNo)return 'New load';
 return 'Folder needs review';
}
export function retainedScanChoice(resumed) {
 return !!resumed&&['driver_selected','driver_unassigned'].includes(resumed.assignment);
}
