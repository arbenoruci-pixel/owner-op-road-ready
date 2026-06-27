'use client';

import { createClient } from '@supabase/supabase-js';
import { scheduleSyncSoon } from '../sync/clientSync.js';

let browserClient = null;
let bridgeInstalled = false;

function envReady() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getOwnerOpSupabaseBrowserClient() {
  if (typeof window === 'undefined') return null;
  if (!envReady()) return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storageKey: 'owner-op-road-ready-supabase-auth'
        }
      }
    );
  }
  return browserClient;
}

export function installOwnerOpAuthBridge() {
  if (typeof window === 'undefined') return null;
  if (bridgeInstalled) return browserClient;

  const supabase = getOwnerOpSupabaseBrowserClient();
  if (!supabase) {
    window.ownerOpGetAccessToken = async () => null;
    window.ownerOpAuthStatus = 'missing_env';
    bridgeInstalled = true;
    return null;
  }

  window.ownerOpSupabase = supabase;
  window.ownerOpGetAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session?.access_token || null;
  };

  supabase.auth.getSession().then(({ data }) => {
    window.ownerOpAuthStatus = data?.session ? 'authenticated' : 'missing_session';
    if (data?.session) scheduleSyncSoon(100);
  }).catch(() => {
    window.ownerOpAuthStatus = 'session_error';
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    window.ownerOpAuthStatus = session ? 'authenticated' : 'missing_session';
    if (session) scheduleSyncSoon(100);
  });

  bridgeInstalled = true;
  return supabase;
}
