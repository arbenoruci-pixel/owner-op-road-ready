const list=v=>Array.isArray(v)?v:[];
export function preserveSavedRateDetails(previous={},incoming={}){
 const next={...incoming};for(const key of ['broker','origin','destination','pickupDate','deliveryDate','equipment'])if(!next[key]&&previous[key])next[key]=previous[key];
 if(!next.gross&&previous.gross)next.gross=previous.gross;
 if(previous.status)next.status=previous.status;
 const old=list(previous.stops),fresh=list(incoming.stops);
 if(!fresh.length||old.length>2&&fresh.length<=2)next.stops=old;
 else next.stops=fresh.map(stop=>{const matches=old.filter(s=>s.type===stop.type);if(matches.length!==1||fresh.filter(s=>s.type===stop.type).length!==1)return stop;const saved=matches[0],merged={...saved,...stop,id:saved.id||stop.id,sequence:saved.sequence??stop.sequence,deliverySequence:saved.deliverySequence??stop.deliverySequence};for(const key of ['company','address','cityState','city','state','date','appointment','time'])if(!stop[key]&&saved[key])merged[key]=saved[key];return merged;});
 return next;
}
