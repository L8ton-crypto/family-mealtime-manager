// Session tokens for the single shared household session. Web Crypto only
// (`crypto.subtle`, `atob`/`btoa`) so the exact same code runs in
// `src/proxy.ts` and in route handlers, regardless of runtime.
//
// Token shape: `base64url(payload).base64url(hmac_sha256(payload, SESSION_SECRET))`
// where payload is JSON `{ iat, exp }` (unix seconds).

export const SESSION_COOKIE = 'rk_session';

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 180; // 180 days

interface SessionPayload {
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(getSecret()) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signPayload(payloadB64: string): Promise<string> {
  const key = await getHmacKey();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return base64UrlEncode(new Uint8Array(signatureBuffer));
}

/** Constant-time string comparison (equal-length inputs only compare securely). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createSessionToken(now: number = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const exp = iat + SESSION_DURATION_SECONDS;
  const payload: SessionPayload = { iat, exp };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

/** Verifies signature and expiry. Never throws — malformed input just fails verification. */
export async function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return false;

  let expectedSignature: string;
  try {
    expectedSignature = await signPayload(payloadB64);
  } catch {
    return false;
  }
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  let payload: SessionPayload;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(payloadB64));
    payload = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return false;

  const nowSeconds = Math.floor(now / 1000);
  if (nowSeconds >= payload.exp) return false;

  return true;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/** Options for setting the session cookie on a successful login. */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  };
}

/** Options for clearing the session cookie on logout. */
export function clearedSessionCookieOptions(): SessionCookieOptions {
  return { ...sessionCookieOptions(), maxAge: 0 };
}
