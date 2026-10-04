// Recovery writers and recovery-copy cleanup share one origin-wide lock.
export function withRecoveryStorageLock(run,{requireLock=false}={}){
 const locks=globalThis.navigator?.locks;
 if(locks?.request)return locks.request('road-ready-recovery-storage',run);
 // Keep the fallback copy when this browser cannot coordinate other windows.
 return requireLock?Promise.resolve(0):run();
}
