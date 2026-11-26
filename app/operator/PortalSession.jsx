'use client';

import { createContext, useContext } from 'react';
import { operatorClient } from './portalData.js';

export const PortalSession = createContext(null);

export function usePortalClient() {
  const client = useContext(PortalSession);
  return client || operatorClient();
}
