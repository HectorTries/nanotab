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
 * Buyer-UserOp confirmation: fetch the tx receipt and verify it holds EXACTLY
 * the atomic fee-split legs from the USDC contract —
 *   transfer(payer → merchantWallet, netUnits)
 *   transfer(payer → feeTo, feeUnits)
 * with status=success. Extra USDC transfers in the same tx → reject (keeps
 * the "exact legs" invariant tight). Returns the payer address.
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
  // Mandatory split: EXACTLY 2 legs [merchant-net, fee→protocol wallet].
  // No single-transfer bypass.
  if (legs.length !== 2) {
    throw new Error(`tx must contain exactly 2 USDC transfers (got ${legs.length})`);
  }
  const seen = new Map<string, bigint>();
  let payer: string | null = null;
  for (const l of legs) {
    const from = topicToAddress(l.topics[1] as Hex).toLowerCase();
    const to = topicToAddress(l.topics[2] as Hex).toLowerCase();
    const value = BigInt(l.data as Hex);
    if (payer === null) payer = from;
    else if (payer !== from) throw new Error('transfer legs have different senders');
    seen.set(to, (seen.get(to) ?? 0n) + value);
  }
  const gotNet = seen.get(merchantLc);
  const gotFee = seen.get(feeLc);
  if (gotNet !== netUnits) {
    throw new Error(`merchant leg wrong (need ${netUnits} units to ${merchantWallet}, got ${gotNet ?? 'missing'})`);
  }
  if (gotFee !== feeUnits) {
    throw new Error(`fee leg wrong (need ${feeUnits} units to ${feeTo}, got ${gotFee ?? 'missing'})`);
  }
  return { payer: payer as string };
}
