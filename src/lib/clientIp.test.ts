import { describe, expect, it } from 'vitest';
import { getClientIp, type HeaderGetter } from './clientIp';

function headersFrom(values: Record<string, string>): HeaderGetter {
  return {
    get(name: string) {
      // Header lookups are case-insensitive in real Headers objects.
      const key = Object.keys(values).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? values[key] : null;
    },
  };
}

describe('getClientIp', () => {
  it('branch (a): uses x-vercel-forwarded-for when present, even if other headers disagree', () => {
    const headers = headersFrom({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-real-ip': '198.51.100.1',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });

  it('branch (b): falls back to x-real-ip when x-vercel-forwarded-for is absent', () => {
    const headers = headersFrom({
      'x-real-ip': '198.51.100.1',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    expect(getClientIp(headers)).toBe('198.51.100.1');
  });

  it('branch (c): falls back to the LAST entry of x-forwarded-for, not the first', () => {
    const headers = headersFrom({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9',
    });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });

  it('branch (c): a client prepending spoofed hops cannot change the derived IP', () => {
    const real = headersFrom({ 'x-forwarded-for': '203.0.113.9' });
    const spoofed1 = headersFrom({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' });
    const spoofed2 = headersFrom({ 'x-forwarded-for': '8.8.8.8, 7.7.7.7, 203.0.113.9' });
    expect(getClientIp(real)).toBe('203.0.113.9');
    expect(getClientIp(spoofed1)).toBe('203.0.113.9');
    expect(getClientIp(spoofed2)).toBe('203.0.113.9');
  });

  it('branch (d): returns "unknown" when no relevant header is present', () => {
    expect(getClientIp(headersFrom({}))).toBe('unknown');
  });

  it('ignores headers that are present but empty', () => {
    const headers = headersFrom({
      'x-vercel-forwarded-for': '',
      'x-real-ip': '   ',
      'x-forwarded-for': '203.0.113.9',
    });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });

  it('trims whitespace around forwarded-for hops', () => {
    const headers = headersFrom({ 'x-forwarded-for': '1.2.3.4 ,  203.0.113.9  ' });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });
});
