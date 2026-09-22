// Validates the `next` query param used to return to the originally
// requested page after login. Only ever returns either the given value
// unchanged, or the safe fallback '/' — never anything else — so callers
// can hard-navigate to the result without re-checking it.
//
// Rejects anything that isn't an honest same-site relative path:
//   - doesn't start with '/'                    (e.g. "https://evil.com",
//                                                 "javascript:alert(1)")
//   - starts with '//'                          (protocol-relative URL,
//                                                 e.g. "//evil.com")
//   - contains a backslash                      (some URL parsers treat
//                                                 "/\evil.com" like "//evil.com")
//   - contains a colon                          (rules out any protocol,
//                                                 including obscure ones)
export function safeNextPath(rawNext: string | null | undefined): string {
  if (!rawNext) return '/';

  // Browsers strip tab/newline/CR from a URL before navigating to it, which
  // is a known trick to smuggle "/\t/evil.com" past a naive "//" check (it
  // becomes "//evil.com" once those characters are stripped). Normalize the
  // same way before validating.
  const next = rawNext.replace(/[\t\n\r]/g, '');

  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  if (next.includes('\\')) return '/';
  if (next.includes(':')) return '/';

  return next;
}
