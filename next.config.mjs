import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const releaseMeta = JSON.parse(
  fs.readFileSync(new URL('./release-version.json', import.meta.url), 'utf8'),
);
const appVersion = String(releaseMeta.version || '0.0.0');
const appBuild = String(releaseMeta.build || `v${appVersion.replace(/\./g, '')}`);
// The full release materializes the capture engine before starting Next.
// Older local builds retain the driver's PDF/photo picker.
const hasPodScanner = fs.existsSync(
  new URL('./source/src/modules/scan/v3/cameraRuntimeV1104117.js', import.meta.url),
);
const podScannerEntry = hasPodScanner ? './app/operator/PodScanner.jsx' : './app/operator/podScannerUnavailable.js';
// A temporary signed-in POD test gets its own Supabase project on its dedicated
// preview Git branch. A missing binding must never send test uploads to live.
const podTestBranch = /^preview\/pod-notice-24h-[0-9]{8}$/.test(process.env.VERCEL_GIT_COMMIT_REF || '');
const podTestRef = process.env.RR_POD_TEST_PROJECT_REF || '';
const podTestKey = process.env.RR_POD_TEST_PUBLISHABLE_KEY || '';
if (podTestBranch || podTestRef || podTestKey) {
  if (!podTestBranch || process.env.VERCEL_ENV !== 'preview' ||
      !/^[a-z]{20}$/.test(podTestRef) || podTestRef === 'ghwkcgczuwctzxsxmqzx' ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(podTestKey)) {
    throw new Error('The private POD test requires its own preview branch and publishable Supabase binding.');
  }
}
const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  generateBuildId: async () => appBuild.replace(/[^a-zA-Z0-9_-]+/g, '-'),
  env: {
    NEXT_PUBLIC_OWNER_OP_APP_VERSION: appVersion,
    NEXT_PUBLIC_OWNER_OP_APP_BUILD: appBuild,
    NEXT_PUBLIC_OPERATOR_POD_SCANNER: String(hasPodScanner),
    NEXT_PUBLIC_RR_POD_TEST_PROJECT_REF: podTestRef,
    NEXT_PUBLIC_RR_POD_TEST_PUBLISHABLE_KEY: podTestKey,
  },
  turbopack: {
    resolveAlias: { 'roadready-pod-scanner': podScannerEntry },
  },
  webpack(config) {
    config.resolve.alias['roadready-pod-scanner'] = fileURLToPath(new URL(podScannerEntry, import.meta.url));
    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [
          ...noStoreHeaders,
          { key: 'X-Owner-Op-App-Version', value: appVersion },
          { key: 'X-Owner-Op-App-Build', value: appBuild },
        ],
      },
      {
        source: '/app-version.json',
        headers: noStoreHeaders,
      },
      {
        source: '/release-proof.json',
        headers: noStoreHeaders,
      },
      {
        source: '/update.html',
        headers: noStoreHeaders,
      },
      {
        source: '/manifest.webmanifest',
        headers: noStoreHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          ...noStoreHeaders,
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'X-Owner-Op-SW-Version', value: appVersion },
          { key: 'X-Owner-Op-SW-Build', value: appBuild },
        ],
      },
    ];
  },
};

export default nextConfig;
