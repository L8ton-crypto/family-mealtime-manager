// Derives a client IP to key rate limiting on. This only trusts headers our
// own infrastructure sets, in order:
//
//   1. `x-vercel-forwarded-for` — set by Vercel's edge network itself, based
//      on the actual TCP connection. Vercel overwrites any client-supplied
//      value for this header, so it cannot be spoofed.
//   2. `x-real-ip` — commonly set by a trusted reverse proxy in front of the
//      app (e.g. nginx). Also not client-controlled when such a proxy sits
//      in front of us.
//   3. `x-forwarded-for` — a comma-separated hop list any client can send,
//      and can freely prepend fake entries to. Each hop is supposed to
//      *append* to the end of the list, so the one entry that's actually
//      trustworthy (appended by whatever's directly in front of us) is
//      always the LAST one — never the first, which is fully
//      attacker-controlled. This is the bug that made the previous
//      implementation trivially bypassable: it trusted the first entry.
//   4. `'unknown'` — no useful header present at all.
export interface HeaderGetter {
  get(name: string): string | null;
}

export function getClientIp(headers: HeaderGetter): string {
  const vercelForwardedFor = headers.get('x-vercel-forwarded-for');
  if (vercelForwardedFor && vercelForwardedFor.trim()) {
    return vercelForwardedFor.trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const hops = forwardedFor
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }

  return 'unknown';
}
