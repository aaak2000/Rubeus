import { describe, expect, it } from 'vitest';
import { TokenCrypto } from './token-crypto';

const KEY = '0'.repeat(64); // 32 bytes

describe('TokenCrypto', () => {
  it('round-trips a value', () => {
    const c = new TokenCrypto(KEY);
    const secret = 'ya29.some-oauth-access-token';
    expect(c.decrypt(c.encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const c = new TokenCrypto(KEY);
    expect(c.encrypt('x')).not.toBe(c.encrypt('x'));
  });

  it('rejects an invalid key length', () => {
    expect(() => new TokenCrypto('abcd')).toThrow(/32 bytes/);
  });

  it('fails to decrypt tampered ciphertext (GCM auth)', () => {
    const c = new TokenCrypto(KEY);
    const enc = c.encrypt('secret');
    const tampered = Buffer.from(enc, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => c.decrypt(tampered.toString('base64'))).toThrow();
  });
});
