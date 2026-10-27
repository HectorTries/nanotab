// NanoTab publish worker — hosted one-click agent paywalls (MVP step 2).
//
// POST /v1/publish  (auth: X-Nanotab-Key shared-secret STUB; real magic-link in step 4)
//   {title, mime, price_cents, merchant_wallet, body_b64} → stores R2 bytes +
//   KV metadata → 201 {url, slug, x402}.
// GET /r/:slug  behaves exactly like the gateway: no X-Payment → 402 (same
//   body shape, per-listing payTo/amount); valid payment → R2 bytes with
//   x-nanotab:* headers. Buyer-tx verify only — NO settler on publish.
// GET /v1/marketplace.json  public flat listing file (day-one discovery).
// GET /stats  +  GET /.well-known/x402  free, for gateway parity.
//
// Storage: KV NANOTAB_LISTINGS (key `r:<slug>` metadata, `listing:<slug>`
// paid counters) + R2 bucket nanotab-content (key `r/<slug>` bytes, ≤1 MB).
// Missing bindings → 500 with a clear message (no in-memory fallback).

import { verifyMessage, type Address, type Hex } from 'viem';
import {
  NANOTAB_NETWORK_CAIP2,
  PROTOCOL_FEE_BPS,
  USDC_BASE_MAINNET,
  centsToUnits,
  feeRecipientFor,
  paymentMessage,
  splitPaymentMessage,
  verifyBuyerTx,
  verifyFeeSplit,
  verifyPayment,
  type PaymentProof,
} from '../../../packages/x402-verify/src/index.ts';

// Minimal ambient Worker-runtime types (avoids @cloudflare/workers-types dep;
// wrangler/workerd provide the real globals at runtime).
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    get(key: string, type: 'json'): Promise<any>;
    put(key: string, value: string): Promise<void>;
    list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
  }
  interface R2Object {
    readonly body: ReadableStream;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
  interface R2Bucket {
    get(key: string): Promise<R2Object | null>;
    put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
}
export {};

interface Env {
  PUBLISH_KEY?: string; // shared-secret stub (wrangler secret ONLY) — real magic-link later
  NANOTAB_FEE_BPS?: string; // e.g. "200" = 2% (default 200)
  MAX_PRICE_CENTS?: string; // publish price cap (default "10000" = $100)
  BASE_RPC_URL?: string; // optional custom Base RPC
  FEE_WALLET?: string; // NanoTab fee recipient override (optional; defaults to protocol wallet)
  NANOTAB_LISTINGS?: KVNamespace; // listing metadata `r:<slug>` + counters `listing:<slug>`
  NANOTAB_CONTENT?: R2Bucket; // nanotab-content bucket, key `r/<slug>`
}

interface Listing {
  slug: string;
  title: string;
  mime: string;
  bytes: number;
  r2_key: string;
  price_cents: string;
  merchant_wallet: string;
  created_at: string;
  paid_calls: number;
  source: 'paste';
}

const MIME_ALLOWLIST = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
];
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB decoded
const MAX_B64_CHARS = Math.ceil(MAX_BODY_BYTES / 3) * 4;
const RESERVED_SLUGS = new Set(['api', 'stats', 'admin', 'v1', 'r', 'publish', 'marketplace']);
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const SLUG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

class HttpErr extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// --- storage helpers (real bindings only; missing → 500, no fallback) ---
function needStores(env: Env): { kv: KVNamespace; r2: R2Bucket } {
  if (!env.NANOTAB_LISTINGS || !env.NANOTAB_CONTENT) {
    throw new HttpErr(500, 'publish misconfigured: missing NANOTAB_LISTINGS KV or nanotab-content R2 binding');
  }
  return { kv: env.NANOTAB_LISTINGS, r2: env.NANOTAB_CONTENT };
}

function needKv(env: Env): KVNamespace {
  if (!env.NANOTAB_LISTINGS) {
    throw new HttpErr(500, 'publish misconfigured: missing NANOTAB_LISTINGS KV binding');
  }
  return env.NANOTAB_LISTINGS;
}

async function getListing(kv: KVNamespace, slug: string): Promise<Listing | null> {
  return (await kv.get(`r:${slug}`, 'json').catch(() => null)) as Listing | null;
}

async function putListing(kv: KVNamespace, listing: Listing): Promise<void> {
  await kv.put(`r:${listing.slug}`, JSON.stringify(listing));
}

async function getBytes(r2: R2Bucket, key: string): Promise<R2Object | null> {
  return r2.get(key).catch(() => null);
}

async function putBytes(r2: R2Bucket, key: string, bytes: Uint8Array): Promise<void> {
  await r2.put(key, bytes);
}

async function kvIncr(kv: KVNamespace, key: string, by: number): Promise<void> {
  const cur = Number(((await kv.get(key).catch(() => null)) as string | null) ?? 0);
  await kv.put(key, String(cur + by));
}

function makeSlug(): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += SLUG_ALPHABET[x % SLUG_ALPHABET.length];
  return s;
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// 402 body mirroring the gateway's paymentRequiredBody shape exactly
// (x402Version/resource/accepts/extensions), with per-listing payTo/amount.
function listing402Body(reqUrl: string, l: Listing, feeBps: number, feeTo: string) {
  const priceUnits = centsToUnits(l.price_cents).toString();
  const priceUsd = (Number(l.price_cents) / 100).toFixed(2);
  const desc = `${l.title} ($${priceUsd} USDC on Base)`;
  const inputBody = {
    type: 'object',
    properties: {
      slug: { type: 'string' },
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
    resource: { url: reqUrl, description: desc, mimeType: l.mime },
    accepts: [
      {
        scheme: 'exact',
        network: NANOTAB_NETWORK_CAIP2,
        amount: priceUnits,
        maxAmountRequired: priceUnits,
        asset: USDC_BASE_MAINNET,
        payTo: l.merchant_wallet,
        maxTimeoutSeconds: 300,
        description: desc,
        mimeType: l.mime,
        fee: `${feeBps / 100}%`,
        feeTo,
        bazaar,
        extra: { fee: `${feeBps / 100}%`, feeTo },
      },
    ],
    extensions: { bazaar: bazaarSchema },
  };
}

// --- POST /v1/publish ---
async function handlePublish(req: Request, env: Env): Promise<Response> {
  const { kv, r2 } = needStores(env);
  if (!env.PUBLISH_KEY) {
    throw new HttpErr(500, 'publish misconfigured: PUBLISH_KEY not set');
  }
  if (req.headers.get('X-Nanotab-Key') !== env.PUBLISH_KEY) {
    throw new HttpErr(401, 'unauthorized (bad X-Nanotab-Key)');
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new HttpErr(400, 'invalid JSON body');
  }
  const maxPrice = Number(env.MAX_PRICE_CENTS ?? '10000');
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200) throw new HttpErr(400, 'invalid title (1–200 chars)');
  if (!MIME_ALLOWLIST.includes(body?.mime)) {
    throw new HttpErr(400, `unsupported mime (need one of: ${MIME_ALLOWLIST.join(', ')})`);
  }
  if (!Number.isInteger(body?.price_cents) || body.price_cents < 1 || body.price_cents > maxPrice) {
    throw new HttpErr(400, `invalid price_cents (int 1–${maxPrice})`);
  }
  if (typeof body?.merchant_wallet !== 'string' || !WALLET_RE.test(body.merchant_wallet)) {
    throw new HttpErr(400, 'invalid merchant_wallet (need 0x + 40 hex)');
  }
  if (typeof body?.body_b64 !== 'string' || body.body_b64.length > MAX_B64_CHARS) {
    throw new HttpErr(400, 'invalid body_b64 (need 1 byte–1MB base64)');
  }
  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(body.body_b64);
  } catch {
    throw new HttpErr(400, 'invalid body_b64 (need 1 byte–1MB base64)');
  }
  if (bytes.length < 1 || bytes.length > MAX_BODY_BYTES) {
    throw new HttpErr(400, 'invalid body_b64 (need 1 byte–1MB base64)');
  }

  let slug = '';
  for (let i = 0; i < 3; i++) {
    const cand = makeSlug();
    if (RESERVED_SLUGS.has(cand)) continue;
    if (await getListing(kv, cand)) continue;
    slug = cand;
    break;
  }
  if (!slug) throw new HttpErr(500, 'slug collision, retry');

  const listing: Listing = {
    slug,
    title,
    mime: body.mime,
    bytes: bytes.length,
    r2_key: `r/${slug}`,
    price_cents: String(body.price_cents),
    merchant_wallet: body.merchant_wallet,
    created_at: new Date().toISOString(),
    paid_calls: 0,
    source: 'paste',
  };
  await putBytes(r2, listing.r2_key, bytes);
  await putListing(kv, listing);

  const origin = new URL(req.url).origin;
  const url = `${origin}/r/${slug}`;
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  console.log(`[nanotab-publish] published ${slug} (${listing.mime}, ${listing.bytes}B, ${listing.price_cents}c → ${listing.merchant_wallet})`);
  return Response.json(
    { url, slug, x402: { accepts: listing402Body(url, listing, feeBps, feeTo).accepts } },
    { status: 201 }
  );
}

// --- GET /r/:slug ---
async function handleRead(req: Request, env: Env, ctx: ExecutionContext | undefined, slug: string): Promise<Response> {
  const { kv, r2 } = needStores(env);
  const listing = await getListing(kv, slug);
  if (!listing) throw new HttpErr(404, 'listing not found');

  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  const header = req.headers.get('X-Payment');
  if (!header) {
    return Response.json(listing402Body(req.url, listing, feeBps, feeTo), {
      status: 402,
      headers: {
        'content-security-policy': 'sandbox',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  let proof: PaymentProof;
  let feeUnits = 0n;
  let netUnits = 0n;
  try {
    proof = verifyPayment(header, listing.merchant_wallet, listing.price_cents);
    // Atomic split enforcement: fee leg present + exact BEFORE signature.
    ({ feeUnits, netUnits } = verifyFeeSplit(proof, listing.price_cents, feeBps, env.FEE_WALLET));
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
  // Publish has NO settler; without txHash → authorized-logged fallback.
  const gross = Number(listing.price_cents) / 100;
  let settleNote: string;
  let nanotabHeader: string;
  if (proof.txHash) {
    try {
      const v = await verifyBuyerTx({
        rpcUrl: env.BASE_RPC_URL,
        merchantWallet: listing.merchant_wallet,
        feeTo,
        feeBps,
        txHash: proof.txHash,
        amountCents: listing.price_cents,
      });
      settleNote = `buyer UserOp ${proof.txHash} confirmed on-chain (net ${netUnits} → ${listing.merchant_wallet}, fee ${feeUnits} → ${feeTo}, payer ${v.payer})`;
      nanotabHeader = 'settled-onchain';
      console.log(`[nanotab-publish] settled $${gross.toFixed(2)} (${slug}): ${settleNote}`);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 402 });
    }
  } else {
    settleNote = `fee accounting logged (no settler on publish: merchant net ${netUnits} units to ${listing.merchant_wallet}, fee ${feeUnits} units @${feeBps}bps to ${feeTo}; payer-authorized off-chain, payer submits on-chain transfer)`;
    nanotabHeader = 'authorized-logged';
    console.log(
      `[nanotab-publish] authorized $${gross.toFixed(2)} (${slug}) → ${listing.merchant_wallet} (sig ${proof.signature.slice(0, 18)}… from ${proof.from ?? 'unknown'}) [${settleNote}]`
    );
  }

  const obj = await getBytes(r2, listing.r2_key);
  if (!obj) throw new HttpErr(500, 'listing bytes missing (inconsistent state)');

  // Paid-call accounting: per-listing paid_calls + listing:<slug> counter.
  const p = (async () => {
    try {
      const cur = await getListing(kv, slug);
      if (cur) await putListing(kv, { ...cur, paid_calls: (cur.paid_calls ?? 0) + 1 });
      await kvIncr(kv, `listing:${slug}`, 1);
    } catch (e) {
      console.log(`[nanotab-publish] stats-log failed (non-fatal): ${(e as Error).message}`);
    }
  })();
  try {
    if (ctx?.waitUntil) ctx.waitUntil(p);
    else await p.catch(() => {}); // no ctx (e.g. tests) — still don't fail
  } catch { /* waitUntil threw: stats are best-effort */ }

  const headers = new Headers({
    'content-type': listing.mime,
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'x-nanotab': nanotabHeader,
    'x-nanotab-settle': settleNote,
  });
  if (listing.mime === 'text/html') {
    // Stored-XSS guard: never render publisher HTML inline.
    headers.set('content-disposition', `attachment; filename="${slug}.html"`);
    headers.set('content-security-policy', 'sandbox');
  }
  return new Response(obj.body, { status: 200, headers });
}

// --- GET /v1/marketplace.json ---
async function handleMarketplace(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const origin = new URL(req.url).origin;
  const listed = await kv.list({ prefix: 'r:' }).catch(() => null);
  const keys = (listed?.keys ?? []).map((k) => k.name);
  const items = (
    await Promise.all(
      keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null)
    )
  )
    .filter((l): l is Listing => !!l?.slug)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((l) => ({
      url: `${origin}/r/${l.slug}`,
      title: l.title,
      price_usd: (Number(l.price_cents) / 100).toFixed(2),
      mime: l.mime,
      merchant: l.merchant_wallet,
    }));
  return Response.json(items, {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=60' },
  });
}

// --- GET /stats (free totals) ---
async function handleStats(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const num = async (k: string) => Number(((await kv.get(k).catch(() => null)) as string | null) ?? 0);
  const paidListed = await kv.list({ prefix: 'listing:' }).catch(() => null);
  const paidKeys = (paidListed?.keys ?? []).map((k) => k.name);
  const counts = await Promise.all(paidKeys.map(async (k) => num(k)));
  const total_paid_calls = counts.reduce((a, b) => a + b, 0);
  const listings = await kv.list({ prefix: 'r:' }).catch(() => null);
  return Response.json(
    {
      total_paid_calls,
      total_listings: (listings?.keys ?? []).length,
      fee_wallet: feeRecipientFor(env.FEE_WALLET),
      fee_bps: Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS)),
    },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=60' } }
  );
}

// --- GET /publish (static paste form; posts to /v1/publish, shows permalink + test-402 curl) ---
function handlePublishPage(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NanoTab — publish a paywalled listing</title></head><body>
<h1>Publish a paywalled listing</h1>
<form id="f">
<label>title <input name="title" maxlength="200" required></label><br>
<label>price (USD) <input name="price" type="number" min="0.01" max="100" step="0.01" required></label><br>
<label>USDC wallet <input name="wallet" pattern="0x[0-9a-fA-F]{40}" required></label><br>
<label>mime <select name="mime"><option>text/markdown</option><option>text/plain</option><option>text/html</option><option>application/json</option></select></label><br>
<label>content <textarea name="body" rows="12" cols="60" required></textarea></label><br>
<label>secret <input name="secret" type="password" required></label><br>
<button>publish</button></form>
<pre id="out"></pre>
<script>
const f=document.getElementById('f'),out=document.getElementById('out');
f.onsubmit=async(e)=>{e.preventDefault();const d=new FormData(f);
const price_cents=Math.round(parseFloat(d.get('price'))*100);
const body={title:d.get('title'),mime:d.get('mime'),price_cents,
merchant_wallet:d.get('wallet'),body_b64:btoa(unescape(encodeURIComponent(d.get('body'))))};
const r=await fetch('/v1/publish',{method:'POST',headers:{'content-type':'application/json','X-Nanotab-Key':d.get('secret')},body:JSON.stringify(body)});
const j=await r.json();
if(!r.ok){out.textContent='error '+r.status+': '+j.error;return;}
const curl='curl -i '+j.url+" # expect 402\\ncurl -i -H 'X-Payment: <base64-proof>' "+j.url;
out.textContent='permalink: '+j.url+'\\ntest 402: '+curl;};
</script></body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts",
      'x-content-type-options': 'nosniff',
    },
  });
}

// --- GET /.well-known/x402 (generic spec; per-listing terms live in /r/:slug 402s) ---
function handleWellKnown(req: Request, env: Env): Response {
  const origin = new URL(req.url).origin;
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  const inputBody = {
    type: 'object',
    properties: {
      slug: { type: 'string' },
    },
    required: [],
  };
  return Response.json(
    {
      x402Version: 2,
      resource: {
        url: `${origin}/v1/marketplace.json`,
        description: 'NanoTab hosted paywalled listings (per-listing price, USDC on Base)',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: NANOTAB_NETWORK_CAIP2,
          asset: USDC_BASE_MAINNET,
          description: 'Per-listing terms in each GET /r/:slug 402 body; browse /v1/marketplace.json',
          mimeType: 'application/json',
          fee: `${feeBps / 100}%`,
          feeTo,
          bazaar: { inputSchema: inputBody },
          extra: { fee: `${feeBps / 100}%`, feeTo },
        },
      ],
      extensions: {
        bazaar: {
          schema: {
            properties: {
              input: { properties: { body: inputBody, queryParams: inputBody } },
              output: { properties: { example: { type: 'object' } } },
            },
          },
        },
      },
    },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } }
  );
}

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    try {
      const pathname = new URL(req.url).pathname;

      if (req.method === 'GET' && pathname === '/.well-known/x402') {
        return handleWellKnown(req, env);
      }
      if (req.method === 'GET' && pathname === '/v1/marketplace.json') {
        return handleMarketplace(req, env);
      }
      if (req.method === 'GET' && pathname === '/stats') {
        return handleStats(req, env);
      }
      if (req.method === 'GET' && pathname === '/publish') {
        return handlePublishPage();
      }
      if (req.method === 'POST' && pathname === '/v1/publish') {
        return await handlePublish(req, env);
      }
      if (req.method === 'GET' && pathname.startsWith('/r/')) {
        const slug = pathname.slice('/r/'.length);
        if (!/^[A-Za-z0-9]{10}$/.test(slug)) {
          return Response.json({ error: 'listing not found' }, { status: 404 });
        }
        return await handleRead(req, env, ctx, slug);
      }

      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': '*, X-Payment, X-Nanotab-Key',
          },
        });
      }

      return Response.json({ error: 'not found' }, { status: 404 });
    } catch (e) {
      if (e instanceof HttpErr) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  },
};
