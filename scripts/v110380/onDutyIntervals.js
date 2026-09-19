/** Read-only ON-duty intervals. Each original activity remains individually
 * addressable so a pickup keeps its own time, location, references and edit ID.
 * No sorting, gap filling or persisted event mutation occurs here. */
export function onDutyIntervals(events = []) {
  const groups=[];
  const valid=e=>e?.status==='ON' && Number.isInteger(e.startMin) && Number.isInteger(e.endMin) && e.startMin>=0 && e.endMin<=1440 && e.endMin>e.startMin;
  for(const event of events){
    const group=groups.at(-1),previous=group?.at(-1);
    if(valid(previous)&&valid(event)&&previous.endMin===event.startMin&&!group.some(e=>e.id===event.id))group.push(event);
    else groups.push([event]);
  }
  return groups;
}
