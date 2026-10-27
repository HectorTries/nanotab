// @nanotab/x402-verify — pure (dependency-free) x402 payment verification.
// ZERO imports: importable from plain `node` (type stripping) in unit tests
// and bundled into any Worker. Env-agnostic: every value is an explicit arg.
// Extracted verbatim from workers/gateway/src/index.ts (no behavior change).
// Covers: structural X-Payment proof checks, atomic fee-split enforcement,
// fee math. USDC on Base mainnet only. See onchain.ts for viem-dependent code.

// Managed-gateway NanoTab fee (2% of every paid call) goes here;
// hardcoded so self-hosted clones pay Hector. NOT overridable to zero —
// a FEE_WALLET override may point fees elsewhere (e.g. a dedicated wallet
// Hector controls) but NEVER falls through to MERCHANT_WALLET.
export const NANOTAB_PROTOCOL_WALLET = '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b';
export const PROTOCOL_FEE_BPS = 200; // 2% managed-gateway fee, non-optional (self-host middleware: 10 = 0.1%)

export const USDC_BASE_MAINNET = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';
export const NANOTAB_NETWORK = 'base';
export const USDC_DECIMALS = 6;
export const NANOTAB_NETWORK_CAIP2 = 'eip155:8453'; // Base mainnet (x402 v2 CAIP-2)

export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface PaymentProof {
  amount: string; // USD cents, e.g. "2"
  to: string;
  asset: string;
  network?: string;
  signature: string;
  from?: string;
  txHash?: string; // optional: payer's on-chain transfer hash for confirmation
  // Atomic fee-split legs (REQUIRED on every paid call — protocol fee is non-optional).
  // Amounts in USDC base units. feeTo must equal FEE_WALLET, feeAmount +
  // merchantAmount must equal gross, feeAmount must equal feeBps math.
  split?: { feeTo: string; feeAmount: string; merchantAmount: string };
}

export function paymentMessage(p: { to: string; amount: string; asset: string }): string {
  return `nanotab-x402|network=base|to=${p.to}|amountCents=${p.amount}|asset=${p.asset}`;
}

/**
 * Extended canonical message committing to the atomic fee split.
 * Signed by the buyer UserOp owner; gateway rejects if the signed split
 * does not match — the fee leg cannot be stripped without invalidating
 * the payer signature.
 */
export function splitPaymentMessage(p: { to: string; amount: string; asset: string; feeTo: string; feeAmount: string; merchantAmount: string }): string {
  return `${paymentMessage(p)}|feeTo=${p.feeTo}|fee=${p.feeAmount}|net=${p.merchantAmount}`;
}

/** Fee recipient: explicit override, else the hardcoded protocol wallet.
 *  NEVER falls through to MERCHANT_WALLET — the protocol fee is mandatory. */
export function feeRecipientFor(feeWalletOverride?: string): string {
  return feeWalletOverride || NANOTAB_PROTOCOL_WALLET;
}

export function assetOk(asset: string): boolean {
  return asset.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() || asset === 'USDC';
}

/** Structural verify: well-formed, right merchant, sufficient amount, USDC-on-Base. */
export function verifyPayment(header: string, to: string, amountCents: string): PaymentProof {
  let proof: PaymentProof;
  try {
    proof = JSON.parse(atob(header));
  } catch {
    throw new Error('malformed X-Payment header');
  }
  if (!proof.amount || !proof.to || !proof.asset || !proof.signature) {
    throw new Error('malformed X-Payment proof (need amount, to, asset, signature)');
  }
  if (proof.to.toLowerCase() !== to.toLowerCase()) throw new Error('payment to wrong merchant');
  if (BigInt(proof.amount) < BigInt(amountCents)) throw new Error('payment amount too low');
  if (!assetOk(proof.asset)) throw new Error('unsupported asset (need USDC on Base)');
  if (proof.network && proof.network !== 'base') throw new Error('wrong network (need base)');
  return proof;
}

/**
 * Atomic fee-split enforcement (NanoTab 200bps managed-gateway default; self-host 10bps).
 * Fee recipient = feeWalletOverride, else NANOTAB_PROTOCOL_WALLET.
 * The X-Payment proof MUST carry `split` with:
 *   - split.feeTo == fee recipient (exact)
 *   - split.feeAmount == floor(gross * feeBps / 10_000) in USDC base units
 *   - split.merchantAmount == gross − fee
 * Missing/wrong split → throw. No exceptions, no single-transfer bypass.
 */
export function verifyFeeSplit(
  proof: PaymentProof,
  amountCents: string,
  feeBps: number = PROTOCOL_FEE_BPS,
  feeWalletOverride?: string,
): { feeUnits: bigint; netUnits: bigint; feeTo: string } {
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  const netUnits = gross - feeUnits;
  // Protocol fee is NON-OPTIONAL: every paid call carries the split.
  // No back-compat single-transfer bypass.
  const feeTo = feeRecipientFor(feeWalletOverride);
  const s = proof.split;
  if (!s?.feeTo || !s?.feeAmount || !s?.merchantAmount) {
    throw new Error(`fee split missing: UserOp must batch [transfer(merchant, ${netUnits}), transfer(${feeTo}, ${feeUnits})]`);
  }
  if (s.feeTo.toLowerCase() !== feeTo.toLowerCase()) {
    throw new Error(`fee to wrong wallet (need ${feeTo})`);
  }
  if (BigInt(s.feeAmount) !== feeUnits) {
    throw new Error(`fee amount wrong (need ${feeUnits} units @${feeBps}bps, got ${s.feeAmount})`);
  }
  if (BigInt(s.merchantAmount) !== netUnits) {
    throw new Error(`merchant net wrong (need ${netUnits} units, got ${s.merchantAmount})`);
  }
  return { feeUnits, netUnits, feeTo };
}

export function centsToUnits(cents: string): bigint {
  return BigInt(cents) * 10n ** BigInt(USDC_DECIMALS - 2);
}

export function splitFee(amountCents: string, feeBps: number): { feeUnits: bigint; netUnits: bigint } {
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  return { feeUnits, netUnits: gross - feeUnits };
}

export function topicToAddress(topic: string): string {
  return '0x' + topic.slice(-40);
}
