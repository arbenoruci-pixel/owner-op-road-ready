import EmailConfirmation from './EmailConfirmation.jsx';

export const metadata = {
  title: 'Sign in to My Loads | Road Ready',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ConfirmPage() {
  return <EmailConfirmation />;
}
