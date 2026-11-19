import { listApplications, reviewApplication, submitApplication } from '../../../../lib/recruiting/applications.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = listApplications;
export const POST = submitApplication;
export const PATCH = reviewApplication;
