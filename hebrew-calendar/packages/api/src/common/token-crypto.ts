import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for provider OAuth tokens at rest.
 * The key comes from `TOKEN_ENCRYPTION_KEY` (64 hex chars => 32 bytes).
 * Output format: base64( iv[12] | authTag[16] | ciphertext ).
 */
export class TokenCrypto {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}
