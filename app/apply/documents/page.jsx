import styles from '../apply.module.css';
import upload from './documents.module.css';
import DocumentUpload from './DocumentUpload.jsx';

export const metadata = {
  title: 'Insurance documents | Narta Express LLC',
  description: 'Private document upload for Narta Express owner-operator insurance review.',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#132a38',
};

export default function InsuranceDocumentsPage() {
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
      <div className={upload.layout}>
        <h1>Insurance documents</h1>
        <DocumentUpload />
        <noscript><p>Enable JavaScript, then reopen the personal link from Narta Express.</p></noscript>
      </div>
    </main>
  );
}
