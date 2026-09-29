import {NextResponse} from 'next/server';
import {reverseGpsLookup} from '../../../../source/src/core/gps/reverseLookupV110421.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const {status,body} = await reverseGpsLookup(url.searchParams.get('lat'), url.searchParams.get('lng'), {signal:request.signal});
  return NextResponse.json(body, {status, headers:{'Cache-Control':'no-store, max-age=0',Pragma:'no-cache'}});
}
