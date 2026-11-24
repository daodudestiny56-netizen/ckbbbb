# ⚡ FiberVault: Decentralized Zero-Knowledge Intelligence & Digital Asset Marketplace

[![CKB Testnet](https://img.shields.io/badge/Network-CKB%20Testnet-green.svg)](https://faucet.nervos.org)
[![Fiber Network](https://img.shields.io/badge/Fiber%20Network-v0.10.1-emerald.svg)](https://www.fiber.world)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black.svg)](https://nextjs.org)
[![Tests](https://img.shields.io/badge/Tests-15%20Passing-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg)]()

> **Submission for the CKB Fiber Campaign: Quest 2 (Advanced) — Pay-to-Unlock Demo**  
> Built by: `daodudestiny56-netizen`  
> Live Demo / Code Repository: [https://github.com/daodudestiny56-netizen/ckbbbb](https://github.com/daodudestiny56-netizen/ckbbbb)

---

## 📖 Executive Summary & Core Innovation

**FiberVault** transforms the basic pay-to-unlock concept into a decentralized, zero-knowledge confidential intelligence marketplace. In traditional paywalls, users must trust centralized servers to deliver purchased goods after payment. FiberVault implements **cryptographically enforced atomic pay-to-unlock**:

1. **Symmetric Encryption with AES-256-GCM**: Confidential data is encrypted inside the browser using an authenticated 256-bit AES key.
2. **Lightning / Fiber TLC Preimage Binding**: The 32-byte AES key acts directly as the `payment_preimage` for a Fiber Network Hash Time-Locked Contract (HTLC/TLC) invoice:
   $$\text{payment\_hash} = \text{SHA-256}(\text{AES\_Key})$$
3. **Atomic Revelation**: To claim the 1 CKB payment, the Seller's node must settle the TLC across the multi-hop Fiber route (`Buyer -> Bottle -> Seller`). Settle-time reveals the preimage to the Buyer node.
4. **Instant Zero-Knowledge Decryption**: The Buyer's browser receives the revealed preimage as the AES-256-GCM key, decrypts the ciphertext, and renders the intelligence report with zero trust required.

---

## 🎯 Use Case: High-Value Intelligence & Confidential Asset Paywall

Instead of a generic plain text string, FiberVault features real-world, high-consequence intelligence vaults with **dynamic redaction paywalls**:

### Built-in Intelligence Presets:
* 🛡️ **Zero-Day Security Advisory (`CVE-2026-9481`)**:
  * *Public Free Preview*: CVSS 9.8 score, affected smart contract protocols, high-level impact.
  * *Classified Paywall (Redacted)*: Root-cause analysis, reproduction PoC exploit contract, audited patch diff, and SNORT/WAF mitigation rules.
* 📈 **Institutional Macro Alpha Brief**:
  * *Public Free Preview*: Econometric CKB halving supply model and Layer-2 velocity outlook.
  * *Classified Paywall (Redacted)*: Proprietary quantitative formula, Sharpe-optimized allocation weights, and automated channel rebalancing thresholds.
* 🤖 **Proprietary AI Agent Metaprompt & Weights**:
  * *Public Free Preview*: Reliability benchmarks and anti-jailbreak evaluation scores.
  * *Classified Paywall (Redacted)*: Zero-shot metacognitive system prompt, chain-of-thought constraint matrix, and tool invocation guardrails.
* ✍️ **Custom Asset Creator**:
  * Allows any seller to author custom titles, teasers, classified markdown text, and attachment payloads.

---

## 🔄 Cryptographic & Routing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SELLER STUDIO (C)                               │
│  1. Plaintext Intelligence Report                                           │
│  2. AES-256-GCM Encryption ──> Key (32 bytes) = Preimage                    │
│  3. Payment Hash = SHA-256(Preimage)                                        │
│  4. New Fiber Invoice (1 CKB, bound to Payment Hash)                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Public Encrypted Offer JSON
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BUYER TERMINAL (A)                               │
│  5. Receives Offer: Reads unredacted Teaser; Paywall shows redacted bars   │
│  6. Unauthorized Decrypt Challenge: Fails (AES-GCM tag mismatch rejected)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 1 CKB Payment (TLC Locked)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FIBER NETWORK MULTI-HOP ROUTING                          │
│                                                                             │
│   Buyer Node (A) ──[TLC 1 CKB]──> Bottle Hub (B) ──[TLC 1 CKB]──> Seller (C)│
│                                                                     │       │
│                                            Seller settles & reveals │       │
│                                            Preimage (AES Key)       ▼       │
│   Buyer Node (A) <──[Preimage]──── Bottle Hub (B) <──[Preimage]─────────────│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Settled Preimage received
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PAYMENT SETTLEMENT                               │
│  7. Mathematical Proof: Verifies SHA-256(Preimage) === Payment Hash         │
│  8. AES-256-GCM Decrypt: Ciphertext + Preimage ──> Plaintext Report         │
│  9. Dynamic Redactions Dissolve ──> Download .md & Cryptographic Receipt   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Improvements & Additions (What We Changed from Starter)

| Component | Official Starter Kit | **FiberVault (Our Demo)** |
|:---|:---|:---|
| **Use Case & Content** | Hardcoded 2-line plain text string | Multi-category intelligence presets (Zero-Day CVE, Macro Alpha, AI Metaprompt) + Custom creator |
| **User Experience (UI/UX)** | Raw buttons and plain textareas | Sleek Cyberpunk/Institutional dark UI, interactive status alerts, pipeline progress tracker |
| **Paywall Visualizer** | No preview or redaction | Dynamic teaser view with animated high-tech redaction bars (`.redacted-paywall`) |
| **Cryptographic Verification** | Basic decryption call | Formal `verifyPreimageProof`: client-side SHA-256 check verifying mathematical binding of Preimage to Payment Hash |
| **Dual-Engine Architecture** | Only live Testnet WASM | **Dual Engine**: Instant In-Browser Simulator Sandbox + Live Testnet WASM Node Toggle |
| **Challenge Mode** | Simple manual button | Interactive "Challenge: Decrypt Without Key" that proves cryptographic integrity through AES-GCM tag mismatch |
| **Network Topology** | Basic text lines | Live visual routing topology showing Buyer A, Bottle Routing Hub, and Seller C balances |
| **Asset Export** | None | One-click export for Unlocked Markdown Report (`.md`) and Cryptographic Proof Receipt (`.json`) |
| **Testing Suite** | 9 basic tests | **15 Comprehensive Tests** (added AES-GCM roundtrips, unauthorized tag rejection, ciphertext tampering detection, SHA-256 proofs, preset serialization, and full simulator engine runs) |

---

## 🛠️ Getting Started & Local Setup

### Prerequisites
* **Node.js**: v22.18.0 or newer (Tested on v24.11.1)
* **npm**: v10.0.0 or newer

### Installation

1. **Clone the Repository**:
   ```sh
   git clone https://github.com/daodudestiny56-netizen/ckbbbb.git
   cd ckbbbb
   ```

2. **Install Dependencies**:
   ```sh
   npm install
   ```

3. **Start the Development Server**:
   ```sh
   npm run dev
   ```

4. **Open in Browser**:
   Navigate to [http://localhost:3001](http://localhost:3001) in Chrome, Brave, or Edge.

> [!NOTE]
> Next.js serves cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) required by the WebAssembly Fiber runtime and SharedArrayBuffer.

---

## 🧪 Testing & Quality Assurance

FiberVault includes a comprehensive, automated test suite covering all payment validation, cryptographic bounds, and simulation flows.

Run the test suite:
```sh
npm test
```

### Test Suite Output:
```text
✔ mismatched currency, amount, or payment hash blocks submission
✔ attempt is recorded before submission and failed storage prevents spending
✔ restored successful and pending payments are checked without resubmission
✔ retry requires both explicit intent and a verified failure
✔ an expired Invoice is rejected before recording or submitting a new payment
✔ a rejected submission clears durable progress so reload does not restore a nonexistent attempt
✔ an uncertain send or a polling timeout retains the attempt across reload and never resends it
✔ settled payments can still be recovered after their Invoice expires
✔ a failed attempt reset cannot silently ignore a browser storage error
✔ AES-256-GCM encryption and decryption roundtrip produces identical plaintext
✔ Decryption with unauthorized random key is strictly rejected by AES-GCM authentication tag
✔ Tampered ciphertext is detected and rejected by GCM authentication tag
✔ Cryptographic preimage SHA-256 verification binds payment hash to AES-GCM key
✔ Vault structured reports serialize and deserialize with full metadata fidelity
✔ Simulator engine executes full end-to-end pay-to-unlock flow faithfully

ℹ tests 15
ℹ pass 15
ℹ fail 0
```

Typecheck and production build validation:
```sh
npm run typecheck   # 0 TypeScript errors
npm run build       # Clean optimized Next.js production build
```

---

## 📸 Step-by-Step Demo Walkthrough

### Step 1: Initialize Nodes & Verify Channel Status
* Toggle between **🧪 Simulator Sandbox** (for instant evaluation) or **⚡ Live Testnet WASM**.
* Both Buyer A and Seller C connect to the Bottle routing hub, establishing funded channels (`CHANNEL_READY`).

### Step 2: Select Intelligence Brief & Encrypt (Seller Studio)
* Choose a preset (e.g. *Zero-Day Exploit Advisory CVE-2026-9481*).
* Click **🔒 Encrypt & Create 1 CKB Invoice**.
* The browser generates a random 32-byte AES-256-GCM key, encrypts the classified payload, computes `SHA-256(key)`, and generates a 1 CKB Fiber testnet invoice.
* Click **⚡ 1-Click Bridge to Buyer** to populate the Buyer Terminal.

### Step 3: Inspect Teaser & Challenge Decryption (Buyer Terminal)
* Buyer observes the public unredacted teaser (CVSS 9.8, executive summary).
* The confidential section is obscured by animated redaction bars (`LOCKED · AES-256-GCM`).
* Click **🛡️ Challenge: Decrypt Without Key**: Decryption is strictly rejected by the cipher (`AES-GCM authentication tag mismatch`), proving the data cannot be read without settling the invoice.

### Step 4: Pay 1 CKB with Fiber Network
* Click **⚡ Pay 1 CKB with Fiber Network**.
* The payment routes through the Bottle hub to Seller C.
* Seller C claims the payment by releasing the `payment_preimage`.
* Buyer's receipt displays:
  * Settlement status: `Success`
  * Routing fee: `0.001 CKB`
  * Payment hash: `0x...`
  * Revealed Preimage: `0x...`

### Step 5: Decrypt & Export
* Click **🔓 Decrypt with Revealed Preimage Key**.
* The redaction bars dissolve and the full intelligence report (vulnerability analysis, PoC exploit code, patch diff) is unlocked and rendered.
* Click **📥 Download Full Report (.md)** or **📜 Download Cryptographic Receipt (.json)**.

---

## 📁 Repository Structure

```
ckbbbb/
├── app/
│   ├── globals.css           # Cyber-modern styling & animated redactions
│   ├── layout.tsx            # Root Next.js layout
│   └── page.tsx              # FiberVault main dual-engine application
├── lib/
│   ├── crypto.ts             # AES-256-GCM & SHA-256 cryptographic engine
│   ├── vault-presets.ts      # Zero-day CVE, Macro Alpha & AI Metaprompt presets
│   ├── vault-types.ts        # TypeScript schemas for intelligence reports
│   ├── simulator.ts          # Instant Fiber routing & channel simulator engine
│   ├── fiber.ts              # Fiber testnet node & Bottle hub connections
│   ├── fiber-testnet-runtime.ts # Fiber WASM factory loader
│   ├── offer.ts              # EncryptedOffer payload generator & parser
│   ├── payment.ts            # Invoice validation & payment dispatcher
│   ├── payment-submission.ts # Robust RPC error handling & pre-submission checks
│   ├── channel-funding.ts    # Minimum balance checks for Bottle auto-accept
│   ├── node-session.ts       # Concurrent tab session mutex & Web Locks
│   └── progress.ts           # Durable session & local storage state recovery
├── payment.test.mjs          # Payment submission & invoice validation tests
├── vault.test.mjs            # Cryptographic & simulator integration tests
├── next.config.mjs           # Cross-origin isolation headers for WASM
├── tsconfig.json             # TypeScript configuration
└── package.json              # Project dependencies and test scripts
```

---

## 🏆 Submission Checklist

- [x] Full Pay-to-Unlock flow implemented (Seller creates offer -> Buyer pays 1 CKB -> Payment reveals key -> Buyer decrypts)
- [x] Clear real-world use case (Decentralized Intelligence & Zero-Day Security Vault)
- [x] Dual-engine architecture (Instant Simulator Sandbox + Live Testnet WASM Node)
- [x] Cryptographic verification & Preimage-Hash binding proofs
- [x] Dynamic redaction paywall UI
- [x] 15/15 Automated tests passing
- [x] Clean Next.js production build (`npm run build`)
- [x] Public GitHub repository with atomic commit history

---

## 📄 License
MIT © 2026 daodudestiny56-netizen
