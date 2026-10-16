// NanoTab gateway worker — paywalls ANY origin API with x402-style 402s.
// Zero code changes on merchant side: proxy + 402 challenge + REAL verify.
//
// Mainnet flow (Base, USDC 0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5):
//  1. No X-Payment → 402 challenge (network=base, payTo=MERCHANT_WALLET).
//  2. With X-Payment carrying txHash → gateway fetches the tx receipt via a
//     Base public client and verifies it contains EXACTLY the atomic legs
//     [transfer(merchant,net), transfer(FEE_WALLET,fee)] from the USDC
//     contract, with correct amounts for PRICE_USD_CENTS and status=success.
//     Valid → proxy to origin (x-nanotab: settled-onchain). Anything else → 402.
//     This is the buyer-UserOp path: the buyer submits the batched UserOp
//     on-chain FIRST, then calls the gateway with the tx hash.
//  3. With X-Payment WITHOUT txHash → EIP-191 intent fallback (back-compat):
//     structural checks + signature recovery prove the payer AUTHORIZED the
//     payment off-chain; gateway proxies with x-nanotab: authorized-logged.
//  4. Merchant-side settlement via SETTLER_KEY is DEPRECATED now the buyer
//     pays on-chain directly; kept only as a legacy fallback. When used,
//     the settler sends TWO transfers: net → merchant, fee → fee recipient.
//     Fee = NANOTAB_FEE_BPS (default 50 = 0.5%).
//
// FEE RECIPIENT: env.FEE_WALLET when set, else MERCHANT_WALLET (back-compat —
// fee accrues with merchant). Every path (buyer-tx verify, split verify,
// settler) resolves via feeRecipient(env); never hardcode.
//
// PRICE: the gateway is price-agnostic — PRICE_USD_CENTS sets the per-call
// price for whatever origin it fronts. SaveShare ($0.05/call) = deploy this
// gateway with PRICE_USD_CENTS="5" and ORIGIN_URL=<saveshare-api>. No code
// change needed; one gateway instance per price point.

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyMessage,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

interface Env {
  ORIGIN_URL: string; // e.g. https://api.theirsite.com (no trailing slash)
  PRICE_USD_CENTS: string; // e.g. "2" = $0.02/call
  MERCHANT_WALLET: string; // 0x… — set via wrangler secret/variable, never hardcoded
  NANOTAB_FEE_BPS?: string; // e.g. "50" = 0.5% (default 50)
  NETWORK?: string; // must be "base"
  ASSET?: string; // must be USDC mainnet contract
  FEE_WALLET?: string; // NanoTab fee recipient (optional; defaults to MERCHANT_WALLET)
  SETTLER_KEY?: string; // settler private key (wrangler secret ONLY) — enables on-chain merchant transfer
  BASE_RPC_URL?: string; // optional custom Base RPC
}

const USDC_BASE_MAINNET = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';
const NANOTAB_NETWORK = 'base';
const USDC_DECIMALS = 6;

interface PaymentProof {
  amount: string; // USD cents, e.g. "2"
  to: string;
  asset: string;
  network?: string;
  signature: string;
  from?: string;
  txHash?: string; // optional: payer's on-chain transfer hash for confirmation
  // Atomic fee-split legs (REQUIRED when gateway FEE_WALLET is set).
  // Amounts in USDC base units. feeTo must equal FEE_WALLET, feeAmount +
  // merchantAmount must equal gross, feeAmount must equal feeBps math.
  split?: { feeTo: string; feeAmount: string; merchantAmount: string };
}

function paymentMessage(p: { to: string; amount: string; asset: string }): string {
  return `nanotab-x402|network=base|to=${p.to}|amountCents=${p.amount}|asset=${p.asset}`;
}

/**
 * Extended canonical message committing to the atomic fee split.
 * Signed by the buyer UserOp owner; gateway rejects if the signed split
 * does not match — the fee leg cannot be stripped without invalidating
 * the payer signature.
 */
function splitPaymentMessage(p: { to: string; amount: string; asset: string; feeTo: string; feeAmount: string; merchantAmount: string }): string {
  return `${paymentMessage(p)}|feeTo=${p.feeTo}|fee=${p.feeAmount}|net=${p.merchantAmount}`;
}

/** Fee recipient: explicit FEE_WALLET, else merchant (back-compat). Empty-string var counts as unset. */
function feeRecipient(env: Env): string {
  return env.FEE_WALLET || env.MERCHANT_WALLET;
}

function challenge(req: Request, env: Env): Response {
  return Response.json(
    {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: NANOTAB_NETWORK,
          maxAmountRequired: env.PRICE_USD_CENTS,
          resource: req.url,
          payTo: env.MERCHANT_WALLET,
          asset: USDC_BASE_MAINNET,
          fee: `${Number(env.NANOTAB_FEE_BPS ?? '50') / 100}%`,
          feeTo: feeRecipient(env),
        },
      ],
    },
    { status: 402 }
  );
}

function assetOk(asset: string): boolean {
  return asset.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() || asset === 'USDC';
}

/** Structural verify: well-formed, right merchant, sufficient amount, USDC-on-Base. */
function verifyPayment(header: string, to: string, amountCents: string): PaymentProof {
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
 * Atomic fee-split enforcement (NanoTab 50bps default).
 * Fee recipient = FEE_WALLET, defaulting to MERCHANT_WALLET (back-compat).
 * The X-Payment proof MUST carry `split` with:
 *   - split.feeTo == fee recipient (exact)
 *   - split.feeAmount == floor(gross * feeBps / 10_000) in USDC base units
 *   - split.merchantAmount == gross − fee
 * Missing/wrong split → 402. When no explicit FEE_WALLET is set, the fee
 * leg targets the merchant (dedicated single-recipient wallets) — still
 * exactly 2 legs, fee accounted separately in logs/headers.
 */
function verifyFeeSplit(proof: PaymentProof, amountCents: string, env: Env): { feeUnits: bigint; netUnits: bigint; feeTo: string } {
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  const netUnits = gross - feeUnits;
  // Back-compat: FEE_WALLET unset → legacy single-transfer mode, split
  // optional, fee accrues with merchant. Set → atomic split mandatory.
  if (!env.FEE_WALLET) return { feeUnits, netUnits, feeTo: env.MERCHANT_WALLET };
  const feeTo = feeRecipient(env);
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

/** Recover signer of the EIP-191 authorization; must equal `from` when provided. */
async function verifySignature(proof: PaymentProof): Promise<Address> {
  const recovered = await verifyMessage({
    address: (proof.from ?? '0x0000000000000000000000000000000000000000') as Address,
    message: paymentMessage({ to: proof.to, amount: proof.amount, asset: proof.asset }),
    signature: proof.signature as Hex,
  });
  void recovered;
  // verifyMessage returns bool for (address,message,sig); true = `from` signed it.
  return proof.from as Address;
}

function centsToUnits(cents: string): bigint {
  return BigInt(cents) * 10n ** BigInt(USDC_DECIMALS - 2);
}

function split(amountCents: string, feeBps: number): { feeUnits: bigint; netUnits: bigint } {
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  return { feeUnits, netUnits: gross - feeUnits };
}

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topicToAddress(topic: Hex): string {
  return '0x' + topic.slice(-40);
}

/**
 * Buyer-UserOp confirmation: fetch the tx receipt and verify it holds EXACTLY
 * the atomic fee-split legs from the USDC contract —
 *   transfer(payer → MERCHANT_WALLET, netUnits)
 *   transfer(payer → FEE_WALLET, feeUnits)
 * with status=success. Extra USDC transfers in the same tx → reject (keeps
 * the "exact legs" invariant tight). Returns the payer address.
 */
async function verifyBuyerTx(
  env: Env, txHash: string, amountCents: string,
): Promise<{ payer: string }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error('invalid txHash format');
  const feeTo = feeRecipient(env);
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  const netUnits = gross - feeUnits;
  const rpc = env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  const client = createPublicClient({ chain: base, transport: http(rpc) });
  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) throw new Error('tx not found or not yet mined (retry after confirmation)');
  if (receipt.status !== 'success') throw new Error('tx failed on-chain');
  const legs = receipt.logs.filter(
    (l) =>
      l.address.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() &&
      l.topics[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC,
  );
  const merchantLc = env.MERCHANT_WALLET.toLowerCase();
  const feeLc = feeTo.toLowerCase();
  const sameRecipient = feeLc === merchantLc;
  // Back-compat single-recipient mode (FEE_WALLET unset → fee accrues with
  // merchant): tx carries ONE leg of the FULL gross to the merchant.
  // Split mode: EXACTLY 2 legs [merchant-net, fee→fee wallet].
  if (legs.length !== (sameRecipient ? 1 : 2)) {
    throw new Error(sameRecipient
      ? `tx must contain exactly 1 USDC transfer of ${gross} units to ${env.MERCHANT_WALLET} (got ${legs.length} legs)`
      : `tx must contain exactly 2 USDC transfers (got ${legs.length})`);
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
  if (sameRecipient) {
    const got = seen.get(merchantLc);
    if (got !== gross) throw new Error(`merchant leg wrong (need ${gross} units to ${env.MERCHANT_WALLET}, got ${got ?? 'missing'})`);
    return { payer: payer as string };
  }
  const gotNet = seen.get(merchantLc);
  const gotFee = seen.get(feeLc);
  if (gotNet !== netUnits) {
    throw new Error(`merchant leg wrong (need ${netUnits} units to ${env.MERCHANT_WALLET}, got ${gotNet ?? 'missing'})`);
  }
  if (gotFee !== feeUnits) {
    throw new Error(`fee leg wrong (need ${feeUnits} units to ${feeTo}, got ${gotFee ?? 'missing'})`);
  }
  return { payer: payer as string };
}

/**
 * On-chain settlement (legacy SETTLER_KEY path): settler sends TWO USDC
 * transfers on Base — net → MERCHANT_WALLET, fee → fee recipient
 * (FEE_WALLET, defaulting to MERCHANT_WALLET). In single-recipient mode
 * the fee transfer is skipped (net == gross − fee accrues with merchant
 * via the single transfer of the FULL gross). Returns tx hashes.
 */
const ERC20_ABI_SETTLE = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
async function settleOnChain(env: Env, amountCents: string): Promise<{ txHash: string; feeTxHash: string | null; net: string; fee: string; feeTo: string }> {
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');
  const { feeUnits, netUnits } = split(amountCents, feeBps);
  const feeTo = feeRecipient(env);
  const account = privateKeyToAccount(env.SETTLER_KEY as `0x${string}`);
  const rpc = env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  void createPublicClient;
  const wallet = createWalletClient({ account, chain: base, transport: http(rpc) });
  const sameRecipient = feeTo.toLowerCase() === env.MERCHANT_WALLET.toLowerCase();
  // Single-recipient mode: one transfer of the FULL gross to the merchant.
  const merchantAmount = sameRecipient ? netUnits + feeUnits : netUnits;
  const txHash = await wallet.writeContract({
    address: USDC_BASE_MAINNET as Address,
    abi: ERC20_ABI_SETTLE,
    functionName: 'transfer',
    args: [env.MERCHANT_WALLET as Address, merchantAmount],
    account,
    chain: base,
  });
  let feeTxHash: string | null = null;
  if (!sameRecipient && feeUnits > 0n) {
    feeTxHash = await wallet.writeContract({
      address: USDC_BASE_MAINNET as Address,
      abi: ERC20_ABI_SETTLE,
      functionName: 'transfer',
      args: [feeTo as Address, feeUnits],
      account,
      chain: base,
    });
  }
  return { txHash, feeTxHash, net: netUnits.toString(), fee: feeUnits.toString(), feeTo };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!env.ORIGIN_URL || !env.PRICE_USD_CENTS || !env.MERCHANT_WALLET) {
      return Response.json(
        { error: 'gateway misconfigured: set ORIGIN_URL, PRICE_USD_CENTS, MERCHANT_WALLET' },
        { status: 500 }
      );
    }
    const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': '*, X-Payment',
        },
      });
    }

    const header = req.headers.get('X-Payment');
    if (!header) return challenge(req, env);

    let proof: PaymentProof;
    let feeUnits = 0n;
    let netUnits = 0n;
    let feeTo = '';
    try {
      proof = verifyPayment(header, env.MERCHANT_WALLET, env.PRICE_USD_CENTS);
      // Atomic split enforcement: fee leg present + exact BEFORE signature.
      ({ feeUnits, netUnits, feeTo } = verifyFeeSplit(proof, env.PRICE_USD_CENTS, env));
      if (proof.from) {
        // Split-aware message when the payer committed to legs; legacy
        // single-transfer message otherwise (back-compat when split unset
        // and FEE_WALLET unset).
        const msg = proof.split?.feeTo
          ? splitPaymentMessage({
              to: proof.to, amount: proof.amount, asset: proof.asset,
              feeTo: proof.split.feeTo, feeAmount: proof.split.feeAmount,
              merchantAmount: proof.split.merchantAmount,
            })
          : paymentMessage({ to: proof.to, amount: proof.amount, asset: proof.asset });
        const ok = await verifyMessage({
          address: proof.from as Address,
          message: msg,
          signature: proof.signature as Hex,
        });
        if (!ok) throw new Error('invalid payment signature');
      }
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 402 });
    }

    // Buyer-UserOp path: txHash present → confirm receipt on-chain FIRST.
    const gross = Number(env.PRICE_USD_CENTS) / 100;
    const fee = (gross * feeBps) / 10_000;
    let settleNote: string;
    let nanotabHeader: string;
    if (proof.txHash) {
      try {
        const v = await verifyBuyerTx(env, proof.txHash, env.PRICE_USD_CENTS);
        settleNote = `buyer UserOp ${proof.txHash} confirmed on-chain (net ${netUnits} → ${env.MERCHANT_WALLET}, fee ${feeUnits} → ${feeTo}, payer ${v.payer})`;
        nanotabHeader = 'settled-onchain';
        console.log(`[nanotab-gw] settled $${gross.toFixed(2)}: ${settleNote}`);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 402 });
      }
    } else if (env.SETTLER_KEY) {
      try {
        const s = await settleOnChain(env, env.PRICE_USD_CENTS);
        settleNote = `on-chain merchant transfer ${s.txHash} (net ${s.net} units; fee ${s.fee} units → ${s.feeTo}${s.feeTxHash ? ` in ${s.feeTxHash}` : ' (same-recipient mode: gross in merchant transfer)'})`;
        console.log(`[nanotab-gw] settled $${gross.toFixed(2)} → ${env.MERCHANT_WALLET}: ${settleNote}`);
      } catch (e) {
        settleNote = `on-chain settlement FAILED (${(e as Error).message}); fee accounting logged, merchant settle retry required`;
        console.log(`[nanotab-gw] SETTLE-FAIL $${gross.toFixed(2)} → ${env.MERCHANT_WALLET}: ${(e as Error).message}`);
      }
    } else {
      settleNote = `fee accounting logged (no SETTLER_KEY: merchant net ${netUnits} units to ${env.MERCHANT_WALLET}, fee ${feeUnits} units @${feeBps}bps to ${feeTo}; payer-authorized off-chain, payer submits on-chain transfer)`;
      console.log(
        `[nanotab-gw] authorized $${gross.toFixed(2)} → ${env.MERCHANT_WALLET} (fee ${(feeBps / 100).toFixed(2)}% $${fee.toFixed(4)}, net $${(gross - fee).toFixed(4)}, sig ${proof.signature.slice(0, 18)}… from ${proof.from ?? 'unknown'}) [${settleNote}]`
      );
    }

    const origin = new URL(req.url);
    const target = new URL(env.ORIGIN_URL + origin.pathname + origin.search);
    const fwd = new Headers(req.headers);
    fwd.delete('X-Payment');
    fwd.set('host', target.host);
    const init: RequestInit & { duplex?: string } =
      req.method === 'GET' || req.method === 'HEAD'
        ? { method: req.method, headers: fwd }
        : { method: req.method, headers: fwd, body: await req.arrayBuffer(), redirect: 'manual' };
    const proxied = await fetch(target.toString(), init);
    const out = new Headers(proxied.headers);
    out.set('access-control-allow-origin', '*');
    out.set('x-nanotab', proof.txHash ? nanotabHeader! : env.SETTLER_KEY ? 'settled-onchain' : 'authorized-logged');
    out.set('x-nanotab-settle', settleNote);
    return new Response(proxied.body, { status: proxied.status, headers: out });
  },
};
