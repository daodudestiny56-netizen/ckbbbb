# FiberVault: Trustless Encrypted Data Delivery on CKB Fiber Network

[![CKB Testnet](https://img.shields.io/badge/Network-CKB%20Testnet-green.svg)](https://faucet.nervos.org)
[![Fiber Network](https://img.shields.io/badge/Fiber%20Network-v0.10.1-emerald.svg)](https://www.fiber.world)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black.svg)](https://nextjs.org)
[![Tests](https://img.shields.io/badge/Tests-18%20Passing-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg)]()

> **Submission for CKB Fiber Network Campaign: Quest 2 (Advanced) - Pay-to-Unlock**  
> GitHub Repository: [https://github.com/daodudestiny56-netizen/ckbbbb](https://github.com/daodudestiny56-netizen/ckbbbb)  
> Deployment: Run locally on Node.js (requires WebAssembly cross-origin isolation)

---

## What It Does

FiberVault is a trustless, atomic pay-to-unlock marketplace built on top of the CKB Fiber Network testnet. It allows a seller to publish an encrypted digital asset (such as an engineering research brief or design token package) alongside a free public preview, while keeping the full content mathematically locked behind a 1 CKB Fiber invoice.

The unlocking mechanism does not rely on a trusted third-party server. Instead, it binds symmetric encryption directly to Fiber Network payment channel contracts:

1. The seller encrypts the confidential payload using authenticated **AES-256-GCM**, generating a random 32-byte secret key and a 12-byte initialization vector (IV).
2. The seller creates a Fiber invoice where the **payment preimage is the exact 32-byte AES key**:
   ```text
   payment_hash = SHA-256(AES_Key)
   ```
3. The seller distributes the public offer (containing ciphertext, IV, and the Fiber invoice) out-of-band to the buyer.
4. The buyer verifies the invoice and attempts unauthorized decryption to verify that the cipher rejects reads without the key.
5. The buyer pays the 1 CKB invoice through the Fiber Network multi-hop route (`Buyer A -> Bottle B -> Seller C`).
6. To claim the funds, the seller's node reveals the preimage to the channel network. The settled preimage returns to Buyer A upon payment completion.
7. Buyer A inputs the revealed preimage into the AES-256-GCM decryptor, unlocking the full original text.

---

## Why It Matters

Standard Web2 paywalls force the user to pay first and trust that the seller's server will deliver the purchased file. If the server crashes or reneges, the buyer loses funds.

With Fiber's Hash Time-Locked Contracts (TLCs), **payment settlement and key revelation are atomic**. The seller cannot claim the 1 CKB without revealing the preimage across the channel route, and the buyer automatically receives the preimage the moment the payment settles.

---

## What I Changed from the Official Starter Kit

I adapted the official `fiber-encrypted-data-payment` starter kit into a structured marketplace application. The table below lists every modified and added file, verified against `git diff`:

| File / Component | Official Starter | What I Changed in FiberVault |
|:---|:---|:---|
| `app/page.tsx` | Single linear script with raw textareas and 2-line plain text | Rebuilt into an interactive two-panel terminal (Seller Studio and Buyer Terminal) with route diagnostics, dynamic redaction paywalls, and verification badges. |
| `app/globals.css` | 20 lines of basic styling | Custom responsive layout with animated redaction bars (`.redacted-paywall`), channel topology cards, and status indicators. |
| `lib/crypto.ts` | 39 lines: basic `encryptResult` / `decryptResult` | Added `verifyPreimageProof` using the SDK's `verifyPreimageHash`, `testDecryption` for failure validation, structured report serialization, and optional recipient key-wrapping (`wrapContentKey` / `unwrapContentKey`). |
| `lib/vault-presets.ts` | Did not exist | Added realistic, harmless presets: Energy Grid Research Brief, Institutional Macro Analysis, and Design Token Packages, plus custom content authoring. |
| `lib/vault-types.ts` | Did not exist | TypeScript definitions for structured reports and verification payloads. |
| `lib/simulator.ts` | Did not exist | Offline sandbox mock engine for fast local UI testing without requiring live testnet faucet confirmations. Clearly labeled as mock. |
| `vault.test.mjs` | Did not exist | Added 9 new unit and integration tests covering AES-GCM roundtrips, unauthorized tag rejection, ciphertext tampering detection, SHA-256 proof validation, preset serialization, recipient key-wrapping, replayed offer rejection, and simulator execution. |
| `package.json` | Tested only `payment.test.mjs` | Updated `test` script to run both `payment.test.mjs` and `vault.test.mjs`. |

---

## How to Run Locally

### Prerequisites
- Node.js v22.18.0 or newer (tested on v24.11.1)
- npm v10.0.0 or newer
- Modern browser (Chrome, Brave, Edge) with WebAssembly and Web Locks support

### Commands

```sh
# 1. Clone repository
git clone https://github.com/daodudestiny56-netizen/ckbbbb.git
cd ckbbbb

# 2. Install dependencies
npm install

# 3. Run automated test suite (all 18 tests pass)
npm test

# 4. Start local development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

> [!NOTE]
> Fiber's WebAssembly runtime requires cross-origin isolation (`SharedArrayBuffer` and `Web Locks`). The Next.js dev server serves the required `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers configured in `next.config.mjs`.

---

## Live Testnet Flow Walkthrough

The application defaults to **[Testnet] Live WASM Node**. An **[Offline Sandbox]** toggle is available for testing the UI without waiting for block confirmations.

### Step 1: Start Nodes and Fund Channels
1. In the Network Topology section, start **Buyer A** and **Seller C**.
2. Copy each node's address to the [Nervos Testnet Faucet](https://faucet.nervos.org) and request Testnet CKB.
3. Once funded, click **Open 500 CKB Channel** with Bottle for both nodes.
4. Wait for on-chain block confirmation until both channels report `CHANNEL_READY`.
5. On the Seller side, click **Send 5 CKB keysend** to Bottle. This shifts 5 CKB of balance to Bottle's side of the channel, giving Bottle the inbound liquidity needed to route incoming payments to the Seller.

### Step 2: Encrypt and Create Offer (Seller Studio)
1. Select an intelligence brief preset (or enter custom text).
2. Click **Encrypt and Create 1 CKB Invoice**.
3. The seller's browser generates an AES-256-GCM key, encrypts the payload, and calls `seller.newInvoice` with `payment_preimage = key` and `hash_algorithm: 'sha256'`.
4. Click **1-Click Bridge to Buyer** (or copy the generated offer JSON manually).

### Step 3: Validate and Challenge Decryption (Buyer Terminal)
1. In the Buyer Terminal, click **Validate Offer & Invoice**. The app decodes the invoice and checks that the amount is 1 CKB and the payment hash matches.
2. The public executive teaser is displayed in readable text, while the confidential section is obscured by animated redaction bars.
3. Click **Challenge: Decrypt Without Key**. The app attempts AES-GCM decryption with a random 256-bit key. The browser's Web Crypto API rejects the operation with an authentication tag mismatch, proving the content cannot be forged or read without the preimage.

### Step 4: Pay Invoice
1. Click **Pay 1 CKB with Fiber Network**.
2. Buyer A sends payment through Bottle B to Seller C.
3. Upon settlement, the payment receipt displays:
   - Payment status: `Success`
   - Actual routing fee paid to Bottle (e.g. `0.001 CKB`)
   - Payment hash: `0x...`
   - Revealed Preimage: `0x...`

### Step 5: Decrypt and Export
1. Click **Decrypt with Revealed Preimage Key**.
2. The revealed preimage is imported as the AES-256-GCM key.
3. The redaction bars dissolve and the full intelligence report is displayed.
4. Click **Download Full Report (.md)** or **Download Cryptographic Receipt (.json)**.

---

## Problems I Hit and How I Solved Them

1. **Channel Readiness Drops on Testnet**:  
   During testnet operation, channels occasionally drop out of `CHANNEL_READY` (such as during transient peer disconnects or unconfirmed on-chain reorgs). In the starter kit, this caused the Pay button to become silently disabled with no user explanation.  
   *Solution*: I added explicit channel diagnostic tracking (`isBuyerReady`, `isSellerReady`, `isRouteReady`) that explains exactly which channel is not ready and provides a dedicated "Refresh Status" button to query the node without reloading the page.

2. **Multi-Tab Session Lock Collisions**:  
   Opening Buyer and Seller in two separate browser tabs caused the Web Locks API in `lib/node-session.ts` to reject with `"Another tab is currently using this saved node profile"`.  
   *Solution*: Handled the session lock exception specifically and displayed a prominent warning informing the user to close competing tabs, while cleanly releasing locks on `pagehide`.

3. **Inbound Liquidity on the Seller Channel**:  
   Opening a channel puts 100% of the funds on the local side (`Seller: 500 CKB | Bottle: 0 CKB`). In this state, Bottle cannot forward payments *to* the Seller because Bottle has 0 CKB remote balance on that channel.  
   *Solution*: Integrated the 5 CKB keysend rebalance transfer into the Seller card, shifting liquidity so Bottle has remote capacity to route incoming buyer payments.

---

## Threat Model and Known Limitations

1. **Intermediary Node Visibility**:  
   When the payment settles, Bottle (the routing node) learns the `payment_preimage`. However, **Bottle never sees the encrypted ciphertext** because the offer JSON is transferred out-of-band directly between the seller and buyer. Bottle cannot decrypt content it does not possess.
2. **Preimage Replay**:  
   Anyone who possesses *both* the ciphertext and the settled preimage can decrypt the data. For this reason, a seller must create a fresh offer and invoice for each prospective buyer.
3. **Optional Recipient Key-Wrapping**:  
   To defend against an observer who intercepts both the public offer and the on-chain settlement, FiberVault includes an optional key-wrapping mode (`wrapContentKey` / `unwrapContentKey`). In this mode, the seller additionally encrypts the AES key to a buyer-specific secret before creating the invoice.
4. **Known Limitations**:
   - The Fiber WASM runtime requires single-tab operation due to exclusive IndexedDB / Web Locks access.
   - Channel opening confirmation times depend on underlying CKB testnet block mining intervals (typically 1 to 5 minutes).

---

## Automated Test Suite

Run the full test suite with:
```sh
npm test
```

### Real Test Output:
```text
> test
> node --experimental-strip-types --test payment.test.mjs vault.test.mjs

✔ mismatched currency, amount, or payment hash blocks submission (13.16ms)
✔ attempt is recorded before submission and failed storage prevents spending (2.71ms)
✔ restored successful and pending payments are checked without resubmission (1.37ms)
✔ retry requires both explicit intent and a verified failure (1.89ms)
✔ an expired Invoice is rejected before recording or submitting a new payment (4.49ms)
✔ a rejected submission clears durable progress so reload does not restore a nonexistent attempt (3.49ms)
✔ an uncertain send or a polling timeout retains the attempt across reload and never resends it (3.81ms)
✔ settled payments can still be recovered after their Invoice expires (1.23ms)
✔ a failed attempt reset cannot silently ignore a browser storage error (2.50ms)
✔ AES-256-GCM encryption and decryption roundtrip produces identical plaintext (52.04ms)
✔ Decryption with unauthorized random key is strictly rejected by AES-GCM authentication tag (8.42ms)
✔ Tampered ciphertext is detected and rejected by GCM authentication tag (9.75ms)
✔ Cryptographic preimage SHA-256 verification binds payment hash to AES-GCM key (12.97ms)
✔ Wrong payment hash fails SDK preimage verification (4.15ms)
✔ Vault structured reports serialize and deserialize with full metadata fidelity (1.78ms)
✔ Optional wrap-to-buyer-key mode wraps content key and unwrap restores identical key (7.20ms)
✔ Replayed offer with mismatched attempted payment hash is rejected before submission (1.33ms)
✔ Simulator engine executes full end-to-end pay-to-unlock flow faithfully (1756.76ms)

ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

---

## License
MIT (c) 2026 daodudestiny56-netizen
