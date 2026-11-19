import ApplicationForm from './ApplicationForm.jsx';
import styles from './apply.module.css';

export const metadata = {
  title: 'Owner-operator application | Narta Express LLC',
  description: 'Apply to drive as an owner-operator with Narta Express LLC. Share your experience, tractor details and availability.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#132a38',
};

function Requirements() {
  return (
    <>
      <ul className={styles.requirements}>
        <li>Active U.S. Class A CDL held for at least <strong>3 years</strong></li>
        <li>At least <strong>3 recent years</strong> of verifiable over-the-road driving</li>
        <li>At least <strong>12 months</strong> driving Amazon Relay loads</li>
      </ul>
      <p className={styles.insurance}>Our insurer generally requires drivers to be 24 or older, subject to applicable state rules.</p>
      <p className={styles.privacy}>Enter your truck’s actual parking address on this form. If you move forward, our team sends a personal link for your CDL and any other documents requested for insurance review.</p>
    </>
  );
}

export default function ApplyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>
            <i className={styles.mark} aria-hidden="true"><i /><i /><i /></i>
            <span>Narta <strong>Express</strong><small> LLC</small></span>
          </span>
          <span className={styles.authority}>MC 871792</span>
        </div>
      </header>
      <div className={styles.layout}>
        <aside className={styles.intro} aria-label="Owner-operator opportunity">
          <div className={styles.cover}>
            <h1>Owner-operator <span>application</span></h1>
          </div>
          <div className={styles.desktopRequirements}>
            <h2>Before you apply</h2>
            <Requirements />
          </div>
          <details className={styles.mobileRequirements}>
            <summary>Eligibility and documents</summary>
            <Requirements />
          </details>
        </aside>
        <ApplicationForm />
      </div>
    </main>
  );
}
