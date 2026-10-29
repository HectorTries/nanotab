// @nanotab/x402-verify — on-chain (viem-dependent) buyer-tx confirmation.
// Env-agnostic: every value is an explicit arg. Extracted verbatim from
// workers/gateway/src/index.ts (no behavior change). USDC on Base mainnet.

import { createPublicClient, http, type Hex } from 'viem';
import { base } from 'viem/chains';
import {
  ERC20_TRANSFER_TOPIC,
  PROTOCOL_FEE_BPS,
  USDC_BASE_MAINNET,
  centsToUnits,
  topicToAddress,
} from './pure.ts';

export interface VerifyBuyerTxOpts {
  rpcUrl?: string; // default https://mainnet.base.org
  merchantWallet: string; // gateway env var, or per-listing wallet from KV
  feeTo: string; // feeRecipientFor(...) result
  feeBps?: number; // default PROTOCOL_FEE_BPS (200)
  txHash: string;
  amountCents: string;
}

/**
 * Buyer-UserOp confirmation: fetch the tx receipt and verify it CONTAINS
 * the atomic fee-split legs from the USDC contract —
 *   transfer(payer → merchantWallet, netUnits)
 *   transfer(payer → feeTo, feeUnits)
 * with status=success. Extra USDC legs (e.g. Circle-paymaster gas
 * pull/refund: 4-leg receipts) are IGNORED — contains-check, not
 * exact-count. Returns the payer address.
 */
export async function verifyBuyerTx(opts: VerifyBuyerTxOpts): Promise<{ payer: string }> {
  const {
    rpcUrl = 'https://mainnet.base.org',
    merchantWallet,
    feeTo,
    feeBps = PROTOCOL_FEE_BPS,
    txHash,
    amountCents,
  } = opts;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error('invalid txHash format');
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  const netUnits = gross - feeUnits;
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) throw new Error('tx not found or not yet mined (retry after confirmation)');
  if (receipt.status !== 'success') throw new Error('tx failed on-chain');
  const legs = receipt.logs.filter(
    (l) =>
      l.address.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() &&
      l.topics[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC,
  );
  const merchantLc = merchantWallet.toLowerCase();
  const feeLc = feeTo.toLowerCase();
  // Mandatory split: legs must CONTAIN [merchant-net, fee→protocol wallet]
  // from the same payer. Extra USDC legs (paymaster gas pull/refund etc.)
  // are ignored. No single-transfer bypass.
  if (legs.length < 2) {
    throw new Error(`tx must contain at least 2 USDC transfers (got ${legs.length})`);
  }
  const seen = new Map<string, Map<string, bigint>>(); // to -> (from -> total)
  for (const l of legs) {
    const from = topicToAddress(l.topics[1] as Hex).toLowerCase();
    const to = topicToAddress(l.topics[2] as Hex).toLowerCase();
    const value = BigInt(l.data as Hex);
    let m = seen.get(to);
    if (!m) { m = new Map(); seen.set(to, m); }
    m.set(from, (m.get(from) ?? 0n) + value);
  }
  // Find a single payer whose legs contain BOTH merchant-net and fee.
  // Edge case: merchantWallet == feeTo (same recipient) → require the
  // payer's combined total to that address to equal gross (net+fee).
  const feeMap = seen.get(feeLc);
  const netMap = seen.get(merchantLc);
  let payer: string | null = null;
  if (merchantLc === feeLc) {
    const m = netMap;
    if (m) {
      for (const [from, total] of m) {
        if (total === netUnits + feeUnits) { payer = from; break; }
      }
    }
  } else if (feeMap && netMap) {
    for (const [from, feeAmt] of feeMap) {
      if (feeAmt === feeUnits && (netMap.get(from) ?? 0n) === netUnits) {
        payer = from;
        break;
      }
    }
  }
  if (!payer) {
    const gotNet = netMap ? [...netMap.entries()].map(([f, v]) => `${f}:${v}`).join(',') : 'missing';
    const gotFee = feeMap ? [...feeMap.entries()].map(([f, v]) => `${f}:${v}`).join(',') : 'missing';
    throw new Error(
      `fee-split legs not found from one payer (need ${netUnits} to ${merchantWallet} + ${feeUnits} to ${feeTo}; got net[${gotNet}] fee[${gotFee}])`,
    );
  }
  return { payer };
}
