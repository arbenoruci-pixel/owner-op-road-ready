import {createSupabaseAdminClient, requireAuthenticatedUser, requireDriverForUser} from '../../../../lib/supabase/server.js';
import {createDocumentOriginalHandlerV110344} from '../../../../lib/documents/readOriginalDocumentV110344.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createDocumentOriginalHandlerV110344({
  authenticate:requireAuthenticatedUser,
  createAdmin:createSupabaseAdminClient,
  findDriver:requireDriverForUser,
});
