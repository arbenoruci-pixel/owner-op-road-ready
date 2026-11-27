import OperatorUpdate from './OperatorUpdate.jsx';

export const metadata = {
  applicationName: 'My Loads',
  manifest: '/operator/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'My Loads', statusBarStyle: 'default' },
};

// Each launch must resolve the current deployment, including office and sign-in links.
export const dynamic = 'force-dynamic';

export default function OperatorLayout({ children }) {
  return <><OperatorUpdate />{children}</>;
}
