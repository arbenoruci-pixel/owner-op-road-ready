import fs from 'node:fs';

const releaseMeta = JSON.parse(
  fs.readFileSync(new URL('./release-version.json', import.meta.url), 'utf8'),
);
const appVersion = String(releaseMeta.version || '0.0.0');
const appBuild = String(releaseMeta.build || `v${appVersion.replace(/\./g, '')}`);
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
