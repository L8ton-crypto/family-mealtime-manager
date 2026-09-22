// Constant-time comparison of a submitted passphrase against APP_PASSPHRASE.
// Web Crypto only, so it works identically in proxy.ts and route handlers.

function getExpectedPassphrase(): string {
  const passphrase = process.env.APP_PASSPHRASE;
  if (!passphrase) throw new Error('APP_PASSPHRASE is not set');
  return passphrase;
}

/**
 * Compares `candidate` against APP_PASSPHRASE without leaking timing
 * information proportional to how many leading characters matched. Both
 * strings are first hashed to a fixed length so the comparison itself is
 * length-independent, and the hashes are compared byte-by-byte with no
 * early exit.
 */
export async function verifyPassphrase(candidate: string): Promise<boolean> {
  const expected = getExpectedPassphrase();
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(candidateHash);
  const b = new Uint8Array(expectedHash);

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}
