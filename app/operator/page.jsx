import OperatorPortal from './OperatorPortal.jsx';

export const metadata = {
  title: 'My loads & pay | Road Ready',
  manifest: '/operator/manifest.webmanifest',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  appleWebApp: { capable: true, title: 'My Loads', statusBarStyle: 'default' },
};

export default function OperatorPage() {
  return <OperatorPortal />;
}
