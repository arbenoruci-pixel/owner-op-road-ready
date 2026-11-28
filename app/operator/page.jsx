import OperatorPortal from './OperatorPortal.jsx';

export const metadata = {
  title: 'My loads & pay | Road Ready',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  appleWebApp: { capable: true, title: 'My Loads', statusBarStyle: 'black-translucent' },
};

export const viewport = { themeColor: '#0a0d14' };

export default function OperatorPage() {
  return <OperatorPortal />;
}
