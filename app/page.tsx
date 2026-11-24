'use client';

import { useState, useEffect, useRef } from 'react';
import type { FiberBrowserNode, Channel, GetPaymentResult } from '@fiber-pay/sdk/browser';
import { scriptToAddress } from '@fiber-pay/sdk/browser';
import {
  decryptResult,
  testDecryption,
  verifyPreimageProof,
  serializeVaultReport,
  deserializeVaultReport,
  wrapContentKey,
  unwrapContentKey,
  toHex,
} from '../lib/crypto';
import { VAULT_PRESETS } from '../lib/vault-presets';
import type { VaultIntelligenceReport, DecryptionVerification } from '../lib/vault-types';
import {
  bottle,
  channelFundingCkb,
  connectAndOpenChannel,
  readChannel,
  ready,
  startRole,
} from '../lib/fiber';
import { createOffer, parseOffer, type EncryptedOffer } from '../lib/offer';
import { payForOffer, validateOffer } from '../lib/payment';
import { createBrowserNodeSession } from '../lib/node-session';
import {
  encryptedBuyerProfile,
  encryptedSellerProfile,
  savedNodeIdentifier,
} from '../lib/progress';
import { FiberSimulatorEngine, type SimulatedNodeState } from '../lib/simulator';

type Role = 'buyer' | 'seller';
type EngineMode = 'testnet' | 'simulator';

const ckb = (value: string) => `${Number(BigInt(value)) / 100_000_000}`;

export default function FiberVaultPage() {
  // Testnet is default as required by Phase 2
  const [engineMode, setEngineMode] = useState<EngineMode>('testnet');
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [currentReport, setCurrentReport] = useState<VaultIntelligenceReport>(VAULT_PRESETS[0]);
  const [customTitle, setCustomTitle] = useState('');
  const [customTeaser, setCustomTeaser] = useState('');
  const [customClassified, setCustomClassified] = useState('');

  // Optional recipient key-wrapping mode
  const [useWrappedKey, setUseWrappedKey] = useState(false);
  const [buyerSecretHex, setBuyerSecretHex] = useState(
    '0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
  );

  // Multi-tab session conflict state
  const [sessionLockError, setSessionLockError] = useState<string | null>(null);

  // Simulator state (strictly offline testing)
  const simulator = useRef<FiberSimulatorEngine>(new FiberSimulatorEngine());
  const [simNodes, setSimNodes] = useState<{ buyer: SimulatedNodeState; seller: SimulatedNodeState }>(
    simulator.current.getNodes(),
  );

  // Testnet WASM state
  const nodes = useRef<Partial<Record<Role, FiberBrowserNode>>>({});
  const sessions = useRef<Partial<Record<Role, ReturnType<typeof createBrowserNodeSession>>>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState<Partial<Record<Role, string>>>({});
  const [connected, setConnected] = useState<Partial<Record<Role, boolean>>>({});
  const [channels, setChannels] = useState<Partial<Record<Role, Channel>>>({});

  // Offer & Payment state
  const [generatedOfferJson, setGeneratedOfferJson] = useState('');
  const [buyerInputOffer, setBuyerInputOffer] = useState('');
  const [parsedOffer, setParsedOffer] = useState<EncryptedOffer | null>(null);
  const [attemptedHash, setAttemptedHash] = useState('');
  const [testedWithoutKey, setTestedWithoutKey] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const [paymentReceipt, setPaymentReceipt] = useState<{
    status: string;
    payment_hash: string;
    fee: string;
    payment_preimage?: string;
  } | null>(null);
  const [revealedKey, setRevealedKey] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [decryptedReport, setDecryptedReport] = useState<VaultIntelligenceReport | null>(null);
  const [verification, setVerification] = useState<DecryptionVerification | null>(null);

  // Wrapped key metadata
  const [wrappedKeyBundle, setWrappedKeyBundle] = useState<{ wrappedKey: string; wrapIv: string } | null>(null);

  // Status and Notifications
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error' | 'warning'; text: string }>({
    type: 'info',
    text: 'Fiber Testnet WASM engine active. Start Buyer A and Seller C nodes to connect to Bottle.',
  });

  useEffect(() => {
    setLoaded(true);
    const owned = sessions.current;
    const stop = () => {
      for (const session of Object.values(owned)) {
        void session.stop().catch(() => {});
      }
    };
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
      nodes.current = {};
      sessions.current = {};
    };
  }, []);

  function changeEngineMode(mode: EngineMode) {
    setEngineMode(mode);
    setStatusMsg(
      mode === 'simulator'
        ? { type: 'info', text: '[SANDBOX] Offline simulator active. No CKB testnet transactions will be sent.' }
        : { type: 'info', text: 'Fiber Testnet WASM engine active. Start Buyer A and Seller C nodes to connect to Bottle.' },
    );
  }

  function selectPreset(index: number) {
    setActivePresetIndex(index);
    if (index < VAULT_PRESETS.length) {
      setCurrentReport(VAULT_PRESETS[index]);
    } else {
      setCurrentReport({
        id: 'custom-' + Date.now(),
        title: customTitle || 'CUSTOM INTEL: Confidential Analysis & Security Brief',
        category: 'custom',
        classification: 'RESTRICTED',
        severityOrRating: 'CONFIDENTIAL',
        author: 'Independent Research Desk',
        timestamp: new Date().toISOString(),
        priceCkb: '1',
        previewTeaser: customTeaser || 'Public executive preview of confidential intelligence data.',
        classifiedPayload:
          customClassified || '## CLASSIFIED PAYLOAD\nConfidential insights unlocked via Fiber payment.',
      });
    }
    resetOfferFlow();
  }

  function resetOfferFlow() {
    setGeneratedOfferJson('');
    setBuyerInputOffer('');
    setParsedOffer(null);
    setAttemptedHash('');
    setTestedWithoutKey(false);
    setDecryptError('');
    setPaymentReceipt(null);
    setRevealedKey('');
    setDecryptedText('');
    setDecryptedReport(null);
    setVerification(null);
    setWrappedKeyBundle(null);
  }

  // Refresh real channel status from WASM node
  async function refreshWasmChannel(role: Role) {
    const node = nodes.current[role];
    if (!node) return;
    try {
      const ch = await readChannel(node);
      const { peers } = await node.listPeers();
      const isConnected = peers.some(
        (p) => p.pubkey.replace(/^0x/i, '').toLowerCase() === bottle.pubkey.slice(2).toLowerCase(),
      );
      setConnected((prev) => ({ ...prev, [role]: isConnected }));
      setChannels((prev) => ({ ...prev, [role]: ch }));
      if (ch) {
        const stateName = ch.state.state_name;
        if (ready(ch)) {
          setStatusMsg({ type: 'success', text: `${role.toUpperCase()} channel is READY on CKB Testnet.` });
        } else {
          setStatusMsg({
            type: 'info',
            text: `${role.toUpperCase()} channel state: ${stateName}. Awaiting confirmation on CKB testnet.`,
          });
        }
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: `Failed to refresh channel for ${role}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  async function copyTestnetAddress(role: Role) {
    const address = addresses[role];
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setStatusMsg({ type: 'success', text: `${role.toUpperCase()} CKB Testnet address copied to clipboard.` });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: `Could not copy ${role.toUpperCase()} CKB Testnet address: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Real Testnet WASM Node Actions
  async function wasmStartNode(role: Role) {
    setBusy(true);
    setSessionLockError(null);
    setStatusMsg({ type: 'info', text: `Starting WASM Fiber node for ${role}...` });
    try {
      const session = (sessions.current[role] ??= createBrowserNodeSession());
      let started: FiberBrowserNode | undefined;
      await session.start(role === 'buyer' ? encryptedBuyerProfile : encryptedSellerProfile, async (track) => {
        started = await startRole(role, track);
      });
      if (started) {
        nodes.current[role] = started;
        const info = await started.nodeInfo();
        setAddresses((prev) => ({
          ...prev,
          [role]: scriptToAddress(info.default_funding_lock_script, 'testnet'),
        }));
        await refreshWasmChannel(role);
        setStatusMsg({ type: 'success', text: `${role.toUpperCase()} WASM node started on CKB Testnet.` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start WASM node.';
      if (msg.includes('Another tab is currently using this saved node profile')) {
        setSessionLockError(
          'Multi-Tab Conflict: Another browser tab is currently running a node session. Fiber WASM requires exclusive single-tab storage access. Please close the other tab to resume.',
        );
      }
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setBusy(false);
    }
  }

  async function wasmOpenChannel(role: Role) {
    const node = nodes.current[role];
    if (!node) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: `Opening 500 CKB channel with Bottle for ${role}...` });
    try {
      const ch = await connectAndOpenChannel(node);
      setChannels((prev) => ({ ...prev, [role]: ch }));
      await refreshWasmChannel(role);
      setStatusMsg({
        type: 'success',
        text: ch && ready(ch) ? `${role.toUpperCase()} channel is READY.` : `Channel opening submitted on-chain. Confirming...`,
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open channel.' });
    } finally {
      setBusy(false);
    }
  }

  // Move 5 CKB liquidity on real testnet
  async function wasmMoveLiquidity() {
    const node = nodes.current.seller;
    if (!node) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Sending 5 CKB keysend transfer to Bottle to balance inbound liquidity...' });
    try {
      const id = savedNodeIdentifier(localStorage, encryptedSellerProfile);
      const storageKey = `fiber-docs:encrypted-inbound:${id}`;
      const existing = sessionStorage.getItem(storageKey);
      let result: GetPaymentResult;
      if (existing && existing !== 'submitting') {
        result = await node.getPayment({ payment_hash: existing as `0x${string}` });
      } else {
        sessionStorage.setItem(storageKey, 'submitting');
        result = await node.sendPayment({ target_pubkey: bottle.pubkey, amount: '0x1dcd65000', keysend: true });
        sessionStorage.setItem(storageKey, result.payment_hash);
      }
      if (!['Success', 'Failed'].includes(result.status)) {
        result = await node.waitForPayment(result.payment_hash, { timeout: 60_000, interval: 1_000 });
      }
      if (result.status === 'Failed') {
        sessionStorage.removeItem(storageKey);
      }
      setStatusMsg({
        type: result.status === 'Success' ? 'success' : 'error',
        text: `Liquidity transfer to Bottle: ${result.status}`,
      });
      await refreshWasmChannel('seller');
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Liquidity transfer failed.' });
    } finally {
      setBusy(false);
    }
  }

  // Offline Sandbox actions
  async function simStartNodes() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: '[SANDBOX] Initializing offline simulated Fiber nodes...' });
    const n = await simulator.current.startNodes();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: '[SANDBOX] Mock nodes online and connected to mock Bottle hub.' });
  }

  async function simOpenChannels() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: '[SANDBOX] Opening mock 500 CKB channels...' });
    const n = await simulator.current.openChannels();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: '[SANDBOX] Mock channels reached CHANNEL_READY.' });
  }

  async function simMoveLiquidity() {
    setBusy(true);
    const n = await simulator.current.moveLiquidity();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: '[SANDBOX] Mock 5 CKB liquidity shifted to Bottle.' });
  }

  // Create Encrypted Offer (Seller)
  async function handleCreateOffer() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Encrypting intelligence report with AES-256-GCM and generating Fiber invoice...' });
    try {
      const serialized = serializeVaultReport(currentReport);

      if (engineMode === 'simulator') {
        const { offerJson, offer } = await simulator.current.createOffer(serialized);

        // Optional Key Wrapping in Simulator
        if (useWrappedKey) {
          const keyToWrap = offer.paymentHash;
          const wrapResult = await wrapContentKey(keyToWrap, buyerSecretHex);
          setWrappedKeyBundle(wrapResult);
        }

        setGeneratedOfferJson(offerJson);
        setStatusMsg({
          type: 'success',
          text: `[SANDBOX] Encrypted Offer created. Payment Hash: ${offer.paymentHash.slice(0, 16)}...`,
        });
      } else {
        const sellerNode = nodes.current.seller;
        const sellerChannel = channels.seller;
        if (!sellerNode || !sellerChannel) {
          throw new Error('Seller node and channel must be started and ready on CKB Testnet.');
        }
        if (!ready(sellerChannel)) {
          throw new Error(`Seller channel is in state ${sellerChannel.state.state_name}, not CHANNEL_READY.`);
        }
        const offerJson = await createOffer(sellerNode, sellerChannel, serialized);
        setGeneratedOfferJson(offerJson);
        setStatusMsg({ type: 'success', text: 'Testnet Fiber Encrypted Offer created successfully.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create offer.' });
    } finally {
      setBusy(false);
    }
  }

  function handleBridgeToBuyer() {
    setBuyerInputOffer(generatedOfferJson);
    try {
      const parsed = parseOffer(generatedOfferJson);
      setParsedOffer(parsed);
      setStatusMsg({ type: 'success', text: 'Offer bridged to Buyer terminal and validated.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Invalid offer JSON format.' });
    }
  }

  async function handleValidateOffer() {
    setBusy(true);
    try {
      const parsed = parseOffer(buyerInputOffer);
      if (engineMode === 'testnet' && nodes.current.buyer) {
        await validateOffer(nodes.current.buyer, parsed);
      }
      setParsedOffer(parsed);
      setStatusMsg({ type: 'success', text: '1 CKB Fiber Offer validated. Last-hop hint and invoice match.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Validation rejected.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestWithoutKey() {
    if (!parsedOffer) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Testing unauthorized decryption with random 256-bit key...' });
    const randomKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const result = await testDecryption(parsedOffer, randomKey);
    setTestedWithoutKey(true);
    if (!result.success) {
      setDecryptError('Decryption rejected: The operation failed because of AES-GCM authentication tag mismatch (preimage not revealed).');
      setStatusMsg({
        type: 'info',
        text: 'Decryption correctly REJECTED. AES-GCM authentication tag verification prevents unauthorized reading.',
      });
    } else {
      setDecryptError('Unexpected: random key decrypted data');
    }
    setBusy(false);
  }

  async function handlePayOffer() {
    if (!parsedOffer) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Routing 1 CKB payment through Fiber Network TLC channels...' });
    try {
      if (engineMode === 'simulator') {
        const receipt = await simulator.current.payOffer(parsedOffer);
        setPaymentReceipt({
          status: receipt.status,
          payment_hash: receipt.payment_hash,
          fee: ckb(receipt.fee),
          payment_preimage: receipt.payment_preimage,
        });
        setRevealedKey(receipt.payment_preimage);
        setAttemptedHash(receipt.payment_hash);

        // Verification step
        const proof = await verifyPreimageProof(receipt.payment_preimage, parsedOffer.paymentHash);
        setVerification(proof);

        setStatusMsg({
          type: 'success',
          text: `[SANDBOX] Payment Settled. Preimage revealed: ${receipt.payment_preimage.slice(0, 18)}...`,
        });
      } else {
        const buyerNode = nodes.current.buyer;
        if (!buyerNode) throw new Error('Buyer node not started');
        const res = await payForOffer(
          buyerNode,
          parsedOffer,
          attemptedHash,
          (hash) => setAttemptedHash(hash),
          paymentReceipt?.status === 'Failed',
        );
        setPaymentReceipt({
          status: res.status,
          payment_hash: res.payment_hash,
          fee: ckb(res.fee),
          payment_preimage: res.payment_preimage,
        });
        if (res.status === 'Success' && res.payment_preimage) {
          setRevealedKey(res.payment_preimage);
          const proof = await verifyPreimageProof(res.payment_preimage, parsedOffer.paymentHash);
          setVerification(proof);
          setStatusMsg({ type: 'success', text: 'Testnet Payment Settled. Preimage revealed.' });
        }
        await Promise.all([refreshWasmChannel('buyer'), refreshWasmChannel('seller')]);
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Payment failed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDecryptWithRevealedKey() {
    if (!parsedOffer || !revealedKey) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Decrypting payload with revealed payment preimage (AES-GCM key)...' });
    try {
      let finalKey = revealedKey;

      if (wrappedKeyBundle) {
        finalKey = await unwrapContentKey(
          wrappedKeyBundle.wrappedKey,
          wrappedKeyBundle.wrapIv,
          buyerSecretHex,
        );
      }

      const decrypted = await decryptResult(parsedOffer, finalKey);
      setDecryptedText(decrypted);
      const structured = deserializeVaultReport(decrypted);
      if (structured) {
        setDecryptedReport(structured);
      }
      setStatusMsg({ type: 'success', text: 'Intelligence Report successfully decrypted and verified.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Decryption error.' });
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    const text = decryptedReport ? `# ${decryptedReport.title}\n\n${decryptedReport.classifiedPayload}` : decryptedText;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FiberVault-Unlocked-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadReceipt() {
    if (!paymentReceipt) return;
    const receiptData = {
      protocol: 'Fiber Network CKB',
      timestamp: new Date().toISOString(),
      engine: engineMode,
      paymentHash: paymentReceipt.payment_hash,
      revealedPreimage: revealedKey,
      feeCkb: paymentReceipt.fee,
      verification,
    };
    const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fiber-Payment-Receipt-${paymentReceipt.payment_hash.slice(2, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Accurate readiness detection
  const isBuyerReady =
    engineMode === 'simulator'
      ? simNodes.buyer.channelReady
      : Boolean(channels.buyer && ready(channels.buyer) && BigInt(channels.buyer.local_balance) >= 100_000_000n);

  const isSellerReady =
    engineMode === 'simulator'
      ? simNodes.seller.channelReady
      : Boolean(channels.seller && ready(channels.seller) && BigInt(channels.seller.remote_balance) >= 100_000_000n);

  const isBuyerNodeOnline = engineMode === 'simulator' ? simNodes.buyer.connected : Boolean(addresses.buyer);
  const isSellerNodeOnline = engineMode === 'simulator' ? simNodes.seller.connected : Boolean(addresses.seller);
  const buyerNodeStatus =
    engineMode === 'simulator'
      ? simNodes.buyer.channelReady
        ? 'CHANNEL_READY'
        : isBuyerNodeOnline
          ? 'NODE_ONLINE'
          : 'OFFLINE'
      : channels.buyer?.state.state_name ?? (isBuyerNodeOnline ? 'NODE_ONLINE' : 'OFFLINE');
  const sellerNodeStatus =
    engineMode === 'simulator'
      ? simNodes.seller.channelReady
        ? 'CHANNEL_READY'
        : isSellerNodeOnline
          ? 'NODE_ONLINE'
          : 'OFFLINE'
      : channels.seller?.state.state_name ?? (isSellerNodeOnline ? 'NODE_ONLINE' : 'OFFLINE');

  const isRouteReady = isBuyerReady && isSellerReady;

  return (
    <main>
      {/* Precision Technical Masthead */}
      <header className="masthead">
        <div className="brand-group">
          <div className="brand-mark">
            <span className={`status-dot ${engineMode === 'simulator' ? 'sandbox' : ''}`} />
            <span className="brand-name">FIBERVAULT</span>
          </div>
          <span className="protocol-badge">
            CKB TESTNET <strong>FIBER v0.10.1</strong>
          </span>
        </div>

        {/* Segmented Engine Switcher */}
        <div className="engine-segmented">
          <button
            className={`engine-segment-btn ${engineMode === 'testnet' ? 'active' : ''}`}
            onClick={() => changeEngineMode('testnet')}
          >
            [Testnet] Live WASM
          </button>
          <button
            className={`engine-segment-btn ${engineMode === 'simulator' ? 'active' : ''}`}
            onClick={() => changeEngineMode('simulator')}
          >
            [Sandbox] Offline Simulator
          </button>
        </div>
      </header>

      <section className="intro-panel" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="intro-eyebrow">TRUSTLESS DIGITAL DELIVERY / CKB FIBER</p>
          <h1 className="intro-title" id="page-title">
            The key is <span>the payment.</span>
          </h1>
          <p className="intro-description">
            FiberVault encrypts digital content before it is shared. The buyer pays through Fiber Network;
            settlement reveals the key and unlocks the original document.
          </p>
        </div>
        <div className="intro-specs" aria-label="Protocol specifications">
          <div className="intro-spec">
            <span className="intro-spec-label">ACCESS PRICE</span>
            <strong>1 <span>CKB</span></strong>
            <span className="intro-spec-note">Fixed invoice amount</span>
          </div>
          <div className="intro-spec">
            <span className="intro-spec-label">CONTENT LOCK</span>
            <strong>AES-256</strong>
            <span className="intro-spec-note">Authenticated encryption</span>
          </div>
        </div>
      </section>

      {/* Offline Sandbox Prominent Telemetry Banner */}
      {engineMode === 'simulator' && (
        <div className="system-banner info">
          <span className="banner-code">SANDBOX MODE</span>
          <span>
            Offline simulated channels and mock routing active for UI testing. Channel balances and delays are synthetic.
            Switch to Live WASM for real CKB Testnet transactions.
          </span>
        </div>
      )}

      {/* Multi-Tab Conflict Alert */}
      {sessionLockError && (
        <div className="system-banner error">
          <span className="banner-code">SESSION LOCK CONFLICT</span>
          <span>{sessionLockError}</span>
        </div>
      )}

      {/* Status Alert Bar */}
      <div className={`system-banner ${statusMsg.type}`}>
        <span className="banner-code">{statusMsg.type.toUpperCase()}</span>
        <span>{statusMsg.text}</span>
      </div>

      {/* Stepper Pipeline */}
      <nav className="pipeline-rail">
        <div className={`pipeline-node ${isRouteReady ? 'done' : 'active'}`}>
          <div className="pipeline-number">{isRouteReady ? 'OK' : '1'}</div>
          <span className="pipeline-label">Channel Setup</span>
        </div>
        <div className={`pipeline-node ${generatedOfferJson ? 'done' : isRouteReady ? 'active' : ''}`}>
          <div className="pipeline-number">{generatedOfferJson ? 'OK' : '2'}</div>
          <span className="pipeline-label">Encrypt Offer</span>
        </div>
        <div className={`pipeline-node ${testedWithoutKey ? 'done' : generatedOfferJson ? 'active' : ''}`}>
          <div className="pipeline-number">{testedWithoutKey ? 'OK' : '3'}</div>
          <span className="pipeline-label">Verify Paywall</span>
        </div>
        <div className={`pipeline-node ${paymentReceipt?.status === 'Success' ? 'done' : testedWithoutKey ? 'active' : ''}`}>
          <div className="pipeline-number">{paymentReceipt?.status === 'Success' ? 'OK' : '4'}</div>
          <span className="pipeline-label">Pay 1 CKB</span>
        </div>
        <div className={`pipeline-node ${decryptedText ? 'done' : paymentReceipt?.status === 'Success' ? 'active' : ''}`}>
          <div className="pipeline-number">{decryptedText ? 'OK' : '5'}</div>
          <span className="pipeline-label">Unlock & Decrypt</span>
        </div>
      </nav>

      {/* Diagnostic Drawer for Testnet Route Readiness */}
      {engineMode === 'testnet' && (!isBuyerReady || !isSellerReady) && (
        <div className="system-banner warning">
          <span className="banner-code">DIAGNOSTICS</span>
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>Route Readiness Notice:</strong>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {!isBuyerNodeOnline && <li>Buyer A node is offline. Start the WASM node to continue.</li>}
              {isBuyerNodeOnline && !channels.buyer && <li>Buyer A node is online; open a channel to Bottle.</li>}
              {channels.buyer && !ready(channels.buyer) && (
                <li>Buyer A channel state is: <code>{channels.buyer.state.state_name}</code> (requires CHANNEL_READY).</li>
              )}
              {channels.buyer && ready(channels.buyer) && BigInt(channels.buyer.local_balance) < 100_000_000n && (
                <li>Buyer A local balance is {ckb(channels.buyer.local_balance)} CKB (needs &gt;= 1 CKB to pay).</li>
              )}
              {!isSellerNodeOnline && <li>Seller C node is offline. Start the WASM node to continue.</li>}
              {isSellerNodeOnline && !channels.seller && <li>Seller C node is online; open a channel to Bottle.</li>}
              {channels.seller && !ready(channels.seller) && (
                <li>Seller C channel state is: <code>{channels.seller.state.state_name}</code> (requires CHANNEL_READY).</li>
              )}
              {channels.seller && ready(channels.seller) && BigInt(channels.seller.remote_balance) < 100_000_000n && (
                <li>Bottle has {ckb(channels.seller.remote_balance)} CKB remote balance on Seller channel. Use keysend transfer to rebalance.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Topology Bus */}
      <section className="topology-bus">
        <p className="section-eyebrow">
          Multi-Hop Payment Routing Topology {engineMode === 'simulator' && '(Synthetic Sandbox Data)'}
        </p>

        <div className="bus-grid">
          {/* Buyer A */}
          <div className={`bus-node-card ${isBuyerReady ? 'ready' : ''}`}>
            <div className="bus-node-header">
              <span className="bus-node-title">Buyer A Node</span>
              <span className={`bus-status-tag ${isBuyerReady ? 'ready' : isBuyerNodeOnline ? 'online' : ''}`}>
                {buyerNodeStatus}
              </span>
            </div>

            {engineMode === 'simulator' ? (
              <>
                <p className="bus-metrics" style={{ margin: 0 }}>
                  Local: <strong>{simNodes.buyer.localBalanceCkb} CKB</strong> | Remote: <strong>{simNodes.buyer.remoteBalanceCkb} CKB</strong>
                </p>
                {!simNodes.buyer.channelReady && (
                  <div className="action-row">
                    {!simNodes.buyer.connected && (
                      <button className="btn btn-secondary" disabled={busy} onClick={simStartNodes}>
                        Start Node
                      </button>
                    )}
                    {simNodes.buyer.connected && (
                      <button className="btn btn-primary" disabled={busy} onClick={simOpenChannels}>
                        Open 500 CKB Channel
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {addresses.buyer ? (
                  <>
                    <div className="bus-address-row">
                      <code className="bus-address">{addresses.buyer}</code>
                      <button
                        type="button"
                        className="copy-address"
                        aria-label="Copy Buyer A CKB testnet address"
                        onClick={() => copyTestnetAddress('buyer')}
                      >
                        Copy Address
                      </button>
                    </div>
                    <a href="https://faucet.nervos.org" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--signal-accent)', textDecoration: 'none' }}>
                      Request Testnet CKB
                    </a>
                    {connected.buyer !== undefined && (
                      <p className="bus-peer-state">
                        Bottle peer: <strong>{connected.buyer ? 'CONNECTED' : 'NOT CONNECTED'}</strong>
                      </p>
                    )}
                    {channels.buyer && (
                      <p className="bus-metrics" style={{ margin: 0 }}>
                        Local: <strong>{ckb(channels.buyer.local_balance)} CKB</strong> | Bottle: <strong>{ckb(channels.buyer.remote_balance)} CKB</strong>
                      </p>
                    )}
                    <div className="action-row">
                      <button className="btn btn-secondary" disabled={busy} onClick={() => wasmOpenChannel('buyer')}>
                        {channels.buyer ? 'Reconnect Channel' : `Open ${channelFundingCkb} CKB Channel`}
                      </button>
                      <button className="btn btn-secondary" disabled={busy} onClick={() => refreshWasmChannel('buyer')}>
                        Refresh Status
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="btn btn-secondary" disabled={busy || !loaded} onClick={() => wasmStartNode('buyer')}>
                    Start WASM Node
                  </button>
                )}
              </>
            )}
          </div>

          {/* Hop Connector 1 */}
          <div className="bus-hop-connector">
            <span>TLC Hop 1</span>
            <div className="bus-hop-line" />
          </div>

          {/* Bottle Routing Hub */}
          <div className="bus-node-card ready">
            <div className="bus-node-header">
              <span className="bus-node-title">Bottle B Router</span>
              <span className="bus-status-tag ready">INTERMEDIARY HUB</span>
            </div>
            <p className="bus-metrics" style={{ margin: 0 }}>
              Pubkey: <code>0x02b6d4e...be71</code>
            </p>
            <span style={{ fontSize: 11, color: 'var(--signal-accent)' }}>
              Trampoline Multi-Hop Active
            </span>
          </div>

          {/* Hop Connector 2 */}
          <div className="bus-hop-connector">
            <span>TLC Hop 2</span>
            <div className="bus-hop-line" />
          </div>

          {/* Seller C */}
          <div className={`bus-node-card ${isSellerReady ? 'ready' : ''}`}>
            <div className="bus-node-header">
              <span className="bus-node-title">Seller C Node</span>
              <span className={`bus-status-tag ${isSellerReady ? 'ready' : isSellerNodeOnline ? 'online' : ''}`}>
                {sellerNodeStatus}
              </span>
            </div>

            {engineMode === 'simulator' ? (
              <>
                <p className="bus-metrics" style={{ margin: 0 }}>
                  Local: <strong>{simNodes.seller.localBalanceCkb} CKB</strong> | Remote: <strong>{simNodes.seller.remoteBalanceCkb} CKB</strong>
                </p>
                {simNodes.seller.channelReady && (
                  <button className="btn btn-secondary" disabled={busy} onClick={simMoveLiquidity} style={{ padding: '6px 10px', fontSize: 11 }}>
                    Rebalance 5 CKB to Bottle
                  </button>
                )}
              </>
            ) : (
              <>
                {addresses.seller ? (
                  <>
                    <div className="bus-address-row">
                      <code className="bus-address">{addresses.seller}</code>
                      <button
                        type="button"
                        className="copy-address"
                        aria-label="Copy Seller C CKB testnet address"
                        onClick={() => copyTestnetAddress('seller')}
                      >
                        Copy Address
                      </button>
                    </div>
                    <a href="https://faucet.nervos.org" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--signal-accent)', textDecoration: 'none' }}>
                      Request Testnet CKB
                    </a>
                    {connected.seller !== undefined && (
                      <p className="bus-peer-state">
                        Bottle peer: <strong>{connected.seller ? 'CONNECTED' : 'NOT CONNECTED'}</strong>
                      </p>
                    )}
                    {channels.seller && (
                      <p className="bus-metrics" style={{ margin: 0 }}>
                        Local: <strong>{ckb(channels.seller.local_balance)} CKB</strong> | Bottle: <strong>{ckb(channels.seller.remote_balance)} CKB</strong>
                      </p>
                    )}
                    <div className="action-row">
                      <button className="btn btn-secondary" disabled={busy} onClick={() => wasmOpenChannel('seller')}>
                        {channels.seller ? 'Reconnect Channel' : `Open ${channelFundingCkb} CKB Channel`}
                      </button>
                      <button className="btn btn-secondary" disabled={busy} onClick={() => refreshWasmChannel('seller')}>
                        Refresh Status
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy || !channels.seller || !ready(channels.seller) || BigInt(channels.seller.local_balance) < 500_000_000n}
                        onClick={wasmMoveLiquidity}
                      >
                        Send 5 CKB keysend
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="btn btn-secondary" disabled={busy || !loaded} onClick={() => wasmStartNode('seller')}>
                    Start WASM Node
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main Two-Pane Editorial Workspace */}
      <div className="workspace-columns">
        {/* Pane 1: Seller Studio */}
        <section className="terminal-pane">
          <div className="pane-header">
            <h2 className="pane-title">Seller Studio</h2>
            <span className="classification-tag">{currentReport.classification}</span>
          </div>

          {/* Preset Selector Chips */}
          <div className="form-unit">
            <span className="field-label">Document Preset</span>
            <div className="preset-strip">
              {VAULT_PRESETS.map((p, idx) => (
                <button
                  key={p.id}
                  className={`preset-chip ${activePresetIndex === idx ? 'active' : ''}`}
                  onClick={() => selectPreset(idx)}
                >
                  {p.category === 'research-brief' ? 'Energy Research Brief' : p.category === 'macro-analysis' ? 'Macro Velocity' : 'Design Tokens'}
                </button>
              ))}
              <button
                className={`preset-chip ${activePresetIndex === VAULT_PRESETS.length ? 'active' : ''}`}
                onClick={() => selectPreset(VAULT_PRESETS.length)}
              >
                Custom Content
              </button>
            </div>
          </div>

          {/* Optional Key Wrapping Option */}
          <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-high)' }}>
              <input
                type="checkbox"
                checked={useWrappedKey}
                onChange={(e) => setUseWrappedKey(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <strong>Optional: Wrap Content Key to Buyer Secret (Intermediary Immunity)</strong>
            </label>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-low)' }}>
              Encrypts the AES key to the buyer secret so routing nodes (Bottle) learning the preimage cannot unwrap content.
            </p>
          </div>

          <div className="form-unit">
            <span className="field-label">Document Title</span>
            <input
              type="text"
              value={currentReport.title}
              disabled={activePresetIndex < VAULT_PRESETS.length}
              onChange={(e) => {
                setCustomTitle(e.target.value);
                setCurrentReport((prev) => ({ ...prev, title: e.target.value }));
              }}
            />
          </div>

          <div className="form-unit">
            <span className="field-label">Executive Teaser (Public Free Preview)</span>
            <textarea
              rows={3}
              value={currentReport.previewTeaser}
              disabled={activePresetIndex < VAULT_PRESETS.length}
              onChange={(e) => {
                setCustomTeaser(e.target.value);
                setCurrentReport((prev) => ({ ...prev, previewTeaser: e.target.value }));
              }}
            />
          </div>

          <div className="form-unit">
            <span className="field-label">Classified Payload (AES-256-GCM Locked Paywall)</span>
            <textarea
              rows={5}
              value={currentReport.classifiedPayload}
              disabled={activePresetIndex < VAULT_PRESETS.length}
              onChange={(e) => {
                setCustomClassified(e.target.value);
                setCurrentReport((prev) => ({ ...prev, classifiedPayload: e.target.value }));
              }}
            />
          </div>

          <div className="action-row">
            <button
              className="btn btn-primary"
              disabled={busy || !isRouteReady || Boolean(generatedOfferJson)}
              onClick={handleCreateOffer}
            >
              Encrypt & Mint 1 CKB Invoice
            </button>
            {generatedOfferJson && (
              <button className="btn btn-secondary" onClick={handleBridgeToBuyer}>
                Bridge to Buyer Terminal
              </button>
            )}
          </div>

          {generatedOfferJson && (
            <div className="form-unit">
              <span className="field-label">Generated Encrypted Offer Payload</span>
              <textarea rows={4} readOnly value={generatedOfferJson} />
              <button
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => {
                  navigator.clipboard.writeText(generatedOfferJson);
                  setStatusMsg({ type: 'info', text: 'Encrypted offer JSON copied to clipboard.' });
                }}
              >
                Copy Offer JSON
              </button>
            </div>
          )}
        </section>

        {/* Pane 2: Buyer Terminal */}
        <section className="terminal-pane">
          <div className="pane-header">
            <h2 className="pane-title">Buyer Terminal</h2>
            <span className="classification-tag">ATOMIC PAYWALL</span>
          </div>

          <div className="form-unit">
            <span className="field-label">Offer Payload Input</span>
            <textarea
              rows={3}
              placeholder="Paste encrypted offer JSON here or use 'Bridge to Buyer Terminal' from Seller Studio"
              value={buyerInputOffer}
              onChange={(e) => {
                setBuyerInputOffer(e.target.value);
                setParsedOffer(null);
              }}
            />
          </div>

          {!parsedOffer ? (
            <button
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              disabled={busy || !buyerInputOffer.trim()}
              onClick={handleValidateOffer}
            >
              Validate Offer & Invoice
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Unredacted Public Teaser */}
              <div style={{ background: 'var(--bg-elevated)', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{currentReport.title}</span>
                  <span className="classification-tag">{currentReport.priceCkb} CKB</span>
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: 11, color: 'var(--text-low)' }}>
                  Author: {currentReport.author} | Classification: {currentReport.severityOrRating}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-high)', whiteSpace: 'pre-wrap' }}>
                  {currentReport.previewTeaser}
                </p>
              </div>

              {/* Classified Redacted Paywall Box */}
              {!decryptedText && (
                <div className="classified-redaction-box">
                  <div className="redaction-header">
                    <span>CLASSIFIED CONTENT PAYWALL</span>
                    <span className="redaction-lock-stamp">LOCKED - AES-256-GCM</span>
                  </div>
                  <div className="classified-bars">
                    <div className="classified-solid-bar" style={{ width: '95%' }} />
                    <div className="classified-solid-bar" style={{ width: '80%' }} />
                    <div className="classified-solid-bar" style={{ width: '88%' }} />
                    <div className="classified-solid-bar" style={{ width: '65%' }} />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="action-row">
                {!testedWithoutKey && (
                  <button className="btn btn-secondary" disabled={busy} onClick={handleTestWithoutKey}>
                    Challenge: Decrypt Without Key
                  </button>
                )}

                {testedWithoutKey && !paymentReceipt && (
                  <button className="btn btn-primary" disabled={busy || !isRouteReady} onClick={handlePayOffer}>
                    Pay 1 CKB with Fiber Network
                  </button>
                )}

                {paymentReceipt?.status === 'Success' && !decryptedText && (
                  <button className="btn btn-primary" disabled={busy || !revealedKey} onClick={handleDecryptWithRevealedKey}>
                    Decrypt with Revealed Preimage Key
                  </button>
                )}
              </div>

              {/* Decryption Rejected Warning */}
              {decryptError && !paymentReceipt && (
                <div className="system-banner error">
                  <span className="banner-code">REJECTED</span>
                  <span>{decryptError}</span>
                </div>
              )}

              {/* Settled Payment Receipt */}
              {paymentReceipt?.status === 'Success' && (
                <div className="settlement-card">
                  <div className="settlement-title-row">
                    <span className="settlement-title">Payment Settled</span>
                    <span className="settlement-meta">Amount: 1 CKB | Fee: {paymentReceipt.fee} CKB</span>
                  </div>
                  <div className="settlement-data-row">
                    Payment Hash: <code>{paymentReceipt.payment_hash}</code>
                  </div>
                  <div className="settlement-data-row">
                    Revealed Preimage (AES Key): <code>{revealedKey}</code>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Unlocked Decrypted View */}
      {decryptedText && (
        <section className="decrypted-showcase">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 className="decrypted-title">Document Decrypted and Authenticated</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-medium)' }}>
                AES-256-GCM authentication tag verified using Fiber TLC revealed settlement preimage
              </p>
            </div>
            <div className="action-row">
              <button className="btn btn-secondary" onClick={downloadReport}>
                Download Report (.md)
              </button>
              <button className="btn btn-secondary" onClick={downloadReceipt}>
                Download Receipt (.json)
              </button>
              <button className="btn btn-danger" onClick={resetOfferFlow}>
                Start Another Offer
              </button>
            </div>
          </div>

          <div className="decrypted-body">
            {decryptedReport ? (
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--signal-accent)' }}>
                  {decryptedReport.title}
                </h4>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {decryptedReport.classifiedPayload}
                </div>
                {decryptedReport.attachmentFileName && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--signal-accent)', fontFamily: 'var(--font-mono)' }}>
                      ATTACHMENT: {decryptedReport.attachmentFileName}
                    </span>
                    <pre style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-high)' }}>
                      {decryptedReport.attachmentData}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div>{decryptedText}</div>
            )}
          </div>
        </section>
      )}

      {/* Cryptographic Verification Ledger */}
      {parsedOffer && (
        <section className="ledger-card">
          <p className="section-eyebrow">Cryptographic Invariant & Ledger Verification</p>
          <div className="ledger-grid">
            <div className="ledger-entry">
              <span className="ledger-key">Cipher Specification</span>
              <span className="ledger-value">AES-256-GCM (Authenticated Encryption)</span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-key">Initialization Vector (96-bit)</span>
              <span className="ledger-value">{parsedOffer.iv}</span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-key">Fiber Invoice Payment Hash</span>
              <span className="ledger-value">{parsedOffer.paymentHash}</span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-key">Settled TLC Preimage (AES Key)</span>
              <span className="ledger-value">{revealedKey || '0x... [LOCKED UNTIL PAYMENT SETTLEMENT]'}</span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-key">Mathematical Proof Check</span>
              <span className={`ledger-value ${verification?.valid ? 'confirmed' : ''}`}>
                {verification?.valid ? (
                  'SHA-256(Preimage) === PaymentHash [VERIFIED]'
                ) : (
                  'Pending settlement verification...'
                )}
              </span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-key">Last-Hop Channel Outpoint</span>
              <span className="ledger-value">{parsedOffer.lastHop.channel_outpoint.slice(0, 24)}...</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
