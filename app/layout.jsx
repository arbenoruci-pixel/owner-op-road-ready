import '../source/src/styles.css';

export const metadata = {
  title: 'Owner-Op Road Ready',
  description: 'Manual logbook and digital wallet for ELD-exempt owner-operators.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
