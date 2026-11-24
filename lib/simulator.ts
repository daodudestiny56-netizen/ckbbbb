import { encryptResult, sha256Hex, toHex, type EncryptedPayload } from './crypto.ts';
import type { EncryptedOffer } from './offer.ts';

const BOTTLE_PUBKEY = '0x02b6d4e3ab86a2ca2fad6fae0ecb2e1e559e0b911939872a90abdda6d20302be71' as const;

export type SimulatedNodeState = {
  address: string;
  pubkey: string;
  connected: boolean;
  channelReady: boolean;
  localBalanceCkb: string;
  remoteBalanceCkb: string;
  channelOutpoint: string;
};

export type SimulatedPaymentReceipt = {
  status: 'Success' | 'Failed';
  payment_hash: `0x${string}`;
  payment_preimage: string;
  fee: `0x${string}`; // e.g. 0.001 CKB in shannons
  created_at: string;
};

export class FiberSimulatorEngine {
  private buyer: SimulatedNodeState = {
    address: 'ckt1qzda0cr08mqlslwt8neg2302qlzgcrvsavu0982asq',
    pubkey: '0x03a111111111111111111111111111111111111111111111111111111111111111',
    connected: false,
    channelReady: false,
    localBalanceCkb: '500.0',
    remoteBalanceCkb: '0.0',
    channelOutpoint: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00000000',
  };

  private seller: SimulatedNodeState = {
    address: 'ckt1qzda0cr08mqlslwt8neg2302qlzgcrvsavu0982ase',
    pubkey: '0x03cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    connected: false,
    channelReady: false,
    localBalanceCkb: '495.0',
    remoteBalanceCkb: '5.0',
    channelOutpoint: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789000000001',
  };

  private activePreimages = new Map<string, string>(); // paymentHash -> preimage

  getNodes() {
    return { buyer: { ...this.buyer }, seller: { ...this.seller } };
  }

  async startNodes() {
    await new Promise((r) => setTimeout(r, 400));
    this.buyer.connected = true;
    this.seller.connected = true;
    return this.getNodes();
  }

  async openChannels() {
    await new Promise((r) => setTimeout(r, 600));
    this.buyer.channelReady = true;
    this.seller.channelReady = true;
    return this.getNodes();
  }

  async moveLiquidity() {
    await new Promise((r) => setTimeout(r, 300));
    this.seller.localBalanceCkb = '495.0';
    this.seller.remoteBalanceCkb = '5.0';
    return this.getNodes();
  }

  async createOffer(plaintext: string): Promise<{ offerJson: string; offer: EncryptedOffer }> {
    const encrypted = await encryptResult(plaintext);
    const paymentHash = await sha256Hex(encrypted.key);
    this.activePreimages.set(paymentHash.toLowerCase(), encrypted.key);

    const invoiceStr = `fibt1simulator_1ckb_${paymentHash.slice(2, 18)}`;

    const offer: EncryptedOffer = {
      version: 2,
      cipher: 'AES-256-GCM',
      ciphertext: encrypted.payload.ciphertext,
      iv: encrypted.payload.iv,
      invoice: invoiceStr,
      paymentHash,
      lastHop: {
        pubkey: BOTTLE_PUBKEY,
        channel_outpoint: '0x111111111111111111111111111111111111111111111111111111111111111100000000',
        fee_rate: '0x1',
        tlc_expiry_delta: '0x10',
      },
    };

    return { offerJson: JSON.stringify(offer, null, 2), offer };
  }

  async payOffer(offer: EncryptedOffer): Promise<SimulatedPaymentReceipt> {
    await new Promise((r) => setTimeout(r, 700)); // routing simulation
    const hash = offer.paymentHash.toLowerCase();
    const preimage = this.activePreimages.get(hash);

    if (!preimage) {
      throw new Error('Routing failure: Preimage not found for payment hash');
    }

    // Deduct 1 CKB from buyer local, add to bottle remote
    const buyerBal = parseFloat(this.buyer.localBalanceCkb) - 1.001;
    this.buyer.localBalanceCkb = buyerBal.toFixed(3);
    this.buyer.remoteBalanceCkb = (parseFloat(this.buyer.remoteBalanceCkb) + 1.0).toFixed(3);

    // Credit seller local
    this.seller.localBalanceCkb = (parseFloat(this.seller.localBalanceCkb) + 1.0).toFixed(3);
    this.seller.remoteBalanceCkb = (parseFloat(this.seller.remoteBalanceCkb) - 1.0).toFixed(3);

    return {
      status: 'Success',
      payment_hash: offer.paymentHash,
      payment_preimage: preimage,
      fee: '0x186a0', // 0.001 CKB (100,000 shannons)
      created_at: new Date().toISOString(),
    };
  }
}
