import ApplicationForm from './ApplicationForm.jsx';
import styles from './apply.module.css';

export const metadata = {
  title: 'Owner-operator application | Narta Express LLC',
  description: 'Apply to drive as an owner-operator with Narta Express LLC. Share your CDL and Amazon Relay experience, tractor details and availability.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#122a39',
};

export default function ApplyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>Narta <strong>Express</strong><small> LLC</small></span>
          <span className={styles.authority}>MC 871792</span>
        </div>
      </header>
      <div className={styles.layout}>
        <aside className={styles.intro}>
          <h1>Owner-operator application</h1>
          <p>Tell us about your driving experience and the truck you plan to bring to Narta Express.</p>
          <h2>Before you apply</h2>
          <ul>
            <li>Our insurer generally requires age 24 or older, subject to applicable state rules.</li>
            <li>Active U.S. Class A CDL held for at least 3 years</li>
            <li>At least 3 recent, verifiable years of over-the-road driving</li>
            <li>At least 12 months driving Amazon Relay loads</li>
          </ul>
          <p className={styles.privacy}>This is a pre-application. If we move forward, our team will follow up privately for your CDL, registration and insurance review.</p>
        </aside>
        <ApplicationForm />
      </div>
    </main>
  );
}
