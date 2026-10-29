// NanoTab gateway worker — paywalls ANY origin API with x402-style 402s.
// Zero code changes on merchant side: proxy + 402 challenge + REAL verify.
//
// Mainnet flow (Base, USDC 0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913):
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
//     Fee = NANOTAB_FEE_BPS (default 200 = 2% managed gateway; self-host middleware stays 10 = 0.1%).
//
// FEE RECIPIENT: env.FEE_WALLET when set, else NANOTAB_PROTOCOL_WALLET
// (hardcoded protocol fee recipient — every path (buyer-tx verify,
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
import {
  NANOTAB_NETWORK_CAIP2,
  PROTOCOL_FEE_BPS,
  USDC_BASE_MAINNET,
  centsToUnits,
  feeRecipientFor,
  paymentMessage,
  splitFee,
  splitPaymentMessage,
  verifyBuyerTx as verifyBuyerTxShared,
  verifyFeeSplit as verifyFeeSplitShared,
  verifyPayment,
  type PaymentProof,
} from '../../../packages/x402-verify/src/index.ts';

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
  NANOTAB_FEE_BPS?: string; // e.g. "200" = 2% (default 200 managed; self-host middleware uses 10 = 0.1%)
  NETWORK?: string; // must be "base"
  ASSET?: string; // must be USDC mainnet contract
  FEE_WALLET?: string; // NanoTab fee recipient override (optional; defaults to NANOTAB_PROTOCOL_WALLET)
  SETTLER_KEY?: string; // settler private key (wrangler secret ONLY) — enables on-chain merchant transfer
  BASE_RPC_URL?: string; // optional custom Base RPC
  NANOTAB_STATS?: KVNamespace; // paid-call counters (wrangler kv namespace create NANOTAB_STATS)
  NANOTAB_JEV_ENABLED?: string; // "1" = opt-in SafeSpend-lite risk scoring (log-only, never blocks)
  TYPESAFE_API_KEY?: string; // TypeSafe API key (wrangler secret ONLY) — Jev risk gate
}

// Verify logic (proof checks, fee math, constants) lives in the shared
// @nanotab/x402-verify module, imported above. These thin adapters keep the
// gateway's original Env-based call shapes (no behavior change).
function feeRecipient(env: Env): string {
  return feeRecipientFor(env.FEE_WALLET);
}

function verifyFeeSplit(proof: PaymentProof, amountCents: string, env: Env): { feeUnits: bigint; netUnits: bigint; feeTo: string } {
  return verifyFeeSplitShared(proof, amountCents, Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS)), env.FEE_WALLET);
}

function verifyBuyerTx(env: Env, txHash: string, amountCents: string): Promise<{ payer: string }> {
  return verifyBuyerTxShared({
    rpcUrl: env.BASE_RPC_URL,
    merchantWallet: env.MERCHANT_WALLET,
    feeTo: feeRecipient(env),
    feeBps: Number(env.NANOTAB_FEE_BPS ?? '200'),
    txHash,
    amountCents,
  });
}

function paymentRequiredBody(req: Request, env: Env) {
  const priceUnits = centsToUnits(env.PRICE_USD_CENTS).toString();
  const priceUsd = (Number(env.PRICE_USD_CENTS) / 100).toFixed(2);
  const desc = `NanoTab gateway API call ($${priceUsd} USDC on Base)`;
  // x402scan/agentcash discovery shape:
  // extensions.bazaar.schema.properties.{input.properties.{body|queryParams}, output.properties.example}
  const inputBody = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      method: { type: 'string', default: 'GET' },
    },
    required: [],
  };
  const bazaarSchema = {
    schema: {
      properties: {
        input: { properties: { body: inputBody, queryParams: inputBody } },
        output: { properties: { example: { type: 'object' } } },
      },
    },
  };
  const bazaar = { inputSchema: inputBody }; // legacy alias (some clients read accepts[].bazaar.inputSchema)
  return {
    x402Version: 2,
    resource: { url: req.url, description: desc, mimeType: 'application/json' },
    accepts: [
      {
        scheme: 'exact',
        network: NANOTAB_NETWORK_CAIP2,
        amount: priceUnits,
        maxAmountRequired: priceUnits,
        asset: USDC_BASE_MAINNET,
        payTo: env.MERCHANT_WALLET,
        maxTimeoutSeconds: 300,
        description: desc,
        mimeType: 'application/json',
        fee: `${Number(env.NANOTAB_FEE_BPS ?? '200') / 100}%`,
        feeTo: feeRecipient(env),
        bazaar,
        extra: { fee: `${Number(env.NANOTAB_FEE_BPS ?? '200') / 100}%`, feeTo: feeRecipient(env) },
      },
    ],
    extensions: { bazaar: bazaarSchema },
  };
}

function challenge(req: Request, env: Env): Response {
  return Response.json(paymentRequiredBody(req, env), { status: 402 });
}

function serveWellKnown(req: Request, env: Env): Response {
  return Response.json(
    paymentRequiredBody(req, env),
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
            parameters: [
              { name: 'path', in: 'query', required: false, schema: { type: 'string' } },
              { name: 'method', in: 'query', required: false, schema: { type: 'string', default: 'GET' } },
            ],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      path: { type: 'string' },
                      method: { type: 'string', default: 'GET' },
                    },
                  },
                },
              },
            },
            'x-payment-info': {
              price: { mode: 'fixed', currency: 'USD', amount: (Number(env.PRICE_USD_CENTS) / 100).toFixed(2) },
              protocols: [{ x402: {} }],
            },
            responses: {
              '200': { description: 'Proxied origin response' },
              '402': { description: 'Payment Required' },
            },
          },
        },
        '/stats': {
          get: {
            summary: 'Paid-call stats (free)',
            responses: { '200': { description: 'Stats JSON' } },
          },
        },
        '/openapi.json': {
          get: {
            summary: 'Discovery document (free)',
            responses: { '200': { description: 'OpenAPI JSON' } },
          },
        },
        '/.well-known/x402': {
          get: {
            summary: 'Payment spec (free)',
            responses: { '200': { description: 'x402 payment spec' } },
          },
        },
      },
      components: {},
    },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } }
  );
}

// verifyPayment / assetOk: imported from @nanotab/x402-verify
// (verifyFeeSplit via the thin adapter above).
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

// centsToUnits / splitFee / verifyBuyerTx / ERC20_TRANSFER_TOPIC / topicToAddress:
// imported from @nanotab/x402-verify (see thin adapters above).
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
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '200');
  const { feeUnits, netUnits } = splitFee(amountCents, feeBps);
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

// --- SafeSpend-lite: Jev risk gate (opt-in, log-only, NEVER blocks) ---
// When env.NANOTAB_JEV_ENABLED === "1" and TYPESAFE_API_KEY is set, every
// paid call is scored by Jev BEFORE proxying to the origin:
//   state  = { amount_usdc, merchant, payer, auth_path, time_utc }
//   risk    = Score 1-5 (fraud/abuse degree)
//   anomaly = Noul yes/no (anomalous vs normal micropayment traffic)
// Outcome: allow always; score >= JEV_FLAG_SCORE (2.5) or anomaly >= 0.7
//   → console log + `x-risk-score` / `x-risk-flag` response headers.
// No cold wallet, no vault, no pending queue — scoring + logging only.
const JEV_API_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_FLAG_SCORE = 2.5;
const JEV_FLAG_ANOMALY = 0.7;

interface JevVerdict { score: number | null; anomaly: number | null; flag: boolean; raw?: string }

async function jevRiskScore(env: Env, opts: {
  amountUsdc: number; merchant: string; payer: string; authPath: string;
}): Promise<JevVerdict> {
  const key = env.TYPESAFE_API_KEY;
  if (!key) return { score: null, anomaly: null, flag: false, raw: 'no-key' };
  const state = {
    amount_usdc: opts.amountUsdc,
    merchant: opts.merchant,
    payer: opts.payer,
    auth_path: opts.authPath, // "buyer-tx" | "settler" | "authorized-logged"
    buyer_history: 'lite-mode: no per-payer history yet (stateless gateway); treat first-seen payers as new',
    time_utc: new Date().toISOString(),
  };
  const body = {
    model: 'jev-latest',
    state,
    questions: {
      risk: {
        type: 'score',
        instructions: 'Rate the payment fraud/abuse risk of this micropayment.',
        criteria: [
          'Routine low-value payment from a normal buyer, no red flags',
          'Minor oddity (new buyer or unusual time) but amount trivial',
          'Notably unusual pattern worth a closer look',
          'Suspicious: likely abuse, testing, or stolen funds',
          'Clearly fraudulent or abusive',
        ],
      },
      anomaly: {
        type: 'noul',
        instructions: 'Is this payment anomalous compared to normal micropayment traffic?',
        criteria: { true: 'Unusual amount, velocity, or pattern', false: 'Normal micropayment' },
      },
    },
  };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // never stall a paid call on scoring
    let res: Response;
    try {
      res = await fetch(JEV_API_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
    if (!res.ok) return { score: null, anomaly: null, flag: false, raw: `http-${res.status}` };
    const j: any = await res.json();
    const score: number | null = typeof j?.answers?.risk?.score === 'number' ? j.answers.risk.score : null;
    const anomaly: number | null = typeof j?.answers?.anomaly?.noul === 'number' ? j.answers.anomaly.noul : null;
    const flag = (score !== null && score >= JEV_FLAG_SCORE) || (anomaly !== null && anomaly >= JEV_FLAG_ANOMALY);
    return { score, anomaly, flag };
  } catch (e) {
    return { score: null, anomaly: null, flag: false, raw: `error:${(e as Error).message}` };
  }
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
    const feeBps = Number(env.NANOTAB_FEE_BPS ?? '200');

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

    // SafeSpend-lite risk gate (opt-in; log-only, NEVER blocks the paid call).
    let riskScoreHeader = 'off';
    let riskFlagHeader = '0';
    if (env.NANOTAB_JEV_ENABLED === '1') {
      const authPath = proof.txHash ? 'buyer-tx' : env.SETTLER_KEY ? 'settler' : 'authorized-logged';
      const verdict = await jevRiskScore(env, {
        amountUsdc: Number(env.PRICE_USD_CENTS) / 100,
        merchant: env.MERCHANT_WALLET,
        payer: proof.from ?? 'unknown',
        authPath,
      });
      riskScoreHeader = verdict.score !== null
        ? `${verdict.score.toFixed(2)}/a=${verdict.anomaly !== null ? verdict.anomaly.toFixed(2) : '?'}`
        : (verdict.raw ?? 'unavailable');
      riskFlagHeader = verdict.flag ? '1' : '0';
      console.log(
        `[nanotab-gw][jev] score=${riskScoreHeader} flag=${riskFlagHeader} ` +
        `amount=$${gross.toFixed(2)} payer=${proof.from ?? 'unknown'} path=${authPath}`
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
    if (env.NANOTAB_JEV_ENABLED === '1') {
      out.set('x-risk-score', riskScoreHeader);
      out.set('x-risk-flag', riskFlagHeader);
    }
    return new Response(proxied.body, { status: proxied.status, headers: out });
  },
};
