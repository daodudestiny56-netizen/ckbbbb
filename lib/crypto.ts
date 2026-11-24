import { verifyPreimageHash } from '@fiber-pay/sdk';
import type { VaultIntelligenceReport, DecryptionVerification } from './vault-types.ts';

export type EncryptedPayload = {
  ciphertext: `0x${string}`;
  iv: `0x${string}`;
  wrappedKey?: `0x${string}`;
  wrapIv?: `0x${string}`;
};

export const toHex = (bytes: Uint8Array) =>
  `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

export const fromHex = (value: string) =>
  Uint8Array.from(value.replace(/^0x/, '').match(/.{2}/g) ?? [], (part) =>
    Number.parseInt(part, 16),
  );

export async function sha256Hex(data: Uint8Array | string): Promise<`0x${string}`> {
  const bytes = typeof data === 'string' ? (data.startsWith('0x') ? fromHex(data) : new TextEncoder().encode(data)) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as ArrayBufferView<ArrayBuffer>);
  return toHex(new Uint8Array(hashBuffer));
}

export async function encryptResult(plaintext: string) {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw', new Uint8Array(keyBytes), { name: 'AES-GCM' }, false, ['encrypt'],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext),
  );
  return {
    key: toHex(keyBytes),
    payload: { ciphertext: toHex(new Uint8Array(ciphertext)), iv: toHex(iv) } satisfies EncryptedPayload,
  };
}

export async function decryptResult(payload: EncryptedPayload, keyHex: string) {
  const key = await crypto.subtle.importKey(
    'raw', new Uint8Array(fromHex(keyHex)), { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(fromHex(payload.iv)) },
    key,
    new Uint8Array(fromHex(payload.ciphertext)),
  );
  return new TextDecoder().decode(plaintext);
}

export async function testDecryption(payload: EncryptedPayload, keyHex: string): Promise<{ success: boolean; error?: string }> {
  try {
    await decryptResult(payload, keyHex);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AES-GCM decryption failed (integrity check rejected).',
    };
  }
}

/**
 * Optional Recipient Key-Wrapping Mode:
 * Encrypts the content AES key using a shared secret or buyer public key derivation.
 * Ensures an intermediary node (Bottle) who sees the revealed payment preimage cannot
 * decrypt the content unless they also hold the buyer secret.
 */
export async function wrapContentKey(contentKeyHex: string, buyerSecretHex: string) {
  const wrapKeyBytes = fromHex(buyerSecretHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(wrapKeyBytes), { name: 'AES-GCM' }, false, ['encrypt'],
  );
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, wrapKey, new TextEncoder().encode(contentKeyHex),
  );
  return {
    wrappedKey: toHex(new Uint8Array(wrapped)),
    wrapIv: toHex(iv),
  };
}

export async function unwrapContentKey(
  wrappedKeyHex: string,
  wrapIvHex: string,
  buyerSecretHex: string,
): Promise<string> {
  const wrapKeyBytes = fromHex(buyerSecretHex);
  const wrapKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(wrapKeyBytes), { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const unwrapped = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(fromHex(wrapIvHex)) },
    wrapKey,
    new Uint8Array(fromHex(wrappedKeyHex)),
  );
  return new TextDecoder().decode(unwrapped);
}

export async function verifyPreimageProof(
  preimageHex: string,
  expectedPaymentHashHex: string,
): Promise<DecryptionVerification> {
  try {
    const sdkMatches = verifyPreimageHash(
      preimageHex as `0x${string}`,
      expectedPaymentHashHex as `0x${string}`,
      'sha256',
    );
    const computedHash = await sha256Hex(preimageHex);
    return {
      valid: sdkMatches,
      sha256Proof: true,
      preimageMatchesHash: sdkMatches,
      computedPaymentHash: computedHash,
      expectedPaymentHash: expectedPaymentHashHex,
    };
  } catch (err) {
    return {
      valid: false,
      sha256Proof: false,
      preimageMatchesHash: false,
      error: err instanceof Error ? err.message : 'Cryptographic proof verification failed',
    };
  }
}

const VAULT_REPORT_PREFIX = '---FIBER-VAULT-REPORT-v1---\n';

export function serializeVaultReport(report: VaultIntelligenceReport): string {
  return `${VAULT_REPORT_PREFIX}${JSON.stringify(report, null, 2)}`;
}

export function deserializeVaultReport(content: string): VaultIntelligenceReport | null {
  if (!content.startsWith(VAULT_REPORT_PREFIX)) return null;
  try {
    const jsonStr = content.slice(VAULT_REPORT_PREFIX.length);
    return JSON.parse(jsonStr) as VaultIntelligenceReport;
  } catch {
    return null;
  }
}
