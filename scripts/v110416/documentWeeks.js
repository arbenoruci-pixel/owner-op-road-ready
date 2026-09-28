import {archiveWeeks,mondayForArchive} from './archiveEvidenceV1103.js';
import {documentLoad,uniqueDocumentFiles,visibleWeeks} from './documentBrowserV110404.js';

// Assigned originals travel with their load. An invoice date must not create a
// second empty week after a reviewed service date correction.
export function documentWeeks(folders,state,businessStore){
  const known=new Set(folders.map(f=>f.loadNo));
  const loose=(businessStore.documents||[]).filter(d=>!known.has(documentLoad(d)));
  return visibleWeeks(archiveWeeks(folders,state,{...businessStore,documents:loose})).map(week=>{
    const lastDay=folder=>(folder.days||[]).filter(d=>mondayForArchive(d)===week.start).at(-1)||'';
    const items=[...week.items].sort((a,b)=>lastDay(b).localeCompare(lastDay(a))||a.loadNo.localeCompare(b.loadNo));
    return {...week,id:week.start||'undated',items,documents:uniqueDocumentFiles([...week.documents,...items.flatMap(f=>f.documents||[])])};
  });
}
export function folderWeekDates(folder,weekStart){
  const dates=(folder.days||[]).filter(d=>mondayForArchive(d)===weekStart).sort();
  const label=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  return dates.length?(dates[0]===dates.at(-1)?label(dates[0]):`${label(dates[0])} – ${label(dates.at(-1))}`):'Date not set';
}
