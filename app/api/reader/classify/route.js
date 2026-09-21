import {createAiReaderHandlers} from '../../../../lib/reader-ai/server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const handlers = createAiReaderHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
