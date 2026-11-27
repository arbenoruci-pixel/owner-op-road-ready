'use client';

import { useEffect, useRef, useState } from 'react';
import { watchOperatorBuild } from './operatorUpdate.js';
import styles from './operatorUpdate.module.css';

export default function OperatorUpdate() {
  const [status, setStatus] = useState(null);
  const watcher = useRef(null);
  useEffect(() => {
    watcher.current = watchOperatorBuild(window, document, process.env.NEXT_PUBLIC_OWNER_OP_APP_BUILD, setStatus);
    return () => watcher.current.stop();
  }, []);
  if (!status) return null;
  return <aside className={styles.notice} data-operator-update-control role="status">
    <span>{status === 'busy' ? 'Update ready. Finish your work, then close this form.' : 'A Road Ready update is ready.'}</span>
    <button type="button" disabled={status === 'busy'} onClick={() => watcher.current.apply()}>Update</button>
  </aside>;
}
