// NanoTab publish worker — hosted one-click agent paywalls (MVP step 2).
//
// POST /v1/publish  (auth: magic-link session OR X-Nanotab-Key stub)
//   {title, mime, price_cents, merchant_wallet, body_b64, source_url?} →
//   stores R2 bytes + KV metadata → 201 {url, slug, x402}. Human links are
//   live instantly. Agent links differ: POST /v1/agent/submit (X-Agent-Key)
//   queues status 'pending' → GET /r/:slug 403 until the owner approves via
//   GET /v1/agent/pending + POST /v1/agent/review (see /agent-auth page).
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
import { landingHtml, loginHtml, developersHtml, agentAuthHtml, termsHtml, privacyHtml, refundsHtml, contactHtml, aboutHtml, walletGuideHtml, demoHtml } from './landing.ts';
import { isBlockedDomain } from './blocklist.ts';

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
  AGENT_KEY?: string; // agent submission key (wrangler secret ONLY); unset → agent submissions disabled (fail closed)
  OWNER_EMAILS?: string; // comma-separated reviewer allowlist for /agent-auth; unset → any signed-in user may review (scaffold)
  RESEND_API_KEY?: string; // Resend key for magic-link emails (wrangler secret ONLY); unset → /v1/auth/request returns the link (dev mode)
  AUTH_FROM?: string; // sender, e.g. "NanoTab <hello@nanotab.dev>" (default)
  NANOTAB_FEE_BPS?: string; // e.g. "200" = 2% (default 200)
  MAX_PRICE_CENTS?: string; // publish price cap (default "10000" = $100)
  BASE_RPC_URL?: string; // optional custom Base RPC
  TYPESAFE_API_KEY?: string; // TypeSafe Jev auto-reviewer key (wrangler secret ONLY); unset/error → fail open to manual queue
  VERIFIED_AGENTS?: string; // comma-separated agent_name allowlist for Jev auto-publish; unset → any AGENT_KEY-authenticated agent counts verified
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
  source: 'paste' | 'agent';
  // Publication state. Absent = live (legacy listings predate this field).
  // Agent submissions start 'pending' and only go live on owner approval;
  // human publishes are 'live' immediately.
  status?: 'live' | 'pending' | 'rejected';
  created_by_agent?: boolean; // true for agent submissions (badge on approved links)
  agent_name?: string; // self-reported agent identity on submissions
  source_url?: string; // original link the content was paywalled from (provenance)
  reviewed_at?: string;
  reviewed_by?: string;
  owner?: string; // sha256hex(owner email); absent = legacy key-published
  agent_verified?: boolean; // true when the submitting agent may auto-publish (see isVerifiedAgent)
  jev?: JevVerdict; // TypeSafe Jev auto-review verdict; absent = Jev unavailable at submission (fail-open)
}

// TypeSafe Jev verdict stored on agent-submitted listings. Noul scores are
// probabilities 0..1; quality_score is the 0..4 expected score across
// QUALITY_LEVELS, quality is the winning level label.
export const QUALITY_LEVELS = ['junk/mismatch', 'weak', 'fine', 'good', 'excellent'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

interface JevVerdict {
  spam: number;
  content_legal: number;
  price_sane: number;
  quality_score: number;
  quality: QualityLevel;
  quality_confidence: number;
  model: string;
  checked_at: string;
  decision: 'auto-publish' | 'held';
}

function isLive(l: Listing): boolean {
  return !l.status || l.status === 'live';
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
const RESERVED_SLUGS = new Set(['api', 'stats', 'admin', 'v1', 'r', 'publish', 'marketplace', 'login', 'developers', 'agent-auth', 'app']);
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

function safeNext(v: unknown): string {
  // Only same-site absolute paths may be redirect targets after sign-in.
  if (typeof v !== 'string' || v.length > 512) return '/';
  if (!/^\/(?!\/)[^\s\\]*$/.test(v)) return '/';
  return v;
}

async function handleAuthRequest(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  let body: any;
  try { body = await req.json(); } catch { throw new HttpErr(400, 'invalid JSON body'); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new HttpErr(400, 'invalid email');
  const next = safeNext(body?.next);
  const token = randToken(32);
  await kv.put(`auth:${token}`, JSON.stringify({ email, exp: Date.now() + AUTH_TOKEN_TTL * 1000, next }), { expirationTtl: AUTH_TOKEN_TTL });
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
  const a = (await kv.get(`auth:${token}`, 'json').catch(() => null)) as { email: string; exp: number; next?: string } | null;
  if (!a?.email || Date.now() > (a.exp ?? 0)) throw new HttpErr(401, 'expired or invalid token');
  await kv.delete(`auth:${token}`).catch(() => {});
  const sess = randToken(32);
  await kv.put(`sess:${sess}`, JSON.stringify({ email: a.email, exp: Date.now() + SESS_TTL * 1000 }), { expirationTtl: SESS_TTL });
  const res = Response.redirect(new URL(safeNext(a.next), req.url).toString(), 302);
  res.headers.set('set-cookie', `nt_sess=${sess}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESS_TTL}`);
  return res;
}

// Shared body validation for human publishes and agent submissions.
function parsePublishBody(body: any, maxPrice: number): {
  title: string; mime: string; price_cents: number; merchant_wallet: string;
  bytes: Uint8Array; b64: string; source_url?: string; agent_name?: string;
} {
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
  let source_url: string | undefined;
  if (body?.source_url !== undefined && body?.source_url !== '') {
    if (typeof body.source_url !== 'string' || body.source_url.length > 2048) {
      throw new HttpErr(400, 'invalid source_url');
    }
    let u: URL;
    try { u = new URL(body.source_url); } catch { throw new HttpErr(400, 'invalid source_url'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpErr(400, 'invalid source_url');
    source_url = body.source_url;
  }
  let agent_name: string | undefined;
  if (typeof body?.agent_name === 'string' && body.agent_name.trim()) {
    agent_name = body.agent_name.trim().slice(0, 80);
  }
  return { title, mime: body.mime, price_cents: body.price_cents, merchant_wallet: body.merchant_wallet, bytes, b64: body.body_b64, source_url, agent_name };
}

async function freshSlug(kv: KVNamespace): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const cand = makeSlug();
    if (RESERVED_SLUGS.has(cand)) continue;
    if (await getListing(kv, cand)) continue;
    return cand;
  }
  throw new HttpErr(500, 'slug collision, retry');
}

// --- POST /v1/publish (human: publishes instantly, no review friction) ---
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
  const p = parsePublishBody(body, maxPrice);
  const slug = await freshSlug(kv);

  const listing: Listing = {
    slug,
    title: p.title,
    mime: p.mime,
    bytes: p.bytes.length,
    r2_key: `r/${slug}`,
    price_cents: String(p.price_cents),
    merchant_wallet: p.merchant_wallet,
    created_at: new Date().toISOString(),
    paid_calls: 0,
    source: 'paste',
    status: 'live',
    ...(p.source_url ? { source_url: p.source_url } : {}),
    ...(owner ? { owner } : {}),
  };
  await putBytes(kv, r2, listing, p.bytes, p.b64);
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

// --- Agentic submissions: agents create paywalls, owner approves daily ---
// POST /v1/agent/submit (X-Agent-Key) queues a listing as 'pending'.
// GET  /v1/agent/pending + POST /v1/agent/review are the daily review queue,
// gated to the account owner (session; OWNER_EMAILS allowlist when set, or
// the legacy publish key for automation). Unapproved links never publish:
// GET /r/:slug returns 403 while pending and 404 once rejected.
async function requireReviewer(req: Request, env: Env): Promise<string> {
  if (env.PUBLISH_KEY && req.headers.get('X-Nanotab-Key') === env.PUBLISH_KEY) return 'publish-key';
  const email = await sessionEmail(req, env).catch(() => null);
  if (!email) throw new HttpErr(401, 'unauthorized (sign in to review agent submissions)');
  const allow = (env.OWNER_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(email.toLowerCase())) {
    throw new HttpErr(403, 'forbidden (agent review is restricted to the account owner)');
  }
  return email;
}

// --- TypeSafe Jev auto-reviewer (agent submissions only) ---
// One System One call with four typed questions. Any failure (missing key,
// network, non-200, malformed answers) returns null and the caller fails
// open to the manual /agent-auth queue — submissions never break on Jev.
const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 10_000;
const AGENT_SUBMIT_LIMIT_PER_HOUR = 10;

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function isVerifiedAgent(env: Env, agentName: string): boolean {
  // The AGENT_KEY secret already authenticates the agent. VERIFIED_AGENTS,
  // when set, further restricts auto-publish to named agents.
  const allow = (env.VERIFIED_AGENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.length) return true;
  return allow.includes(agentName);
}

function contentExcerpt(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, 2000);
  } catch {
    return '';
  }
}

async function callJev(env: Env, p: { title: string; price_cents: number; bytes: Uint8Array; source_url?: string; agent_name: string }): Promise<JevVerdict | null> {
  if (!env.TYPESAFE_API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JEV_TIMEOUT_MS);
  try {
    const r = await fetch(TYPESAFE_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          url: p.source_url ?? '',
          title: p.title,
          content_excerpt: contentExcerpt(p.bytes),
          price: `$${(p.price_cents / 100).toFixed(2)} (${p.price_cents} cents)`,
          agent_id: p.agent_name,
        },
        questions: {
          spam: { type: 'noul', instructions: 'Is this submitted paywall content spam or abusive?' },
          content_legal: { type: 'noul', instructions: 'Is this benign, lawful content?' },
          price_sane: { type: 'noul', instructions: 'Is this price plausible for this content type (no extreme gouging or rate-limit abuse)?' },
          quality: {
            type: 'score',
            instructions: 'Does the content genuinely match what the link title promises?',
            criteria: ['junk/mismatch', 'weak', 'fine', 'good', 'excellent'],
          },
        },
      }),
    });
    if (!r.ok) {
      console.log(`[nanotab-publish] jev unavailable (${r.status}); failing open to manual queue`);
      return null;
    }
    const j: any = await r.json().catch(() => null);
    const a = j?.answers;
    const spam = a?.spam?.noul, legal = a?.content_legal?.noul, sane = a?.price_sane?.noul;
    const qScore = a?.quality?.score, qConf = a?.quality?.confidence, qProbs = a?.quality?.probabilities;
    if (![spam, legal, sane, qScore].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      console.log('[nanotab-publish] jev returned malformed answers; failing open to manual queue');
      return null;
    }
    // Winning level = argmax probability, falling back to the rounded score.
    let qi = Math.min(4, Math.max(0, Math.round(qScore)));
    if (qProbs && typeof qProbs === 'object') {
      let best = -1;
      for (let i = 0; i < QUALITY_LEVELS.length; i++) {
        const v = Number(qProbs[String(i)]);
        if (Number.isFinite(v) && v > best) { best = v; qi = i; }
      }
    }
    return {
      spam, content_legal: legal, price_sane: sane,
      quality_score: qScore, quality: QUALITY_LEVELS[qi],
      quality_confidence: typeof qConf === 'number' && Number.isFinite(qConf) ? qConf : 0,
      model: typeof j?.model === 'string' ? j.model : 'jev-latest',
      checked_at: new Date().toISOString(),
      decision: 'held',
    };
  } catch (e) {
    console.log(`[nanotab-publish] jev call failed (${(e as Error).message}); failing open to manual queue`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function jevAutoPublishes(verified: boolean, v: JevVerdict): boolean {
  return verified && v.spam < 0.2 && v.content_legal > 0.8 && v.price_sane > 0.8
    && QUALITY_LEVELS.indexOf(v.quality) >= QUALITY_LEVELS.indexOf('fine');
}

async function handleAgentSubmit(req: Request, env: Env): Promise<Response> {
  const { kv, r2 } = needStores(env);
  if (!env.AGENT_KEY || req.headers.get('X-Agent-Key') !== env.AGENT_KEY) {
    throw new HttpErr(401, 'unauthorized (bad or missing X-Agent-Key; agent submissions disabled if unset)');
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new HttpErr(400, 'invalid JSON body');
  }
  const maxPrice = Number(env.MAX_PRICE_CENTS ?? '10000');
  const p = parsePublishBody(body, maxPrice);
  const agentName = p.agent_name ?? 'agent';

  // Hard blocks (code, skip Jev): spam domain, hourly rate, rejected resubmit.
  if (isBlockedDomain(p.source_url)) {
    throw new HttpErr(403, 'blocked: source domain is on the spam blocklist');
  }
  const hourBucket = new Date().toISOString().slice(0, 13);
  const rateKey = `agentcount:${agentName}:${hourBucket}`;
  const submitted = Number(((await kv.get(rateKey).catch(() => null)) as string | null) ?? 0);
  if (submitted >= AGENT_SUBMIT_LIMIT_PER_HOUR) {
    throw new HttpErr(429, `rate limited: over ${AGENT_SUBMIT_LIMIT_PER_HOUR} submissions/hour for this agent`);
  }
  await kv.put(rateKey, String(submitted + 1), { expirationTtl: 3600 }).catch(() => {});
  const urlFingerprint = p.source_url ? await sha256Hex(p.source_url) : await sha256Hex(`${p.merchant_wallet}|${p.title}`);
  if (await kv.get(`rurl:${urlFingerprint}`).catch(() => null)) {
    throw new HttpErr(403, 'blocked: this URL was previously rejected and may not be resubmitted');
  }

  // Jev auto-review: one call, four typed judgments. Fail-open on any error.
  const verified = isVerifiedAgent(env, agentName);
  const verdict = await callJev(env, { title: p.title, price_cents: p.price_cents, bytes: p.bytes, source_url: p.source_url, agent_name: agentName });
  const auto = !!verdict && jevAutoPublishes(verified, verdict);
  if (verdict) verdict.decision = auto ? 'auto-publish' : 'held';

  const slug = await freshSlug(kv);
  const listing: Listing = {
    slug,
    title: p.title,
    mime: p.mime,
    bytes: p.bytes.length,
    r2_key: `r/${slug}`,
    price_cents: String(p.price_cents),
    merchant_wallet: p.merchant_wallet,
    created_at: new Date().toISOString(),
    paid_calls: 0,
    source: 'agent',
    status: auto ? 'live' : 'pending',
    created_by_agent: true,
    agent_name: agentName,
    agent_verified: verified,
    ...(p.source_url ? { source_url: p.source_url } : {}),
    ...(verdict ? { jev: verdict } : {}),
    ...(auto ? { reviewed_at: new Date().toISOString(), reviewed_by: 'jev-auto' } : {}),
  };
  await putBytes(kv, r2, listing, p.bytes, p.b64);
  await putListing(kv, listing);
  const origin = new URL(req.url).origin;
  const url = `${origin}/r/${slug}`;
  if (auto) {
    console.log(`[nanotab-publish] jev auto-published ${slug} by ${agentName} (spam=${verdict!.spam}, legal=${verdict!.content_legal}, price=${verdict!.price_sane}, quality=${verdict!.quality})`);
    return Response.json(
      { url, slug, status: 'live', jev: verdict, message: 'Auto-published by Jev review: verified agent, clean scores, quality at or above fine.' },
      { status: 201 }
    );
  }
  console.log(`[nanotab-publish] agent submission queued ${slug} by ${agentName} (${listing.mime}, ${listing.bytes}B, ${listing.price_cents}c)${verdict ? ` jev: spam=${verdict.spam}, legal=${verdict.content_legal}, price=${verdict.price_sane}, quality=${verdict.quality}` : ' jev: unavailable, manual review'}`);
  return Response.json(
    { url, slug, status: 'pending', ...(verdict ? { jev: verdict } : {}), message: 'Queued for daily owner review. The link returns 403 until approved; no approval means it never publishes.' },
    { status: 202 }
  );
}

async function handleAgentPending(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  await requireReviewer(req, env);
  const origin = new URL(req.url).origin;
  const keys = await listRKeys(kv);
  const items = (
    await Promise.all(keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null))
  )
    .filter((l): l is Listing => !!l?.slug && l.status === 'pending')
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) // oldest first: review queue order
    .map((l) => ({
      slug: l.slug,
      url: `${origin}/r/${l.slug}`,
      title: l.title,
      price_usd: (Number(l.price_cents) / 100).toFixed(2),
      mime: l.mime,
      bytes: l.bytes,
      merchant: l.merchant_wallet,
      agent_name: l.agent_name ?? 'agent',
      source_url: l.source_url ?? null,
      created_at: l.created_at,
      created_by_agent: true,
      agent_verified: !!l.agent_verified,
      jev: l.jev ?? null,
    }));
  return Response.json(items);
}

async function handleAgentReview(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const reviewer = await requireReviewer(req, env);
  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new HttpErr(400, 'invalid JSON body');
  }
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const action = body?.action;
  if (!/^[A-Za-z0-9]{10}$/.test(slug)) throw new HttpErr(400, 'invalid slug');
  if (action !== 'approve' && action !== 'reject') throw new HttpErr(400, "invalid action (need 'approve' or 'reject')");
  const listing = await getListing(kv, slug);
  if (!listing) throw new HttpErr(404, 'listing not found');
  if (listing.status !== 'pending') throw new HttpErr(409, 'listing is not pending review');
  const updated: Listing = {
    ...listing,
    status: action === 'approve' ? 'live' : 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewer,
  };
  await putListing(kv, updated);
  if (action === 'reject') {
    // Remember the fingerprint so the same URL cannot be resubmitted.
    const fp = updated.source_url ? await sha256Hex(updated.source_url) : await sha256Hex(`${updated.merchant_wallet}|${updated.title}`);
    await kv.put(`rurl:${fp}`, slug).catch(() => {});
  }
  console.log(`[nanotab-publish] agent submission ${slug} ${action}d by ${reviewer}`);
  return Response.json({ ok: true, slug, status: updated.status });
}

const DEMO_SLUG = 'DemoSample';
const DEMO_BODY = `How to keep tomatoes happy in a small garden

Preview: Tomatoes want sun, steady water, and more room than you think. The five rules that actually matter:

1. Sun first. Six to eight hours of direct sun beats any feed. In a small garden, grow up a cane or string so leaves stay in the light and air.
2. Water the soil, not the leaves. Deep watering twice a week grows deeper roots than a daily sprinkle, and dry leaves resist blight.
3. Feed little and often. A weak tomato feed at every other watering from first flowers is steadier than one big dose.
4. Pinch the side shoots. The small shoots between leaf and stem steal energy; removing them weekly keeps fruit coming.
5. Mulch after planting. Straw or compost around the base keeps moisture even and soil splash off the leaves.

That is the whole guide. Everything else is refinement.
`;
function demoListing(env: Env): Listing {
  const bytes = new TextEncoder().encode(DEMO_BODY);
  return { slug: DEMO_SLUG, title: 'Sample: How to keep tomatoes happy in a small garden', mime: 'text/plain', bytes: bytes.length, r2_key: `r/${DEMO_SLUG}`, price_cents: '5', merchant_wallet: feeRecipientFor(env.FEE_WALLET), created_at: '2026-11-01T00:00:00.000Z', paid_calls: 0, source: 'paste', status: 'live' };
}

// --- GET /r/:slug ---
async function handleRead(req: Request, env: Env, ctx: ExecutionContext | undefined, slug: string): Promise<Response> {
  const { kv, r2 } = needStores(env);
  const isDemo = slug === DEMO_SLUG;
  const listing = isDemo ? demoListing(env) : await getListing(kv, slug);
  if (!listing) throw new HttpErr(404, 'listing not found');
  // Spam guardrail: agent links are not published until the owner approves.
  // Pending returns 403 (never 402 terms, never content, even with payment);
  // rejected links are indistinguishable from unknown slugs.
  if (listing.status === 'pending') {
    const accept = req.headers.get('accept') ?? '';
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');
    if (wantsHtml) {
      return new Response(pendingHtml(listing), {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' },
      });
    }
    return Response.json(
      { error: 'pending approval: this agent-submitted link has not been approved by the account owner yet', status: 'pending', slug },
      { status: 403, headers: { 'access-control-allow-origin': '*' } }
    );
  }
  if (listing.status === 'rejected') throw new HttpErr(404, 'listing not found');

  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  const header = req.headers.get('X-Payment');
  if (!header) {
    const accept = req.headers.get('accept') ?? '';
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');
    if (wantsHtml) {
      return new Response(paywallHtml(req.url, listing, feeBps, feeTo), {
        status: 402,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-content-type-options': 'nosniff',
        },
      });
    }
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

  const obj = isDemo ? { body: new Blob([DEMO_BODY], { type: listing.mime }).stream() } : await getBytes(kv, r2, listing);
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

function escHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Browser page for an agent-submitted link still awaiting owner approval.
function pendingHtml(l: Listing): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pending approval — NanoTab Pay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif}.wrap{max-width:640px;margin:0 auto;padding:56px 20px}.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}.card{background:#12161c;border:1px solid #232b36;border-radius:14px;padding:32px;margin-top:28px}.kicker{font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:#e8b34b;font-weight:600}h1{font-size:26px;letter-spacing:-.02em;line-height:1.25;margin:10px 0 8px}.mut{color:#9fb0c0;font-size:14.5px}a{color:#3ecf8e}</style></head><body>
<div class="wrap"><a class="logo" href="/"><span>N</span>NanoTab Pay</a><div class="card">
<div class="kicker">403 · Pending approval</div>
<h1>${escHtml(l.title)}</h1>
<p class="mut">This link was created by an agent (${escHtml(l.agent_name ?? 'agent')}) and is waiting in the account owner's daily review queue. It is not published yet — no price terms are served and no payment can unlock it until the owner approves it.</p>
<p class="mut">Are you the owner? <a href="/agent-auth">Review the queue</a> · <a href="/marketplace">Browse published links</a></p>
<p class="mut" style="text-align:center;font-size:13px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p>
</div></div></body></html>`;
}

// Human-readable 402 paywall page for browsers (content negotiation:
// Accept: text/html → this; Accept: application/json / agents → raw JSON).
function paywallHtml(reqUrl: string, l: Listing, feeBps: number, feeTo: string): string {
  const priceUsd = (Number(l.price_cents) / 100).toFixed(2);
  const netUsd = ((Number(l.price_cents) * (10_000 - feeBps)) / 10_000 / 100).toFixed(2);
  const shortWallet = `${l.merchant_wallet.slice(0, 6)}…${l.merchant_wallet.slice(-4)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(l.title)} — $${priceUsd} USDC paywall · NanoTab Pay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:640px;margin:0 auto;padding:56px 20px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;font-size:14px}
.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}
.card{background:#12161c;border:1px solid #232b36;border-radius:14px;padding:32px}
.kicker{font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:#3ecf8e;font-weight:600}
h1{font-size:28px;letter-spacing:-.02em;line-height:1.2;margin:10px 0 8px}
.price{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1.1;color:#3ecf8e;margin:14px 0 4px}
.mut{color:#9fb0c0;font-size:14px}a{color:#3ecf8e}code{background:#0e1218;border:1px solid #232b36;padding:1px 6px;border-radius:6px;font-size:13px;font-family:"IBM Plex Mono",monospace}
pre{background:#0e1218;border:1px solid #232b36;border-radius:10px;padding:14px;text-align:left;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-all;font-family:"IBM Plex Mono",monospace;color:#b7c5d6}
.foot{color:#7f8fa3;font-size:13px;text-align:center;margin-top:18px}</style></head><body>
<div class="wrap"><div class="top"><a class="logo" href="/"><span>N</span>NanoTab Pay</a><a href="/marketplace">Marketplace</a></div><div class="card">
<div class="kicker">Paywalled content · 402 Payment Required</div>
<h1>${escHtml(l.title)}</h1>${l.created_by_agent ? '<p class="mut"><span style="display:inline-block;border:1px solid rgba(62,207,142,.45);color:#3ecf8e;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600">Created by agent</span> <span style="font-size:13px">· approved by the account owner</span></p>' : ''}
<div class="price">$${priceUsd} USDC</div>
<p class="mut">per view · on Base · merchant <code>${shortWallet}</code> · seller receives $${netUsd} after ${feeBps / 100}% fee</p>
<p>This link is sold to <b>AI agents</b> — and humans can pay too. An agent reads the price, pays USDC on Base, and receives the content automatically, in one flow. A person pays the same way with a USDC wallet on Base; there is no NanoTab account and no card checkout.</p>
<p class="mut" style="margin-bottom:6px">How an agent pays:</p>
<pre>GET ${escHtml(reqUrl)}  →  402 + price in JSON
Agent pays $${priceUsd} USDC → ${escHtml(l.merchant_wallet)}
GET same URL + X-Payment proof  →  200 content</pre>
<p><a href="/marketplace">Browse marketplace</a> · <a href="/">Create your own link</a> · <a href="${escHtml(reqUrl)}" id="j">View machine terms (JSON)</a></p>
</div><p class="foot">HTTP 402 · ${escHtml(l.mime)} · ${l.bytes} bytes · USDC on Base via x402 · NanoTab keeps ${feeBps / 100}% of each payment<br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p></div>
<script>document.getElementById('j').onclick=function(e){e.preventDefault();fetch(location.href,{headers:{accept:'application/json'}}).then(function(r){return r.text()}).then(function(t){document.body.innerHTML='<pre style="max-width:860px;margin:24px auto;padding:16px;white-space:pre-wrap;word-break:break-all">'+t.replace(/</g,'&lt;').slice(0,4000)+'</pre>'})};</script>
</body></html>`;
}

// Human marketplace page (GET /marketplace); machines keep /v1/marketplace.json.
async function handleMarketplacePage(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const origin = new URL(req.url).origin;
  const keys = await listRKeys(kv);
  const items = (
    await Promise.all(keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null))
  )
    .filter((l): l is Listing => !!l?.slug && isLive(l))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const cards = items.length
    ? items.map((l) => {
        const price = (Number(l.price_cents) / 100).toFixed(2);
        const badge = l.created_by_agent ? ' <span style="display:inline-block;border:1px solid rgba(62,207,142,.45);color:#3ecf8e;border-radius:999px;padding:0 8px;font-size:11px;font-weight:600;vertical-align:2px">Created by agent</span>' : '';
        return `<div class="card"><div class="t">${escHtml(l.title)}${badge} <span class="price">$${price}</span></div><div class="m">${l.paid_calls ?? 0} paid calls · ${escHtml(l.mime)} · seller <code>${escHtml(l.merchant_wallet.slice(0, 6))}…${escHtml(l.merchant_wallet.slice(-4))}</code></div><div class="m"><a href="${origin}/r/${l.slug}">${origin}/r/${l.slug}</a></div></div>`;
      }).join('')
    : '<div class="card"><i>No public listings yet — <a href="/">publish the first one</a>.</i></div>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marketplace — NanoTab Pay paywall links for agents</title>
<meta name="description" content="Browse pay-per-view links agents buy with USDC on Base. Publish your own in a few clicks.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:760px;margin:0 auto;padding:0 20px 56px}a{color:#3ecf8e}.topbar{border-bottom:1px solid #232b36}.topbar-in{max-width:760px;margin:0 auto;padding:0 20px;height:60px;display:flex;align-items:center;justify-content:space-between}.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}nav{font-size:14px}nav a{margin-left:18px;color:#9fb0c0;text-decoration:none}nav a:hover{color:#f2f5f7}h1{font-size:32px;letter-spacing:-.02em;margin:36px 0 8px}.sub{color:#9fb0c0;margin:0 0 24px}.card{background:#12161c;border:1px solid #232b36;border-radius:12px;padding:18px;margin:12px 0}.t{font-weight:600;font-size:16px}.price{color:#3ecf8e}.m{color:#9fb0c0;font-size:14px;margin-top:3px;word-break:break-all}code{background:#0e1218;border:1px solid #232b36;padding:1px 6px;border-radius:6px;font-size:12.5px;font-family:"IBM Plex Mono",monospace}.cta{background:#12161c;border:1px solid #232b36;border-radius:12px;padding:20px;text-align:center;margin-top:24px}</style></head><body>
<div class="topbar"><div class="topbar-in"><a class="logo" href="/"><span>N</span>NanoTab Pay</a><nav><a href="/">Create</a><a href="/marketplace">Marketplace</a><a href="/stats">Stats</a></nav></div></div>
<div class="wrap"><h1>Marketplace (${items.length})</h1><p class="sub">Every link is pay-per-view in USDC on Base (x402). Open one in a browser for human terms, or fetch with <code>Accept: application/json</code> for the machine 402 your agent pays. <a href="/v1/marketplace.json">JSON for machines</a></p>${cards}<div class="cta"><b>Selling something agents need?</b><br><span style="color:#9fb0c0">Paste it, price it, share the link.</span><br><a href="/" style="display:inline-block;margin-top:10px;background:#3ecf8e;color:#06281a;font-weight:600;padding:10px 20px;border-radius:10px;text-decoration:none">Create a paywall link</a></div><p style="text-align:center;color:#7f8fa3;font-size:13px;margin-top:20px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}
async function handleMarketplace(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const origin = new URL(req.url).origin;
  const keys = await listRKeys(kv);
  const items = (
    await Promise.all(
      keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null)
    )
  )
    .filter((l): l is Listing => !!l?.slug && isLive(l))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((l) => ({
      url: `${origin}/r/${l.slug}`,
      title: l.title,
      price_usd: (Number(l.price_cents) / 100).toFixed(2),
      mime: l.mime,
      merchant: l.merchant_wallet,
      created_by_agent: !!l.created_by_agent,
      ...(l.source_url ? { source_url: l.source_url } : {}),
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
  const rKeys = await listRKeys(kv);
  const allListings = (
    await Promise.all(rKeys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null))
  ).filter((l): l is Listing => !!l?.slug);
  return Response.json(
    {
      total_paid_calls,
      total_listings: allListings.filter(isLive).length,
      pending_agent_listings: allListings.filter((l) => l.status === 'pending').length,
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
      status: l.status ?? 'live',
      created_by_agent: !!l.created_by_agent,
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

// --- GET /publish (API-key paste form; the email flow on / is the primary path) ---
function handlePublishPage(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Publish via API key — NanoTab Pay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif}.wrap{max-width:640px;margin:0 auto;padding:40px 20px 56px}a{color:#3ecf8e}.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}h1{font-size:28px;letter-spacing:-.02em;margin:28px 0 8px}.sub{color:#9fb0c0}.card{background:#12161c;border:1px solid #232b36;border-radius:14px;padding:24px;margin-top:20px}label{display:block;margin:14px 0 5px;color:#9fb0c0;font-size:14px;font-weight:500}input,textarea,select{width:100%;background:#0e1218;border:1px solid #232b36;border-radius:9px;color:#f2f5f7;padding:11px 13px;font-size:15px;font-family:inherit}textarea{font-family:"IBM Plex Mono",monospace;min-height:140px}button{background:#3ecf8e;border:1px solid #3ecf8e;border-radius:10px;color:#06281a;font-weight:600;font-size:15.5px;padding:11px 22px;cursor:pointer;margin-top:16px}pre{background:#0e1218;border:1px solid #232b36;border-radius:10px;padding:14px;white-space:pre-wrap;word-break:break-all;font-size:13px;font-family:"IBM Plex Mono",monospace}</style></head><body>
<div class="wrap"><a class="logo" href="/"><span>N</span>NanoTab Pay</a>
<h1>Publish via API key</h1>
<p class="sub">Most people should use the <a href="/">email sign-in flow</a> — no key to manage. This page is for automation with the shared <code>X-Nanotab-Key</code> secret. It posts to <code>/v1/publish</code> and shows the test curl commands.</p>
<div class="card"><form id="f">
<label>title <input name="title" maxlength="200" required></label>
<label>price (USD) <input name="price" type="number" min="0.01" max="100" step="0.01" required></label>
<label>USDC wallet <input name="wallet" pattern="0x[0-9a-fA-F]{40}" required></label>
<label>mime <select name="mime"><option>text/markdown</option><option>text/plain</option><option>text/html</option><option>application/json</option></select></label>
<label>content <textarea name="body" rows="12" cols="60" required></textarea></label>
<label>secret <input name="secret" type="password" required></label>
<button>publish</button></form>
<pre id="out">Your paywall link and test commands appear here. Unpaid: curl the link for a 402. Paid: retry with an X-Payment proof for 200.</pre></div>
<p class="sub">New here? <a href="/">Create a link with email instead</a> — you keep 98% hosted (NanoTab keeps 2%), agents pay in USDC on Base. No wallet yet? <a href="/wallet-guide">Plain-English wallet guide</a>.</p><p class="sub" style="text-align:center;font-size:13px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p></div>
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
      if (req.method === 'GET' && pathname === '/login') {
        return new Response(loginHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' },
        });
      }
      if (req.method === 'GET' && pathname === '/developers') {
        return new Response(developersHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' },
        });
      }
      if (req.method === 'GET' && pathname === '/agent-auth') {
        return new Response(agentAuthHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' },
        });
      }
      if (req.method === 'GET' && ['/terms', '/privacy', '/refunds', '/refund-policy', '/contact', '/about', '/wallet-guide', '/demo'].includes(pathname)) {
        const page = pathname === '/terms' ? termsHtml() : pathname === '/privacy' ? privacyHtml() : pathname === '/contact' ? contactHtml() : pathname === '/about' ? aboutHtml() : pathname === '/wallet-guide' ? walletGuideHtml() : pathname === '/demo' ? demoHtml() : refundsHtml();
        return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' } });
      }
      if (req.method === 'GET' && pathname === '/.well-known/x402') {
        return handleWellKnown(req, env);
      }
      if (req.method === 'GET' && pathname === '/marketplace') {
        return handleMarketplacePage(req, env);
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
      if (req.method === 'POST' && pathname === '/v1/agent/submit') {
        return await handleAgentSubmit(req, env);
      }
      if (req.method === 'GET' && pathname === '/v1/agent/pending') {
        return await handleAgentPending(req, env);
      }
      if (req.method === 'POST' && pathname === '/v1/agent/review') {
        return await handleAgentReview(req, env);
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
            'access-control-allow-headers': '*, X-Payment, X-Nanotab-Key, X-Agent-Key',
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
