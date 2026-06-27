# Vercel Output Directory Fix

Fixes:

`Error: The file "/vercel/path0/dist/routes-manifest.json" couldn't be found.`

Cause:
Vercel was still looking in `dist`, the old Vite/static output directory. The project is now Next.js and must use `.next`.

Changes in v90.0.2:
- `vercel.json` explicitly sets `outputDirectory` to `.next`.
- `package.json` version bumped to `90.0.2`.

Required Vercel dashboard check:
- Framework Preset: Next.js
- Build Command: npm run build
- Output Directory: blank/default or `.next`; never `dist`
- Root Directory: repository root unless you intentionally moved the app

If Vercel still looks in `dist`, redeploy with cache cleared or create a fresh Vercel project to remove the old Vite/static settings.
