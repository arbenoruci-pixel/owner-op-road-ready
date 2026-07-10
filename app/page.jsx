import RoadReadyClient from './road-ready-client.jsx';

// Keep the installed PWA's HTML shell network-revalidated. The JavaScript and
// CSS assets remain content-hashed by Next.js, so this only prevents an old
// document from reopening after the driver accepts an update.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return <RoadReadyClient />;
}
