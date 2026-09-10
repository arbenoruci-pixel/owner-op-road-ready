export const dynamic = 'force-dynamic';
export function GET() {
  const value = String(process.env.MICROSOFT_OUTLOOK_CLIENT_ID || '').trim();
  const clientId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : null;
  return Response.json({ clientId, ready: Boolean(clientId) }, { headers: { 'Cache-Control': 'no-store' } });
}
