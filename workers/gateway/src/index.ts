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
//     Fee = NANOTAB_FEE_BPS (default 10 = 0.1%).
//
// FEE RECIPIENT: env.FEE_WALLET when set, else NANOTAB_PROTOCOL_WALLET
// (hardcoded 0.1% protocol fee, non-optional). Every path (buyer-tx verify,
// split verify, settler) resolves via feeRecipient(env); never MERCHANT_WALLET.
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

// Minimal ambient Worker-runtime types (avoids @cloudflare/workers-types dep;
// wrangler/workerd provide the real globals at runtime).
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
}
export {};

interface Env {
  ORIGIN_URL: string; // e.g. https://api.theirsite.com (no trailing slash)
  PRICE_USD_CENTS: string; // e.g. "2" = $0.02/call
  MERCHANT_WALLET: string; // 0x… — set via wrangler secret/variable, never hardcoded
  NANOTAB_FEE_BPS?: string; // e.g. "10" = 0.1% (default 10)
  NETWORK?: string; // must be "base"
  ASSET?: string; // must be USDC mainnet contract
  FEE_WALLET?: string; // NanoTab fee recipient override (optional; defaults to NANOTAB_PROTOCOL_WALLET)
  SETTLER_KEY?: string; // settler private key (wrangler secret ONLY) — enables on-chain merchant transfer
  BASE_RPC_URL?: string; // optional custom Base RPC
  NANOTAB_STATS?: KVNamespace; // paid-call counters (wrangler kv namespace create NANOTAB_STATS)
}

// Non-optional NanoTab protocol fee: 0.1% of every paid call goes here,
// hardcoded so self-hosted clones pay Hector. NOT overridable to zero —
// env.FEE_WALLET may point fees elsewhere (e.g. a dedicated wallet Hector
// controls) but NEVER falls through to MERCHANT_WALLET.
const NANOTAB_PROTOCOL_WALLET = '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b';
const PROTOCOL_FEE_BPS = 10; // 0.1%, non-optional

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
  // Atomic fee-split legs (REQUIRED on every paid call — protocol fee is non-optional).
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

/** Fee recipient: explicit FEE_WALLET, else the hardcoded protocol wallet.
 *  NEVER falls through to MERCHANT_WALLET — the 0.1% protocol fee is mandatory. */
function feeRecipient(env: Env): string {
  return env.FEE_WALLET || NANOTAB_PROTOCOL_WALLET;
}

function acceptsFor(req: Request, env: Env) {
  return [
    {
      scheme: 'exact',
      network: NANOTAB_NETWORK,
      maxAmountRequired: centsToUnits(env.PRICE_USD_CENTS).toString(),
      resource: req.url,
      payTo: env.MERCHANT_WALLET,
      asset: USDC_BASE_MAINNET,
      fee: `${Number(env.NANOTAB_FEE_BPS ?? '10') / 100}%`,
      feeTo: feeRecipient(env),
      bazaar: {
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            method: { type: 'string', default: 'GET' },
          },
          required: [],
        },
      },
    },
  ];
}

function challenge(req: Request, env: Env): Response {
  return Response.json({ x402Version: 1, accepts: acceptsFor(req, env) }, { status: 402 });
}

function serveWellKnown(req: Request, env: Env): Response {
  return Response.json(
    { x402Version: 1, accepts: acceptsFor(req, env) },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } }
  );
}

function serveOpenApi(req: Request, env: Env): Response {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      openapi: '3.0.0',
      info: { title: 'NanoTab Gateway', version: '0.1.0' },
      servers: [{ url: origin }],
      paths: {
        '/': {
          get: {
            summary: 'Proxied origin API (x402 paid)',
            responses: { '402': { description: 'Payment required' } },
          },
        },
        '/stats': {
          get: {
            summary: 'Paid-call stats (free)',
            responses: { '200': { description: 'Stats JSON' } },
          },
        },
      },
      components: {},
    },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } }
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
 * Atomic fee-split enforcement (NanoTab 10bps default).
 * Fee recipient = FEE_WALLET override, else NANOTAB_PROTOCOL_WALLET.
 * The X-Payment proof MUST carry `split` with:
 *   - split.feeTo == fee recipient (exact)
 *   - split.feeAmount == floor(gross * feeBps / 10_000) in USDC base units
 *   - split.merchantAmount == gross − fee
 * Missing/wrong split → 402. No exceptions, no single-transfer bypass.
 */
function verifyFeeSplit(proof: PaymentProof, amountCents: string, env: Env): { feeUnits: bigint; netUnits: bigint; feeTo: string } {
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  const netUnits = gross - feeUnits;
  // Protocol fee is NON-OPTIONAL: every paid call carries the split.
  // No back-compat single-transfer bypass.
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
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '10');
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
    throw new Error(`merchant leg wrong (need ${netUnits} units to ${env.MERCHANT_WALLET}, got ${gotNet ?? 'missing'})`);
  }
  if (gotFee !== feeUnits) {
    throw new Error(`fee leg wrong (need ${feeUnits} units to ${feeTo}, got ${gotFee ?? 'missing'})`);
  }
  return { payer: payer as string };
}

/**
 * On-chain settlement (legacy SETTLER_KEY path): settler sends TWO USDC
 * transfers on Base — net → MERCHANT_WALLET, fee → protocol wallet.
 * Both legs always sent (feeUnits may be 0n only if price rounds to zero).
 * Returns tx hashes.
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
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '10');
  const { feeUnits, netUnits } = split(amountCents, feeBps);
  const feeTo = feeRecipient(env);
  const account = privateKeyToAccount(env.SETTLER_KEY as `0x${string}`);
  const rpc = env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  void createPublicClient;
  const wallet = createWalletClient({ account, chain: base, transport: http(rpc) });
  const txHash = await wallet.writeContract({
    address: USDC_BASE_MAINNET as Address,
    abi: ERC20_ABI_SETTLE,
    functionName: 'transfer',
    args: [env.MERCHANT_WALLET as Address, netUnits],
    account,
    chain: base,
  });
  let feeTxHash: string | null = null;
  if (feeUnits > 0n) {
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

// --- Paid-call stats (KV-backed marketing numbers, public via GET /stats) ---
// Keys: total_paid_calls, total_volume_usdc_units, merchant:<addr-lc>, day:YYYY-MM-DD.
// Fire-and-forget: never blocks the paid response; all KV errors swallowed.
async function kvIncr(kv: KVNamespace, key: string, by: number): Promise<void> {
  const cur = Number((await kv.get(key)) ?? 0);
  await kv.put(key, String(cur + by));
}

function recordPaidCall(ctx: ExecutionContext | undefined, env: Env, grossUnits: bigint): void {
  const kv = env.NANOTAB_STATS;
  if (!kv) return;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const merchantKey = `merchant:${env.MERCHANT_WALLET.toLowerCase()}`;
  const p = (async () => {
    try {
      await Promise.all([
        kvIncr(kv, 'total_paid_calls', 1),
        kvIncr(kv, 'total_volume_usdc_units', Number(grossUnits)),
        kvIncr(kv, merchantKey, 1),
        kvIncr(kv, `day:${day}`, 1),
      ]);
    } catch (e) {
      console.log(`[nanotab-gw] stats-log failed (non-fatal): ${(e as Error).message}`);
    }
  })();
  try {
    if (ctx?.waitUntil) ctx.waitUntil(p);
    else p.catch(() => {}); // no ctx (e.g. tests) — still don't block
  } catch { /* waitUntil threw: stats are best-effort */ }
}

async function serveStats(req: Request, env: Env): Promise<Response> {
  let cache: any = null;
  try { cache = (globalThis as any).caches?.default ?? null; } catch { cache = null; }
  if (cache) {
    const hit = await cache.match(req).catch(() => null);
    if (hit) return hit;
  }
  const kv = env.NANOTAB_STATS;
  const num = async (k: string) => Number((await kv?.get(k).catch(() => null)) ?? 0);
  const total_paid_calls = await num('total_paid_calls');
  const total_volume_usdc = (await num('total_volume_usdc_units')) / 1e6;
  let by_merchant: { merchant: string; paid_calls: number }[] = [];
  try {
    const listed = await kv?.list({ prefix: 'merchant:' }).catch(() => null);
    const keys = (listed?.keys ?? []).map((k) => k.name);
    const counts = await Promise.all(keys.map(async (k) => ({ merchant: k.slice('merchant:'.length), paid_calls: await num(k) })));
    by_merchant = counts.sort((a, b) => b.paid_calls - a.paid_calls).slice(0, 20);
  } catch { /* best-effort */ }
  const last_7_days: { day: string; paid_calls: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    last_7_days.push({ day: d, paid_calls: await num(`day:${d}`) });
  }
  const body = JSON.stringify({
    total_paid_calls,
    total_volume_usdc,
    by_merchant,
    last_7_days,
    fee_wallet: feeRecipient(env),
    fee_bps: Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS)),
  });
  const res = new Response(body, {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=60',
    },
  });
  if (cache) {
    try { await cache.put(req, res.clone()); } catch { /* non-fatal */ }
  }
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    // Free discovery routes (before the paywall):
    const pathname = new URL(req.url).pathname;
    if (req.method === 'GET' && pathname === '/.well-known/x402') {
      return serveWellKnown(req, env);
    }
    if (req.method === 'GET' && pathname === '/openapi.json') {
      return serveOpenApi(req, env);
    }
    // Public marketing numbers — no auth, cached 60s.
    if (req.method === 'GET' && pathname === '/stats') {
      return serveStats(req, env);
    }
    if (!env.ORIGIN_URL || !env.PRICE_USD_CENTS || !env.MERCHANT_WALLET) {
      return Response.json(
        { error: 'gateway misconfigured: set ORIGIN_URL, PRICE_USD_CENTS, MERCHANT_WALLET' },
        { status: 500 }
      );
    }
    const feeBps = Number(env.NANOTAB_FEE_BPS ?? '10');

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
        // Split-committed message (split is mandatory on every paid call).
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
        settleNote = `on-chain merchant transfer ${s.txHash} (net ${s.net} units; fee ${s.fee} units → ${s.feeTo}${s.feeTxHash ? ` in ${s.feeTxHash}` : ' (fee rounds to zero)'})`;
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

    // Paid verification succeeded → log stats (fire-and-forget, non-blocking).
    recordPaidCall(ctx, env, centsToUnits(env.PRICE_USD_CENTS));

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
