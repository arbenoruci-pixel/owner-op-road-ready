'use client';

import { useEffect, useState } from 'react';
import { cloudClient } from '../../../lib/owner-op-cloud/client.js';
import OperatorPortal from '../OperatorPortal.jsx';

export default function CarrierEntry() {
  const [client, setClient] = useState(null);
  useEffect(() => { setClient(cloudClient()); }, []);
  if (!client) return <main role="status">Opening your RoadReady workspace…</main>;
  return <OperatorPortal client={client} carrierEntry />;
}
