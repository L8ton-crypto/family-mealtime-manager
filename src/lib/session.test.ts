import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_COOKIE, sessionCookieOptions } from './session';

beforeEach(() => {
  // 64 hex chars = 32 bytes, computed rather than hand-typed to avoid transcription errors.
  process.env.SESSION_SECRET = 'ab'.repeat(32);
});

describe('SESSION_COOKIE', () => {
  it('is the name specified in the architecture doc', () => {
    expect(SESSION_COOKIE).toBe('rk_session');
  });
});

describe('createSessionToken / verifySessionToken', () => {
  it('round trips: a freshly created token verifies', async () => {
    const token = await createSessionToken();
    await expect(verifySessionToken(token)).resolves.toBe(true);
  });

  it('rejects a token with a tampered signature', async () => {
    const token = await createSessionToken();
    const [payload, signature] = token.split('.');
    const tamperedChar = signature[0] === 'a' ? 'b' : 'a';
    const tampered = `${payload}.${tamperedChar}${signature.slice(1)}`;
    await expect(verifySessionToken(tampered)).resolves.toBe(false);
  });

  it('rejects a token with a tampered payload', async () => {
    const token = await createSessionToken();
    const [payload, signature] = token.split('.');
    const tamperedChar = payload[0] === 'a' ? 'b' : 'a';
    const tampered = `${tamperedChar}${payload.slice(1)}.${signature}`;
    await expect(verifySessionToken(tampered)).resolves.toBe(false);
  });

  it('rejects an expired token', async () => {
    const almostTwoHundredDaysAgo = Date.now() - 181 * 24 * 60 * 60 * 1000;
    const token = await createSessionToken(almostTwoHundredDaysAgo);
    await expect(verifySessionToken(token)).resolves.toBe(false);
  });

  it('accepts a token right up to its expiry and rejects it just after', async () => {
    const now = Date.now();
    const token = await createSessionToken(now);
    // 180 days later, still just inside expiry.
    await expect(
      verifySessionToken(token, now + 179 * 24 * 60 * 60 * 1000)
    ).resolves.toBe(true);
    // Past expiry.
    await expect(
      verifySessionToken(token, now + 181 * 24 * 60 * 60 * 1000)
    ).resolves.toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['no separator', 'not-a-real-token'],
    ['too many parts', 'a.b.c'],
    ['garbage base64', '!!!.!!!'],
    ['valid-looking but unsigned payload', `${btoa(JSON.stringify({ iat: 0, exp: 9999999999 }))}.bogus`],
  ])('rejects malformed input: %s', async (_label, value) => {
    await expect(verifySessionToken(value as string | undefined | null)).resolves.toBe(false);
  });
});

describe('sessionCookieOptions', () => {
  it('sets httpOnly, sameSite=lax, path=/, and a 180 day maxAge', () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(60 * 60 * 24 * 180);
  });
});
