import { NextResponse } from 'next/server';
import { SESSION_COOKIE, clearedSessionCookieOptions } from '@/lib/session';

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, '', clearedSessionCookieOptions());
  return response;
}
