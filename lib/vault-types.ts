export type IntelligenceCategory = 'research-brief' | 'macro-analysis' | 'design-tokens' | 'custom';

export type VaultIntelligenceReport = {
  id: string;
  title: string;
  category: IntelligenceCategory;
  classification: 'TOP SECRET' | 'CONFIDENTIAL' | 'RESTRICTED' | 'UNCLASSIFIED';
  severityOrRating: string;
  author: string;
  timestamp: string;
  priceCkb: string;
  previewTeaser: string;
  classifiedPayload: string;
  attachmentFileName?: string;
  attachmentData?: string;
};

export type DecryptionVerification = {
  valid: boolean;
  sha256Proof: boolean;
  preimageMatchesHash: boolean;
  computedPaymentHash?: string;
  expectedPaymentHash?: string;
  wrappedKeyVerified?: boolean;
  error?: string;
};
