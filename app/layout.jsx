import '../source/src/styles.css';
import '../source/src/command-center.css';

export const metadata = {
  title: 'Owner-Op Road Ready',
  applicationName: 'Owner-Op Road Ready',
  description: 'Smart paper logbook, DOT check, inspection, and manual RODS workflow for ELD-exempt owner-operators.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Road Ready',
    statusBarStyle: 'black-translucent'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Road Ready" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
