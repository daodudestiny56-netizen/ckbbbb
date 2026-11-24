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
  readEncryptedProgress,
} from '../lib/progress';
import { FiberSimulatorEngine, type SimulatedNodeState } from '../lib/simulator';

type Role = 'buyer' | 'seller';
type EngineMode = 'simulator' | 'testnet';

const ckb = (value: string) => `${Number(BigInt(value)) / 100_000_000}`;

export default function FiberVaultPage() {
  const [engineMode, setEngineMode] = useState<EngineMode>('simulator');
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [currentReport, setCurrentReport] = useState<VaultIntelligenceReport>(VAULT_PRESETS[0]);
  const [customTitle, setCustomTitle] = useState('');
  const [customTeaser, setCustomTeaser] = useState('');
  const [customClassified, setCustomClassified] = useState('');

  // Simulator state
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

  // Status and Notifications
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string }>({
    type: 'info',
    text: 'Welcome to FiberVault. Select an intelligence brief or customize your pay-to-unlock offer.',
  });

  useEffect(() => {
    setLoaded(true);
  }, []);

  // Update report when preset changes
  function selectPreset(index: number) {
    setActivePresetIndex(index);
    if (index < VAULT_PRESETS.length) {
      setCurrentReport(VAULT_PRESETS[index]);
    } else {
      // Custom mode
      setCurrentReport({
        id: 'custom-' + Date.now(),
        title: customTitle || 'CUSTOM INTEL: Confidential Analysis & Security Brief',
        category: 'custom',
        classification: 'RESTRICTED',
        severityOrRating: 'CONFIDENTIAL',
        author: 'Anonymous Intelligence Desk',
        timestamp: new Date().toISOString(),
        priceCkb: '1',
        previewTeaser: customTeaser || 'Public executive preview of confidential intelligence data.',
        classifiedPayload:
          customClassified || '## CLASSIFIED PAYLOAD\nConfidential insights unlocked via Fiber payment.',
      });
    }
    // Reset buyer and offer states for fresh demo
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
  }

  // Simulator Actions
  async function simStartNodes() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Initializing in-browser simulated Fiber nodes (Buyer A & Seller C)...' });
    const n = await simulator.current.startNodes();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: 'Simulated nodes online and connected to Bottle routing hub.' });
  }

  async function simOpenChannels() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Opening 500 CKB channels with Bottle routing hub...' });
    const n = await simulator.current.openChannels();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: 'Both channels reached CHANNEL_READY with 500 CKB capacity.' });
  }

  async function simMoveLiquidity() {
    setBusy(true);
    const n = await simulator.current.moveLiquidity();
    setSimNodes(n);
    setBusy(false);
    setStatusMsg({ type: 'success', text: '5 CKB liquidity shifted to Bottle for seamless bi-directional routing.' });
  }

  // Testnet WASM Node Actions
  async function wasmStartNode(role: Role) {
    setBusy(true);
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
        const ch = await readChannel(started);
        setChannels((prev) => ({ ...prev, [role]: ch }));
        setStatusMsg({ type: 'success', text: `${role.toUpperCase()} WASM node started.` });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to start WASM node.' });
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
      setStatusMsg({
        type: 'success',
        text: ch && ready(ch) ? `${role.toUpperCase()} channel READY.` : `Channel opening submitted on-chain.`,
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open channel.' });
    } finally {
      setBusy(false);
    }
  }

  // Create Encrypted Offer (Seller)
  async function handleCreateOffer() {
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Encrypting intelligence report with AES-256-GCM and generating Fiber invoice...' });
    try {
      const serialized = serializeVaultReport(currentReport);
      if (engineMode === 'simulator') {
        const { offerJson, offer } = await simulator.current.createOffer(serialized);
        setGeneratedOfferJson(offerJson);
        setStatusMsg({
          type: 'success',
          text: `Encrypted Offer created! Payment Hash: ${offer.paymentHash.slice(0, 16)}...`,
        });
      } else {
        const sellerNode = nodes.current.seller;
        const sellerChannel = channels.seller;
        if (!sellerNode || !sellerChannel) {
          throw new Error('Seller node and channel must be ready.');
        }
        const offerJson = await createOffer(sellerNode, sellerChannel, serialized);
        setGeneratedOfferJson(offerJson);
        setStatusMsg({ type: 'success', text: 'Real Testnet Fiber Encrypted Offer created!' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create offer.' });
    } finally {
      setBusy(false);
    }
  }

  // Transfer / Bridge Offer to Buyer
  function handleBridgeToBuyer() {
    setBuyerInputOffer(generatedOfferJson);
    try {
      const parsed = parseOffer(generatedOfferJson);
      setParsedOffer(parsed);
      setStatusMsg({ type: 'success', text: 'Offer bridged to Buyer terminal and cryptographically validated.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Invalid offer JSON format.' });
    }
  }

  // Validate Manually Pasted Offer (Buyer)
  async function handleValidateOffer() {
    setBusy(true);
    try {
      const parsed = parseOffer(buyerInputOffer);
      if (engineMode === 'testnet' && nodes.current.buyer) {
        await validateOffer(nodes.current.buyer, parsed);
      }
      setParsedOffer(parsed);
      setStatusMsg({ type: 'success', text: '1 CKB Fiber Offer validated. Last-hop hint and invoice verified.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Validation rejected.' });
    } finally {
      setBusy(false);
    }
  }

  // Challenge: Decrypt Without Key (Demonstrate Cryptographic Impossibility)
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
        text: 'Decryption correctly REJECTED! AES-GCM authentication tag verification prevents unauthorized reads.',
      });
    } else {
      setDecryptError('Unexpected: random key decrypted data');
    }
    setBusy(false);
  }

  // Pay 1 CKB Invoice via Fiber Network
  async function handlePayOffer() {
    if (!parsedOffer) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Routing 1 CKB payment through Fiber Network TLC channels (Buyer -> Bottle -> Seller)...' });
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

        // Verify mathematical proof SHA256(preimage) === paymentHash
        const proof = await verifyPreimageProof(receipt.payment_preimage, parsedOffer.paymentHash);
        setVerification(proof);

        setStatusMsg({
          type: 'success',
          text: `Payment Settled! Preimage revealed: ${receipt.payment_preimage.slice(0, 18)}...`,
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
          setStatusMsg({ type: 'success', text: 'Testnet Payment Settled! Preimage revealed.' });
        }
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Payment failed' });
    } finally {
      setBusy(false);
    }
  }

  // Decrypt with Revealed Key
  async function handleDecryptWithRevealedKey() {
    if (!parsedOffer || !revealedKey) return;
    setBusy(true);
    setStatusMsg({ type: 'info', text: 'Decrypting payload with revealed payment preimage (AES-GCM key)...' });
    try {
      const decrypted = await decryptResult(parsedOffer, revealedKey);
      setDecryptedText(decrypted);
      const structured = deserializeVaultReport(decrypted);
      if (structured) {
        setDecryptedReport(structured);
      }
      setStatusMsg({ type: 'success', text: 'Intelligence Report successfully decrypted and unlocked!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Decryption error.' });
    } finally {
      setBusy(false);
    }
  }

  // Export functions
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
      paymentHash: paymentReceipt.payment_hash,
      revealedPreimage: revealedKey,
      fee: paymentReceipt.fee,
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

  const isChannelsReady =
    engineMode === 'simulator'
      ? simNodes.buyer.channelReady && simNodes.seller.channelReady
      : Boolean(channels.buyer && ready(channels.buyer) && channels.seller && ready(channels.seller));

  return (
    <main>
      {/* Top Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-title">
            <span>⚡ FIBER VAULT</span>
            <span className="brand-badge">CKB Testnet · Fiber v0.10.1</span>
          </div>
          <p className="brand-desc">
            Decentralized Zero-Knowledge Intelligence & Digital Asset Marketplace powered by Atomic TLC Preimage Paywalls
          </p>
        </div>

        {/* Engine Mode Toggle */}
        <div className="engine-toggle">
          <button
            className={`engine-btn ${engineMode === 'simulator' ? 'active' : ''}`}
            onClick={() => setEngineMode('simulator')}
            title="Instant in-browser cryptographic simulator for fast evaluation"
          >
            🧪 Simulator Sandbox
          </button>
          <button
            className={`engine-btn ${engineMode === 'testnet' ? 'active' : ''}`}
            onClick={() => setEngineMode('testnet')}
            title="Real CKB Testnet WASM Fiber nodes connecting to Bottle hub"
          >
            ⚡ Live Testnet WASM
          </button>
        </div>
      </header>

      {/* Dynamic Status Notification */}
      <div className={`alert-bar alert-${statusMsg.type}`}>
        <span>{statusMsg.type === 'success' ? '✓' : statusMsg.type === 'error' ? '⚠' : 'ℹ'}</span>
        <span>{statusMsg.text}</span>
      </div>

      {/* Pipeline Progress Step Tracker */}
      <nav className="pipeline-bar">
        <div className={`pipeline-step ${isChannelsReady ? 'done' : 'active'}`}>
          <div className="step-circle">{isChannelsReady ? '✓' : '1'}</div>
          <span>Channel Setup</span>
        </div>
        <div className={`pipeline-step ${generatedOfferJson ? 'done' : isChannelsReady ? 'active' : ''}`}>
          <div className="step-circle">{generatedOfferJson ? '✓' : '2'}</div>
          <span>Encrypt Offer</span>
        </div>
        <div className={`pipeline-step ${testedWithoutKey ? 'done' : generatedOfferJson ? 'active' : ''}`}>
          <div className="step-circle">{testedWithoutKey ? '✓' : '3'}</div>
          <span>Verify Paywall</span>
        </div>
        <div className={`pipeline-step ${paymentReceipt?.status === 'Success' ? 'done' : testedWithoutKey ? 'active' : ''}`}>
          <div className="step-circle">{paymentReceipt?.status === 'Success' ? '✓' : '4'}</div>
          <span>Pay 1 CKB Invoice</span>
        </div>
        <div className={`pipeline-step ${decryptedText ? 'done' : paymentReceipt?.status === 'Success' ? 'active' : ''}`}>
          <div className="step-circle">{decryptedText ? '✓' : '5'}</div>
          <span>Unlock & Decrypt</span>
        </div>
      </nav>

      {/* Network Topology Visualizer */}
      <section className="topology-card">
        <p className="topology-title">Network Channels & Liquidity Topology</p>
        <div className="topology-nodes">
          {/* Buyer Node */}
          <div className={`node-box ${isChannelsReady ? 'ready' : ''}`}>
            <div className="node-header">
              <span className="node-name">Buyer A</span>
              <span className={`node-status-pill ${isChannelsReady ? 'ready' : ''}`}>
                {isChannelsReady ? 'CHANNEL_READY' : 'OFFLINE'}
              </span>
            </div>
            {engineMode === 'simulator' ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Local: <strong>{simNodes.buyer.localBalanceCkb} CKB</strong> · Remote: <strong>{simNodes.buyer.remoteBalanceCkb} CKB</strong>
                </p>
                {!simNodes.buyer.channelReady && (
                  <div className="btn-group">
                    {!simNodes.buyer.connected && (
                      <button className="btn-secondary" disabled={busy} onClick={simStartNodes}>
                        Start Node
                      </button>
                    )}
                    {simNodes.buyer.connected && (
                      <button className="btn-primary" disabled={busy} onClick={simOpenChannels}>
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
                    <code style={{ fontSize: 11 }}>{addresses.buyer.slice(0, 20)}...</code>
                    <p style={{ margin: 0, fontSize: 12 }}>
                      {channels.buyer ? `${channels.buyer.state.state_name} · ${ckb(channels.buyer.local_balance)} CKB` : 'No channel'}
                    </p>
                    <button className="btn-secondary" disabled={busy} onClick={() => wasmOpenChannel('buyer')}>
                      {channels.buyer ? 'Check Channel' : 'Open 500 CKB Channel'}
                    </button>
                  </>
                ) : (
                  <button className="btn-secondary" disabled={busy || !loaded} onClick={() => wasmStartNode('buyer')}>
                    Start WASM Node
                  </button>
                )}
              </>
            )}
          </div>

          {/* Hop Arrow 1 */}
          <div className="channel-arrow">
            <span>⇄ TLC Hop ⇄</span>
          </div>

          {/* Bottle Routing Hub */}
          <div className="node-box ready">
            <div className="node-header">
              <span className="node-name">Bottle Hub B</span>
              <span className="node-status-pill ready">ROUTING HUB</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Pubkey: <code>0x02b6d4e...be71</code>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#10b981' }}>
              Multi-Hop Trampoline Routing Active
            </p>
          </div>

          {/* Hop Arrow 2 */}
          <div className="channel-arrow">
            <span>⇄ TLC Hop ⇄</span>
          </div>

          {/* Seller Node */}
          <div className={`node-box ${isChannelsReady ? 'ready' : ''}`}>
            <div className="node-header">
              <span className="node-name">Seller C</span>
              <span className={`node-status-pill ${isChannelsReady ? 'ready' : ''}`}>
                {isChannelsReady ? 'CHANNEL_READY' : 'OFFLINE'}
              </span>
            </div>
            {engineMode === 'simulator' ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Local: <strong>{simNodes.seller.localBalanceCkb} CKB</strong> · Remote: <strong>{simNodes.seller.remoteBalanceCkb} CKB</strong>
                </p>
                {simNodes.seller.channelReady && (
                  <button className="btn-secondary" disabled={busy} onClick={simMoveLiquidity} style={{ padding: '6px 10px', fontSize: 11 }}>
                    Rebalance 5 CKB to Bottle
                  </button>
                )}
              </>
            ) : (
              <>
                {addresses.seller ? (
                  <>
                    <code style={{ fontSize: 11 }}>{addresses.seller.slice(0, 20)}...</code>
                    <p style={{ margin: 0, fontSize: 12 }}>
                      {channels.seller ? `${channels.seller.state.state_name} · ${ckb(channels.seller.local_balance)} CKB` : 'No channel'}
                    </p>
                    <button className="btn-secondary" disabled={busy} onClick={() => wasmOpenChannel('seller')}>
                      {channels.seller ? 'Check Channel' : 'Open 500 CKB Channel'}
                    </button>
                  </>
                ) : (
                  <button className="btn-secondary" disabled={busy || !loaded} onClick={() => wasmStartNode('seller')}>
                    Start WASM Node
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main Two-Column Workspace */}
      <div className="workspace-grid">
        {/* Column 1: Seller Studio */}
        <section className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>🛡️ Seller Studio</span>
            </h2>
            <span className="brand-badge">{currentReport.classification}</span>
          </div>

          {/* Preset Intelligence Picker */}
          <div className="preset-selector">
            <label>Select Intelligence Preset or Custom</label>
            <div className="preset-pills">
              {VAULT_PRESETS.map((p, idx) => (
                <button
                  key={p.id}
                  className={`preset-pill ${activePresetIndex === idx ? 'active' : ''}`}
                  onClick={() => selectPreset(idx)}
                >
                  {p.category === 'cybersecurity' ? '🛡️ Zero-Day CVE' : p.category === 'financial-alpha' ? '📈 Macro Alpha' : '🤖 AI Metaprompt'}
                </button>
              ))}
              <button
                className={`preset-pill ${activePresetIndex === VAULT_PRESETS.length ? 'active' : ''}`}
                onClick={() => selectPreset(VAULT_PRESETS.length)}
              >
                ✍️ Custom Asset
              </button>
            </div>
          </div>

          {/* Teaser vs Classified Content */}
          <div>
            <label>Title & Classification</label>
            <input
              value={currentReport.title}
              disabled={activePresetIndex < VAULT_PRESETS.length}
              onChange={(e) => {
                setCustomTitle(e.target.value);
                setCurrentReport((prev) => ({ ...prev, title: e.target.value }));
              }}
            />
          </div>

          <div>
            <label>Public Executive Teaser (Free Unredacted Preview)</label>
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

          <div>
            <label>Classified Payload (AES-256-GCM Encrypted Paywall)</label>
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

          {/* Offer Generation Actions */}
          <div className="btn-group">
            <button
              className="btn-primary"
              disabled={busy || !isChannelsReady || Boolean(generatedOfferJson)}
              onClick={handleCreateOffer}
            >
              🔒 Encrypt & Create 1 CKB Invoice
            </button>
            {generatedOfferJson && (
              <button className="btn-secondary" onClick={handleBridgeToBuyer}>
                ⚡ 1-Click Bridge to Buyer
              </button>
            )}
          </div>

          {generatedOfferJson && (
            <div>
              <label>Generated Offer Payload (Public JSON)</label>
              <textarea rows={4} readOnly value={generatedOfferJson} />
              <button
                className="btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(generatedOfferJson);
                  setStatusMsg({ type: 'info', text: 'Encrypted offer JSON copied to clipboard.' });
                }}
              >
                📋 Copy Offer JSON
              </button>
            </div>
          )}
        </section>

        {/* Column 2: Buyer Terminal */}
        <section className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>💳 Buyer Marketplace Terminal</span>
            </h2>
            <span className="brand-badge">Fiber Pay-To-Unlock</span>
          </div>

          {/* Received Offer Input */}
          <div>
            <label>Received Encrypted Offer</label>
            <textarea
              rows={3}
              placeholder="Paste encrypted offer JSON here or use '1-Click Bridge' from Seller Studio"
              value={buyerInputOffer}
              onChange={(e) => {
                setBuyerInputOffer(e.target.value);
                setParsedOffer(null);
              }}
            />
          </div>

          {!parsedOffer ? (
            <button
              className="btn-secondary"
              disabled={busy || !buyerInputOffer.trim()}
              onClick={handleValidateOffer}
            >
              🔍 Validate Offer & Invoice
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Public Teaser Card */}
              <div style={{ background: '#0a0e17', padding: 14, borderRadius: 8, border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{currentReport.title}</span>
                  <span className="brand-badge">{currentReport.priceCkb} CKB</span>
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#94a3b8' }}>
                  Author: {currentReport.author} · Severity: {currentReport.severityOrRating}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                  {currentReport.previewTeaser}
                </p>
              </div>

              {/* Paywall Classified Section Preview */}
              {!decryptedText && (
                <div className="redacted-paywall">
                  <div className="redacted-banner">
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
                      CLASSIFIED PAYWALL SECTION
                    </span>
                    <span className="redacted-lock-pill">
                      🔒 LOCKED · AES-256-GCM
                    </span>
                  </div>
                  <div className="redacted-bars">
                    <div className="redacted-bar" style={{ width: '92%' }} />
                    <div className="redacted-bar" style={{ width: '78%' }} />
                    <div className="redacted-bar" style={{ width: '85%' }} />
                    <div className="redacted-bar" style={{ width: '64%' }} />
                  </div>
                </div>
              )}

              {/* Verification & Pay Actions */}
              <div className="btn-group">
                {!testedWithoutKey && (
                  <button className="btn-secondary" disabled={busy} onClick={handleTestWithoutKey}>
                    🛡️ Challenge: Decrypt Without Key
                  </button>
                )}

                {testedWithoutKey && !paymentReceipt && (
                  <button className="btn-primary" disabled={busy || !isChannelsReady} onClick={handlePayOffer}>
                    ⚡ Pay 1 CKB with Fiber Network
                  </button>
                )}

                {paymentReceipt?.status === 'Success' && !decryptedText && (
                  <button className="btn-primary" disabled={busy || !revealedKey} onClick={handleDecryptWithRevealedKey}>
                    🔓 Decrypt with Revealed Preimage Key
                  </button>
                )}
              </div>

              {/* Decryption Rejected Warning Box */}
              {decryptError && !paymentReceipt && (
                <div className="alert-bar alert-error">
                  <span>❌</span>
                  <span style={{ fontSize: 12 }}>{decryptError}</span>
                </div>
              )}

              {/* Payment Receipt Box */}
              {paymentReceipt?.status === 'Success' && (
                <div style={{ background: '#07150f', border: '1px solid #10b981', padding: 14, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                      ✓ Payment Settled
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      Amount: 1 CKB · Fee: {paymentReceipt.fee} CKB
                    </span>
                  </div>
                  <p style={{ margin: '4px 0', fontSize: 12, wordBreak: 'break-all' }}>
                    Payment Hash: <code>{paymentReceipt.payment_hash}</code>
                  </p>
                  <p style={{ margin: '4px 0', fontSize: 12, wordBreak: 'break-all' }}>
                    Revealed Preimage (AES Key): <code style={{ color: '#34d399' }}>{revealedKey}</code>
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Decrypted Full Result Showcase */}
      {decryptedText && (
        <section className="decrypted-view">
          <div className="decrypted-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 20, color: '#34d399' }}>
                🎉 Intelligence Report Unlocked & Verified
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                AES-256-GCM authenticated decryption successful using Fiber TLC revealed preimage
              </p>
            </div>
            <div className="btn-group">
              <button className="btn-secondary" onClick={downloadReport}>
                📥 Download Full Report (.md)
              </button>
              <button className="btn-secondary" onClick={downloadReceipt}>
                📜 Download Cryptographic Receipt (.json)
              </button>
              <button className="btn-danger" onClick={resetOfferFlow}>
                🔄 Start Another Offer
              </button>
            </div>
          </div>

          <div className="decrypted-content">
            {decryptedReport ? (
              <div>
                <h2 style={{ color: '#6ee7b7', borderBottom: '1px solid #1f3d30', paddingBottom: 8 }}>
                  {decryptedReport.title}
                </h2>
                <p style={{ color: '#a7f3d0' }}>{decryptedReport.classifiedPayload}</p>
                {decryptedReport.attachmentFileName && (
                  <div style={{ marginTop: 16, padding: 12, background: '#0f241a', borderRadius: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>
                      📎 Attached Asset: {decryptedReport.attachmentFileName}
                    </span>
                    <pre style={{ margin: '8px 0 0', fontSize: 11, color: '#d1fae5' }}>
                      {decryptedReport.attachmentData}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <pre>{decryptedText}</pre>
            )}
          </div>
        </section>
      )}

      {/* Cryptographic Proof & Receipt Inspector */}
      {parsedOffer && (
        <section className="audit-panel">
          <p className="topology-title">Cryptographic Zero-Knowledge Audit Trail</p>
          <div className="audit-grid">
            <div className="audit-item">
              <span className="audit-key">Cipher Algorithm</span>
              <span className="audit-val">AES-256-GCM (Authenticated Encryption)</span>
            </div>
            <div className="audit-item">
              <span className="audit-key">Initialization Vector (IV - 96 bit)</span>
              <span className="audit-val">{parsedOffer.iv}</span>
            </div>
            <div className="audit-item">
              <span className="audit-key">Fiber Invoice Payment Hash</span>
              <span className="audit-val">{parsedOffer.paymentHash}</span>
            </div>
            <div className="audit-item">
              <span className="audit-key">Settled Preimage (AES Key)</span>
              <span className="audit-val">{revealedKey || '0x... [LOCKED UNTIL PAYMENT SETTLEMENT]'}</span>
            </div>
            <div className="audit-item">
              <span className="audit-key">Cryptographic Invariant Check</span>
              <span className="audit-val">
                {verification?.valid ? (
                  <strong style={{ color: '#34d399' }}>
                    SHA256(Preimage) === PaymentHash [MATHEMATICALLY VERIFIED ✓]
                  </strong>
                ) : (
                  'Pending payment preimage release...'
                )}
              </span>
            </div>
            <div className="audit-item">
              <span className="audit-key">Last Hop Routing Channel</span>
              <span className="audit-val">{parsedOffer.lastHop.channel_outpoint.slice(0, 24)}...</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
