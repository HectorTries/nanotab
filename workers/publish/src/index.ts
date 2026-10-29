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
import { landingHtml } from './landing.ts';

// Minimal ambient Worker-runtime types (avoids @cloudflare/workers-types dep;
// wrangler/workerd provide the real globals at runtime).
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    get(key: string, type: 'json'): Promise<any>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
  }
  interface R2Object {
    readonly body: ReadableStream;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
  interface R2Bucket {
    get(key: string): Promise<R2Object | null>;
    put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
    delete(key: string): Promise<void>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
}
export {};

interface Env {
  PUBLISH_KEY?: string; // legacy shared-secret stub (wrangler secret ONLY) — magic-link preferred
  RESEND_API_KEY?: string; // Resend key for magic-link emails (wrangler secret ONLY); unset → /v1/auth/request returns the link (dev mode)
  AUTH_FROM?: string; // sender, e.g. "NanoTab <hello@nanotab.dev>" (default)
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
  owner?: string; // sha256hex(owner email); absent = legacy key-published
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

// --- storage helpers (KV required; R2 optional — KV `rb:<slug>` backs bytes until R2 is enabled) ---
function needStores(env: Env): { kv: KVNamespace; r2: R2Bucket | null } {
  if (!env.NANOTAB_LISTINGS) {
    throw new HttpErr(500, 'publish misconfigured: missing NANOTAB_LISTINGS KV binding');
  }
  return { kv: env.NANOTAB_LISTINGS, r2: env.NANOTAB_CONTENT ?? null };
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

async function getBytes(kv: KVNamespace, r2: R2Bucket | null, listing: Listing): Promise<{ body: ReadableStream } | null> {
  if (r2) {
    const obj = await r2.get(listing.r2_key).catch(() => null);
    if (obj) return obj;
  }
  const b64 = await kv.get(`rb:${listing.slug}`).catch(() => null);
  if (!b64) return null;
  const bytes = b64ToBytes(b64 as string);
  return { body: new Blob([bytes as unknown as BlobPart], { type: listing.mime }).stream() };
}

async function putBytes(kv: KVNamespace, r2: R2Bucket | null, listing: Listing, bytes: Uint8Array, b64: string): Promise<void> {
  if (r2) {
    try { await r2.put(listing.r2_key, bytes); return; }
    catch { /* R2 write failed → KV fallback */ }
  }
  await kv.put(`rb:${listing.slug}`, b64);
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

// --- auth: magic-link (POST /v1/auth/request {email} → link; GET /v1/auth/verify?token= → session) ---
// Session: KV `sess:<token>` = {email, exp}; cookie `nt_sess` httpOnly.
// Owner id stored on listings = sha256hex(lower(email)). Publish accepts session OR legacy X-Nanotab-Key.
// Email send via Resend (RESEND_API_KEY secret); if unset, /v1/auth/request returns {link} directly (dev mode).
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const AUTH_TOKEN_TTL = 15 * 60; // 15 min
const SESS_TTL = 30 * 24 * 3600; // 30 days

function randToken(n = 32): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, n * 2);
}

async function ownerOf(email: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sessionEmail(req: Request, env: Env): Promise<string | null> {
  const kv = needKv(env);
  const m = req.headers.get('cookie')?.match(/(?:^|;\s*)nt_sess=([0-9a-f]{64})/);
  const hdr = req.headers.get('authorization');
  const bearer = hdr?.toLowerCase().startsWith('bearer ') ? hdr.slice(7).trim() : '';
  const tok = m?.[1] || (/^[0-9a-f]{64}$/.test(bearer) ? bearer : '');
  if (!tok) return null;
  const s = (await kv.get(`sess:${tok}`, 'json').catch(() => null)) as { email: string; exp: number } | null;
  if (!s?.email || Date.now() > (s.exp ?? 0)) return null;
  return s.email;
}

async function sendMagicLink(env: Env, email: string, link: string): Promise<{ emailed: boolean }> {
  if (!env.RESEND_API_KEY) return { emailed: false };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_FROM ?? 'NanoTab <hello@nanotab.dev>',
      to: [email],
      subject: 'Sign in to NanoTab',
      text: `Sign in to NanoTab publish:\n\n${link}\n\nExpires in 15 minutes.`,
    }),
  });
  if (!r.ok) throw new HttpErr(502, `email send failed (${r.status})`);
  return { emailed: true };
}

async function handleAuthRequest(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  let body: any;
  try { body = await req.json(); } catch { throw new HttpErr(400, 'invalid JSON body'); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new HttpErr(400, 'invalid email');
  const token = randToken(32);
  await kv.put(`auth:${token}`, JSON.stringify({ email, exp: Date.now() + AUTH_TOKEN_TTL * 1000 }), { expirationTtl: AUTH_TOKEN_TTL });
  const origin = new URL(req.url).origin;
  const link = `${origin}/v1/auth/verify?token=${token}`;
  const { emailed } = await sendMagicLink(env, email, link);
  console.log(`[nanotab-publish] magic-link requested for ${email} (emailed=${emailed})`);
  return Response.json(emailed ? { ok: true, emailed: true } : { ok: true, emailed: false, link });
}

async function handleAuthVerify(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpErr(400, 'invalid token');
  const a = (await kv.get(`auth:${token}`, 'json').catch(() => null)) as { email: string; exp: number } | null;
  if (!a?.email || Date.now() > (a.exp ?? 0)) throw new HttpErr(401, 'expired or invalid token');
  await kv.delete(`auth:${token}`).catch(() => {});
  const sess = randToken(32);
  await kv.put(`sess:${sess}`, JSON.stringify({ email: a.email, exp: Date.now() + SESS_TTL * 1000 }), { expirationTtl: SESS_TTL });
  const res = Response.redirect(new URL('/', req.url).toString(), 302);
  res.headers.set('set-cookie', `nt_sess=${sess}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESS_TTL}`);
  return res;
}

// --- POST /v1/publish ---
async function handlePublish(req: Request, env: Env): Promise<Response> {
  const { kv, r2 } = needStores(env);
  // Auth: magic-link session (preferred) OR legacy X-Nanotab-Key stub.
  let owner: string | undefined;
  const sessEmail = await sessionEmail(req, env).catch(() => null);
  if (sessEmail) {
    owner = await ownerOf(sessEmail);
  } else if (env.PUBLISH_KEY && req.headers.get('X-Nanotab-Key') === env.PUBLISH_KEY) {
    owner = undefined; // legacy key publish (no owner)
  } else {
    throw new HttpErr(401, 'unauthorized (sign in via POST /v1/auth/request, or bad X-Nanotab-Key)');
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
    ...(owner ? { owner } : {}),
  };
  await putBytes(kv, r2, listing, bytes, body.body_b64);
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

  const obj = await getBytes(kv, r2, listing);
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
  const keys = await listRKeys(kv);
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

async function listRKeys(kv: KVNamespace): Promise<string[]> {
  try {
    const listed: any = await kv.list({ prefix: 'r:' });
    const keys = (listed?.keys ?? []).map((k: any) => k.name);
    if (keys.length || listed?.list_complete !== false) return keys;
  } catch { /* fall through to paginated retry */ }
  const out: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const page: any = await (kv as any).list({ prefix: 'r:', ...(cursor ? { cursor } : {}) }).catch(() => null);
    if (!page?.keys?.length) break;
    out.push(...page.keys.map((k: any) => k.name));
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return [...new Set(out)];
}
async function handleOwnerListings(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const email = await sessionEmail(req, env);
  if (!email) throw new HttpErr(401, 'unauthorized (sign in first)');
  const me = await ownerOf(email);
  const origin = new URL(req.url).origin;
  const keys = await listRKeys(kv);
  const items = (
    await Promise.all(keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null))
  )
    .filter((l): l is Listing => !!l?.slug && l.owner === me)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((l) => ({
      url: `${origin}/r/${l.slug}`,
      slug: l.slug,
      title: l.title,
      price_usd: (Number(l.price_cents) / 100).toFixed(2),
      mime: l.mime,
      merchant: l.merchant_wallet,
      paid_calls: l.paid_calls ?? 0,
      created_at: l.created_at,
    }));
  return Response.json(items);
}

async function handleOwnerDelete(req: Request, env: Env, slug: string): Promise<Response> {
  const { kv, r2 } = needStores(env);
  const email = await sessionEmail(req, env);
  if (!email) throw new HttpErr(401, 'unauthorized (sign in first)');
  const me = await ownerOf(email);
  const l = await getListing(kv, slug);
  if (!l) throw new HttpErr(404, 'listing not found');
  if (l.owner !== me) throw new HttpErr(403, 'forbidden (not your listing)');
  if (r2) await r2.delete(l.r2_key).catch(() => {});
  await kv.delete(`rb:${slug}`).catch(() => {});
  await kv.delete(`r:${slug}`).catch(() => {});
  await kv.delete(`listing:${slug}`).catch(() => {});
  console.log(`[nanotab-publish] deleted ${slug} by ${email}`);
  return Response.json({ ok: true, slug });
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

      if (req.method === 'GET' && (pathname === '/' || pathname === '/app')) {
        return new Response(landingHtml(), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'cache-control': 'public, max-age=300',
          },
        });
      }
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
      if (req.method === 'POST' && pathname === '/v1/auth/request') {
        return await handleAuthRequest(req, env);
      }
      if (req.method === 'GET' && pathname === '/v1/auth/verify') {
        return await handleAuthVerify(req, env);
      }
      if (req.method === 'GET' && pathname === '/v1/me') {
        const email = await sessionEmail(req, env);
        if (!email) throw new HttpErr(401, 'unauthorized (sign in first)');
        return Response.json({ email });
      }
      if (req.method === 'GET' && pathname === '/v1/listings') {
        return await handleOwnerListings(req, env);
      }
      if (req.method === 'DELETE' && pathname.startsWith('/v1/listings/')) {
        const slug = pathname.slice('/v1/listings/'.length);
        if (!/^[A-Za-z0-9]{10}$/.test(slug)) {
          return Response.json({ error: 'listing not found' }, { status: 404 });
        }
        return await handleOwnerDelete(req, env, slug);
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
