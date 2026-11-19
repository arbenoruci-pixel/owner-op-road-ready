import { issueDocumentInvite, readRecruitingDocuments, uploadRecruitingDocument } from '../../../../lib/recruiting/documents.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = readRecruitingDocuments;
export const POST = issueDocumentInvite;
export const PUT = uploadRecruitingDocument;
