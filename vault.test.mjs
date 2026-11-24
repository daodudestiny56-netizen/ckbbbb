import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encryptResult,
  decryptResult,
  testDecryption,
  sha256Hex,
  verifyPreimageProof,
  serializeVaultReport,
  deserializeVaultReport,
  wrapContentKey,
  unwrapContentKey,
  toHex,
} from './lib/crypto.ts';
import { VAULT_PRESETS } from './lib/vault-presets.ts';
import { payForOffer, validateOffer } from './lib/payment.ts';

test('AES-256-GCM encryption and decryption roundtrip produces identical plaintext', async () => {
  const plaintext = 'Classified energy dispatch model payload: optimization verified.';
  const encrypted = await encryptResult(plaintext);

  assert.ok(encrypted.key.startsWith('0x'));
  assert.equal(encrypted.key.length, 66); // 32 bytes hex + 0x
  assert.ok(encrypted.payload.ciphertext.startsWith('0x'));
  assert.equal(encrypted.payload.iv.length, 26); // 12 bytes hex + 0x

  const decrypted = await decryptResult(encrypted.payload, encrypted.key);
  assert.equal(decrypted, plaintext);
});

test('Decryption with unauthorized random key is strictly rejected by AES-GCM authentication tag', async () => {
  const plaintext = 'Secret Research Brief';
  const encrypted = await encryptResult(plaintext);

  const fakeKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const fakeKey = toHex(fakeKeyBytes);

  const testResult = await testDecryption(encrypted.payload, fakeKey);
  assert.equal(testResult.success, false);
  assert.ok(testResult.error);

  await assert.rejects(
    decryptResult(encrypted.payload, fakeKey),
    /operation failed|tag mismatch|decrypt/i,
  );
});

test('Tampered ciphertext is detected and rejected by GCM authentication tag', async () => {
  const plaintext = 'Uncompromised intelligence brief';
  const encrypted = await encryptResult(plaintext);

  // Tamper with the last byte of ciphertext
  const originalBytes = encrypted.payload.ciphertext;
  const lastByte = originalBytes.slice(-2);
  const tamperedByte = (parseInt(lastByte, 16) ^ 0xff).toString(16).padStart(2, '0');
  const tamperedCiphertext = `${originalBytes.slice(0, -2)}${tamperedByte}`;

  const tamperedPayload = {
    ciphertext: tamperedCiphertext,
    iv: encrypted.payload.iv,
  };

  const testResult = await testDecryption(tamperedPayload, encrypted.key);
  assert.equal(testResult.success, false);
});

test('Cryptographic preimage SHA-256 verification binds payment hash to AES-GCM key', async () => {
  const encrypted = await encryptResult('TLC Bound Payload');
  const paymentHash = await sha256Hex(encrypted.key);

  const verification = await verifyPreimageProof(encrypted.key, paymentHash);
  assert.equal(verification.valid, true);
  assert.equal(verification.preimageMatchesHash, true);
  assert.equal(verification.computedPaymentHash?.toLowerCase(), paymentHash.toLowerCase());
});

test('Wrong payment hash fails SDK preimage verification', async () => {
  const encrypted = await encryptResult('TLC Bound Payload');
  const wrongHash = `0x${'f'.repeat(64)}`;
  const failedVerification = await verifyPreimageProof(encrypted.key, wrongHash);
  assert.equal(failedVerification.valid, false);
  assert.equal(failedVerification.preimageMatchesHash, false);
});

test('Vault structured reports serialize and deserialize with full metadata fidelity', () => {
  for (const preset of VAULT_PRESETS) {
    const serialized = serializeVaultReport(preset);
    assert.ok(serialized.startsWith('---FIBER-VAULT-REPORT-v1---\n'));

    const parsed = deserializeVaultReport(serialized);
    assert.ok(parsed);
    assert.equal(parsed.id, preset.id);
    assert.equal(parsed.title, preset.title);
    assert.equal(parsed.category, preset.category);
    assert.equal(parsed.classifiedPayload, preset.classifiedPayload);
    assert.equal(parsed.attachmentFileName, preset.attachmentFileName);
  }
});

test('Optional wrap-to-buyer-key mode wraps content key and unwrap restores identical key', async () => {
  const contentKey = `0x${'a1'.repeat(32)}`;
  const buyerSecret = `0x${'b2'.repeat(32)}`;

  // Wrap content key
  const bundle = await wrapContentKey(contentKey, buyerSecret);
  assert.ok(bundle.wrappedKey.startsWith('0x'));
  assert.ok(bundle.wrapIv.startsWith('0x'));

  // Intermediate node with wrong secret fails to unwrap
  const wrongSecret = `0x${'00'.repeat(32)}`;
  await assert.rejects(
    unwrapContentKey(bundle.wrappedKey, bundle.wrapIv, wrongSecret),
    /operation failed|tag mismatch|decrypt/i,
  );

  // Buyer with correct secret unwraps original key
  const unwrapped = await unwrapContentKey(bundle.wrappedKey, bundle.wrapIv, buyerSecret);
  assert.equal(unwrapped, contentKey);
});

test('Replayed offer with mismatched attempted payment hash is rejected before submission', async () => {
  const hash = `0x${'b'.repeat(64)}`;
  const previousAttempt = `0x${'c'.repeat(64)}`;
  const offer = { invoice: 'fibt-example', paymentHash: hash, lastHop: {} };

  const node = {
    parseInvoice: async () => ({
      invoice: { currency: 'Fibt', amount: '0x5f5e100', data: { payment_hash: hash } },
    }),
    sendPayment: async () => assert.fail('Should not be called'),
    getPayment: async () => assert.fail('Should not be called'),
  };

  await assert.rejects(
    payForOffer(node, offer, previousAttempt, () => {}),
    /Restore the offer for the previous payment/,
  );
});

test('Simulator engine executes full end-to-end pay-to-unlock flow faithfully', async () => {
  const { FiberSimulatorEngine } = await import('./lib/simulator.ts');
  const sim = new FiberSimulatorEngine();

  // 1. Start nodes
  const nodes = await sim.startNodes();
  assert.equal(nodes.buyer.connected, true);
  assert.equal(nodes.seller.connected, true);

  // 2. Open channels
  const channels = await sim.openChannels();
  assert.equal(channels.buyer.channelReady, true);
  assert.equal(channels.seller.channelReady, true);

  // 3. Create offer
  const secretContent = 'Autonomous Energy Grid Dispatch Model & Private Weights';
  const { offer } = await sim.createOffer(secretContent);
  assert.equal(offer.version, 2);
  assert.equal(offer.cipher, 'AES-256-GCM');
  assert.ok(offer.invoice.startsWith('fibt'));

  // 4. Test unauthorized decryption without key fails
  const randomKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const unauthorizedTest = await testDecryption(offer, randomKey);
  assert.equal(unauthorizedTest.success, false);

  // 5. Pay invoice -> reveals preimage
  const receipt = await sim.payOffer(offer);
  assert.equal(receipt.status, 'Success');
  assert.ok(receipt.payment_preimage);
  assert.equal(receipt.payment_hash, offer.paymentHash);

  // 6. Preimage SHA-256 matches paymentHash
  const proof = await verifyPreimageProof(receipt.payment_preimage, offer.paymentHash);
  assert.equal(proof.valid, true);

  // 7. Decrypt with revealed key succeeds
  const unlocked = await decryptResult(offer, receipt.payment_preimage);
  assert.equal(unlocked, secretContent);
});
