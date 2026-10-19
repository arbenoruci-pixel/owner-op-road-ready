export function documentSyncLabel(document={}){
  const original=document.originalSyncState||document.original_sync_state;
  const status=document.syncState||document.sync_state;
  const pending=(document.metadataSyncState||document.metadata_sync_state)==='pending_account';
  if(original==='synced'||['synced','original_synced'].includes(status))return pending?'Cloud original saved · filing details pending':'Cloud original saved';
  return 'Available offline';
}
