import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { verifyPassphrase } from '@/lib/passphrase';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { getClientIp } from '@/lib/clientIp';

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
// Global backstop, independent of IP: protects against a distributed attempt
// (many different real or spoofed source IPs) even though each individual
// IP stays under its own limit.
const RATE_LIMIT_GLOBAL_MAX_ATTEMPTS = 100;
const FAILURE_DELAY_MS = 300;

const bodySchema = z.object({
  passphrase: z.string().min(1),
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const ip = getClientIp(req.headers);

  const [{ ip_count, global_count }] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE ip = ${ip})::int AS ip_count,
      COUNT(*)::int AS global_count
    FROM fm_login_attempts
    WHERE attempted_at > NOW() - (${RATE_LIMIT_WINDOW_MINUTES} * INTERVAL '1 minute')
  `;

  if (
    (global_count as number) >= RATE_LIMIT_GLOBAL_MAX_ATTEMPTS ||
    (ip_count as number) >= RATE_LIMIT_MAX_ATTEMPTS
  ) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const passphraseOk = await verifyPassphrase(parsed.data.passphrase);

  if (!passphraseOk) {
    await sql`INSERT INTO fm_login_attempts (ip) VALUES (${ip})`;
    await delay(FAILURE_DELAY_MS);
    return NextResponse.json({ error: 'invalid_passphrase' }, { status: 401 });
  }

  await sql`DELETE FROM fm_login_attempts WHERE ip = ${ip}`;

  const token = await createSessionToken();
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
