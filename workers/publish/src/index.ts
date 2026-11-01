// NanoTab publish worker — hosted one-click agent paywalls (MVP step 2).
// No accounts, no email, no sessions anywhere: publishing and paying are
// accountless. Owner review is protected by ADMIN_KEY only.
//
// POST /v1/publish  (no credentials needed; publishing works with zero cookies)
//   {title, mime, price_cents, merchant_wallet, body_b64, source_url?} →
//   stores R2 bytes + KV metadata → 201 {url, slug, x402}. Human links are
//   live instantly. Agent links differ: POST /v1/agent/submit (X-Agent-Key)
//   queues status 'pending' → GET /r/:slug 403 until the owner approves via
//   GET /v1/agent/pending + POST /v1/agent/review (ADMIN_KEY; see /agent-auth).
// GET /r/:slug + GET /p/:slug  one listing, routed by intent: a valid
//   X-Payment → R2 bytes with x-nanotab:* headers (buyer-tx verify only —
//   NO settler on publish); unpaid + Accept: application/json or an
//   agent-style User-Agent → 402 (same body shape as the gateway,
//   per-listing payTo/amount); unpaid browser/discovery-crawler → 200
//   teaser with the free abstract (never 402, never the paid body).
// GET /v1/marketplace.json  public flat listing file (day-one discovery).
// GET /robots.txt, /llms.txt, /sitemap.xml  crawler/AI discovery.
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
import { landingHtml, developersHtml, agentAuthHtml, termsHtml, privacyHtml, refundsHtml, contactHtml, aboutHtml, walletGuideHtml, demoHtml } from './landing.ts';
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
  ADMIN_KEY?: string; // owner review key (wrangler secret ONLY); protects /agent-auth + /v1/agent/pending + /v1/agent/review; unset → review disabled (fail closed)
  AGENT_KEY?: string; // agent submission key (wrangler secret ONLY); unset → agent submissions disabled (fail closed)
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
  // Free 2-4 sentence abstract (first sentences of the content, plain text,
  // ~200-400 chars). Shown unpaid on /p/<slug> for search/AI discovery;
  // the full paid body is never part of it. Absent on legacy records and
  // derived lazily from the stored bytes on first public-page read.
  abstract?: string;
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
const RESERVED_SLUGS = new Set(['api', 'stats', 'admin', 'v1', 'r', 'publish', 'marketplace', 'developers', 'agent-auth', 'app']);
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

// --- Free abstract (discovery teaser) ---
// The first 2-4 sentences of the content as plain text, ~200-400 chars.
// This is the ONLY part of a paid body ever served unpaid: it is rendered
// server-side on /p/<slug> so crawlers/AI answer engines can quote it,
// while every later paragraph stays behind the 402. Derived at publish
// time and stored on the listing; legacy records backfill lazily on read.
const ABSTRACT_MIN = 200;
const ABSTRACT_MAX = 400;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ' '; } });
}

function toPlainText(raw: string, mime: string): string {
  let t = raw;
  if (mime === 'text/html') {
    t = t
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    t = decodeEntities(t);
  } else if (mime === 'text/markdown' || mime === 'text/plain') {
    t = t
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      .replace(/^\s*(-{3,}|_{3,}|\*{3,})\s*$/gm, ' ')
      .replace(/<[^>]+>/g, ' ');
    t = decodeEntities(t);
  }
  return t.replace(/\s+/g, ' ').trim();
}

function fallbackAbstract(title: string): string {
  return `${title} is paywalled content on NanoTab Pay. The title and price are public, and the full content unlocks instantly after payment. Pay in USDC on Base to read it in full.`;
}

export function deriveAbstract(bytes: Uint8Array, mime: string, title: string): string {
  if (mime === 'application/pdf' || mime === 'image/png' || mime === 'image/jpeg') {
    return fallbackAbstract(title);
  }
  let raw = '';
  try { raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes); } catch { raw = ''; }
  let plain = toPlainText(raw, mime);
  if (!plain) return fallbackAbstract(title);
  // Drop a leading repetition of the title (many pastes start with it).
  if (title && plain.toLowerCase().startsWith(title.toLowerCase())) {
    const rest = plain.slice(title.length).replace(/^[\s:.\-—|]+/, '').trim();
    if (rest.length >= 40) plain = rest;
  }
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = '';
  for (const s of sentences) {
    const sent = s.trim();
    if (!sent) continue;
    if (out && out.length >= ABSTRACT_MIN) break;
    if (out.split(/(?<=[.!?])\s+/).filter(Boolean).length >= 4) break;
    out = out ? `${out} ${sent}` : sent;
    if (out.length >= ABSTRACT_MAX) break;
  }
  if (!out) out = plain;
  if (out.length > ABSTRACT_MAX) {
    const cut = out.slice(0, ABSTRACT_MAX - 3);
    const atSpace = cut.lastIndexOf(' ');
    out = `${(atSpace > 120 ? cut.slice(0, atSpace) : cut).trim()}...`;
  }
  return out;
}

async function readAllBytes(kv: KVNamespace, r2: R2Bucket | null, listing: Listing): Promise<Uint8Array | null> {
  if (r2) {
    const obj: any = await r2.get(listing.r2_key).catch(() => null);
    if (obj) {
      if (typeof obj.arrayBuffer === 'function') return new Uint8Array(await obj.arrayBuffer());
      const b: any = obj.body;
      if (b instanceof Uint8Array) return b;
      if (b) return new Uint8Array(await new Response(b).arrayBuffer());
    }
  }
  const b64 = await kv.get(`rb:${listing.slug}`).catch(() => null);
  if (!b64) return null;
  try { return b64ToBytes(b64 as string); } catch { return null; }
}

// Stored abstract if present; otherwise derive from the stored bytes once
// and persist it back onto the listing (backfill for pre-abstract records).
async function ensureAbstract(kv: KVNamespace, r2: R2Bucket | null, listing: Listing): Promise<string> {
  const stored = (listing.abstract ?? '').trim();
  if (stored) return stored.length > ABSTRACT_MAX ? `${stored.slice(0, ABSTRACT_MAX - 3).trim()}...` : stored;
  const bytes = await readAllBytes(kv, r2, listing);
  const derived = bytes ? deriveAbstract(bytes, listing.mime, listing.title) : fallbackAbstract(listing.title);
  await putListing(kv, { ...listing, abstract: derived }).catch(() => {});
  return derived;
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

// --- Owner review guard: ADMIN_KEY only (no accounts, no cookies) ---
// API calls send X-Admin-Key; the /agent-auth page passes ?key=... .
// Fail closed: unset/missing/wrong key → 403.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function requireAdmin(req: Request, env: Env): string {
  const expected = (env.ADMIN_KEY ?? '').trim();
  if (!expected) throw new HttpErr(403, 'forbidden (owner review is not configured)');
  const fromHeader = (req.headers.get('X-Admin-Key') ?? '').trim();
  const fromQuery = (new URL(req.url).searchParams.get('key') ?? '').trim();
  const provided = fromHeader || fromQuery;
  if (!provided || !timingSafeEqual(provided, expected)) {
    throw new HttpErr(403, 'forbidden (owner review requires a valid admin key)');
  }
  return 'admin';
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
  // Accountless publish: no accounts, no email, no cookies. Anyone may
  // publish with zero credentials; the listing is live immediately. The
  // payout address in the body is a public 0x address only — a private
  // key is never sent here.
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
    abstract: deriveAbstract(p.bytes, p.mime, p.title),
    ...(p.source_url ? { source_url: p.source_url } : {}),
  };
  await putBytes(kv, r2, listing, p.bytes, p.b64);
  await putListing(kv, listing);

  const origin = new URL(req.url).origin;
  const url = `${origin}/r/${slug}`;
  const page_url = `${origin}/p/${slug}`;
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  console.log(`[nanotab-publish] published ${slug} (${listing.mime}, ${listing.bytes}B, ${listing.price_cents}c → ${listing.merchant_wallet})`);
  return Response.json(
    { url, page_url, slug, abstract: listing.abstract, x402: { accepts: listing402Body(url, listing, feeBps, feeTo).accepts } },
    { status: 201 }
  );
}

// --- Agentic submissions: agents create paywalls, owner approves daily ---
// POST /v1/agent/submit (X-Agent-Key) stays open to agents (Jev + rate
// limits apply). GET /v1/agent/pending + POST /v1/agent/review are the
// daily review queue, gated by ADMIN_KEY (X-Admin-Key header or ?key=).
// Unapproved links never publish: GET /r/:slug returns 403 while pending
// and 404 once rejected.

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
    abstract: deriveAbstract(p.bytes, p.mime, p.title),
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
  const page_url = `${origin}/p/${slug}`;
  if (auto) {
    console.log(`[nanotab-publish] jev auto-published ${slug} by ${agentName} (spam=${verdict!.spam}, legal=${verdict!.content_legal}, price=${verdict!.price_sane}, quality=${verdict!.quality})`);
    return Response.json(
      { url, page_url, slug, status: 'live', abstract: listing.abstract, jev: verdict, message: 'Auto-published by Jev review: verified agent, clean scores, quality at or above fine.' },
      { status: 201 }
    );
  }
  console.log(`[nanotab-publish] agent submission queued ${slug} by ${agentName} (${listing.mime}, ${listing.bytes}B, ${listing.price_cents}c)${verdict ? ` jev: spam=${verdict.spam}, legal=${verdict.content_legal}, price=${verdict.price_sane}, quality=${verdict.quality}` : ' jev: unavailable, manual review'}`);
  return Response.json(
    { url, page_url, slug, status: 'pending', abstract: listing.abstract, ...(verdict ? { jev: verdict } : {}), message: 'Queued for daily owner review. The link returns 403 until approved; no approval means it never publishes.' },
    { status: 202 }
  );
}

async function handleAgentPending(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  requireAdmin(req, env);
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
  const reviewer = requireAdmin(req, env);
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
  const title = 'Sample: How to keep tomatoes happy in a small garden';
  return { slug: DEMO_SLUG, title, mime: 'text/plain', bytes: bytes.length, r2_key: `r/${DEMO_SLUG}`, price_cents: '5', merchant_wallet: feeRecipientFor(env.FEE_WALLET), created_at: '2026-11-01T00:00:00.000Z', paid_calls: 0, source: 'paste', status: 'live', abstract: deriveAbstract(bytes, 'text/plain', title) };
}

// --- Intent routing: one URL, three audiences ---
// Discovery crawlers must NEVER see a 402 (they would index nothing) and
// must NEVER see the paid body (that would be cloaking). Browsers get the
// same 200 teaser crawlers get. Only transactional callers — an explicit
// Accept: application/json or an agent-style HTTP-client User-Agent —
// receive the 402 price quote. A valid X-Payment always wins and serves
// the full content, on both /r/<slug> and /p/<slug>.
const DISCOVERY_CRAWLER_RE = /(googlebot|bingbot|oai-searchbot|gptbot|perplexitybot|claudebot|google-extended)/i;
const AGENT_UA_RE = /(curl|wget|libcurl|python-requests|python-httpx|httpx|aiohttp|httpie|go-http-client|node-fetch|undici|axios|okhttp|postmanruntime|insomnia|java\/|ruby|php)/i;

function isDiscoveryCrawler(ua: string): boolean {
  return DISCOVERY_CRAWLER_RE.test(ua);
}

// 'teaser' → 200 HTML with the free abstract; 'pay402' → 402 JSON quote.
function classifyUnpaid(req: Request): 'teaser' | 'pay402' {
  const ua = req.headers.get('user-agent') ?? '';
  const accept = (req.headers.get('accept') ?? '').toLowerCase();
  if (isDiscoveryCrawler(ua)) return 'teaser';
  if (accept.includes('application/json')) return 'pay402';
  if (accept.includes('text/html') || accept.includes('application/xhtml+xml')) return 'teaser';
  if (AGENT_UA_RE.test(ua) || /\bnode\b/i.test(ua)) return 'pay402';
  if (/mozilla/i.test(ua)) return 'teaser';
  return 'pay402';
}

// --- GET /r/:slug (transactional) + GET /p/:slug (human/crawler page) ---
async function handleRead(req: Request, env: Env, ctx: ExecutionContext | undefined, slug: string, surface: 'r' | 'p' = 'r'): Promise<Response> {
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
      { error: 'pending approval: this agent-submitted link has not been approved by the owner yet', status: 'pending', slug },
      { status: 403, headers: { 'access-control-allow-origin': '*' } }
    );
  }
  if (listing.status === 'rejected') throw new HttpErr(404, 'listing not found');

  const feeBps = Number(env.NANOTAB_FEE_BPS ?? String(PROTOCOL_FEE_BPS));
  const feeTo = feeRecipientFor(env.FEE_WALLET);
  const header = req.headers.get('X-Payment');
  if (!header) {
    const origin = new URL(req.url).origin;
    if (classifyUnpaid(req) === 'teaser') {
      const abstract = await ensureAbstract(kv, r2, listing);
      return new Response(publicListingHtml(origin, listing, abstract, feeBps, feeTo), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'cache-control': 'public, max-age=60',
          'vary': 'Accept, User-Agent',
          'access-control-allow-origin': '*',
        },
      });
    }
    const payUrl = surface === 'p' ? `${origin}/r/${slug}` : req.url;
    return Response.json(listing402Body(payUrl, listing, feeBps, feeTo), {
      status: 402,
      headers: {
        'content-security-policy': 'sandbox',
        'x-content-type-options': 'nosniff',
        'vary': 'Accept, User-Agent',
        'access-control-allow-origin': '*',
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
<p class="mut">This link was created by an agent (${escHtml(l.agent_name ?? 'agent')}) and is waiting in the owner's daily review queue. It is not published yet — no price terms are served and no payment can unlock it until the owner approves it.</p>
<p class="mut">Are you the owner? Open your bookmarked owner review URL (with your admin key) to review the queue · <a href="/marketplace">Browse published links</a></p>
<p class="mut" style="text-align:center;font-size:13px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p>
</div></div></body></html>`;
}

function agentAuthForbiddenHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Owner review — NanoTab Pay</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif}.wrap{max-width:640px;margin:0 auto;padding:56px 20px}.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}.card{background:#12161c;border:1px solid #232b36;border-radius:14px;padding:32px;margin-top:28px}.kicker{font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:#e86a6a;font-weight:600}h1{font-size:26px;letter-spacing:-.02em;line-height:1.25;margin:10px 0 8px}.mut{color:#9fb0c0;font-size:14.5px}a{color:#3ecf8e}code{background:#0e1218;border:1px solid #232b36;padding:1px 6px;border-radius:6px;font-size:13px}</style></head><body>
<div class="wrap"><a class="logo" href="/"><span>N</span>NanoTab Pay</a><div class="card">
<div class="kicker">403 · Owner only</div>
<h1>Owner review is locked</h1>
<p class="mut">This page is for the site owner only. Open it with your admin key in the URL: <code>/agent-auth?key=YOUR_ADMIN_KEY</code>. There are no accounts and no sign-in — the key in the URL is the only credential, and no session cookie is set.</p>
<p class="mut"><a href="/">Back to NanoTab Pay</a> · <a href="/marketplace">Browse published links</a></p>
</div></div></body></html>`;
}

// Public teaser page (HTTP 200) for browsers AND discovery crawlers.
// Server-rendered free abstract only — the paid body is never in this
// HTML, which is what keeps this from being cloaking: Googlebot and a
// human see exactly the same unpaid page. The locked remainder is marked
// with the single class selector in the JSON-LD hasPart (Google paywall
// guidelines: isAccessibleForFree false, class selectors only, no nested
// content sections).
function jsonLdForListing(origin: string, l: Listing, abstract: string): string {
  const canonical = `${origin}/p/${l.slug}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: l.title,
    description: abstract,
    url: canonical,
    mainEntityOfPage: canonical,
    datePublished: l.created_at,
    inLanguage: 'en',
    isAccessibleForFree: false,
    hasPart: {
      '@type': 'WebPageElement',
      isAccessibleForFree: false,
      cssSelector: '.paywall',
    },
  };
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

function publicListingHtml(origin: string, l: Listing, abstract: string, feeBps: number, feeTo: string): string {
  const priceUsd = (Number(l.price_cents) / 100).toFixed(2);
  const netUsd = ((Number(l.price_cents) * (10_000 - feeBps)) / 10_000 / 100).toFixed(2);
  const shortWallet = `${l.merchant_wallet.slice(0, 6)}…${l.merchant_wallet.slice(-4)}`;
  const canonical = `${origin}/p/${l.slug}`;
  const payUrl = `${origin}/r/${l.slug}`;
  const pageTitle = `${l.title} — NanoTab Pay`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(pageTitle)}</title>
<meta name="description" content="${escHtml(abstract)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${escHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NanoTab Pay">
<meta property="og:title" content="${escHtml(l.title)}">
<meta property="og:description" content="${escHtml(abstract)}">
<meta property="og:url" content="${escHtml(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escHtml(l.title)}">
<meta name="twitter:description" content="${escHtml(abstract)}">
<script type="application/ld+json">${jsonLdForListing(origin, l, abstract)}</script>
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
.btn{display:inline-block;background:#3ecf8e;color:#06281a;font-weight:600;padding:12px 22px;border-radius:10px;text-decoration:none;margin:10px 0}
.preview-label{display:inline-block;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:#0b0d10;background:#3ecf8e;font-weight:700;border-radius:999px;padding:2px 12px;margin:18px 0 10px}
.abstract{font-size:16.5px;line-height:1.7;color:#dbe6f0}
.paywall{border-top:1px solid #232b36;margin-top:24px;padding-top:8px}
.foot{color:#7f8fa3;font-size:13px;text-align:center;margin-top:18px}</style></head><body>
<div class="wrap"><div class="top"><a class="logo" href="/"><span>N</span>NanoTab Pay</a><a href="/marketplace">Marketplace</a></div><div class="card">
<div class="kicker">Paywalled content</div>
<h1>${escHtml(l.title)}</h1>${l.created_by_agent ? '<p class="mut"><span style="display:inline-block;border:1px solid rgba(62,207,142,.45);color:#3ecf8e;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600">Created by agent</span> <span style="font-size:13px">· approved by the owner</span></p>' : ''}
<span class="preview-label">Free preview</span>
<section class="abstract" aria-label="Free preview"><p>${escHtml(abstract)}</p></section>
<div class="paywall">
<div class="price">$${priceUsd} USDC</div>
<p class="mut">per view · on Base · merchant <code>${shortWallet}</code> · seller receives $${netUsd} after ${feeBps / 100}% fee</p>
<p>The preview above is free. The full content unlocks after payment — an AI agent pays automatically, and a person can pay the same way with a USDC wallet on Base. There is no NanoTab account and no card checkout.</p>
<p><a class="btn" href="#unlock">Unlock for $${priceUsd} — pay USDC on Base</a></p>
<div id="unlock">
<p class="mut" style="margin-bottom:6px">How payment works (x402):</p>
<pre>GET ${escHtml(payUrl)}  →  402 + price in JSON
Pay $${priceUsd} USDC on Base → ${escHtml(l.merchant_wallet)}
GET same URL + X-Payment proof  →  200 full content</pre>
<p class="mut">Agents: fetch <code>${escHtml(payUrl)}</code> with <code>Accept: application/json</code> for the machine-readable 402, pay, then retry with the <code>X-Payment</code> header. Humans: use any agent or wallet flow that speaks x402 on Base.</p>
</div>
<p><a href="/marketplace">Browse marketplace</a> · <a href="/">Create your own link</a> · <a href="${escHtml(payUrl)}" id="j">View machine terms (JSON)</a></p>
</div>
</div><p class="foot">${escHtml(l.mime)} · ${l.bytes} bytes · USDC on Base via x402 · NanoTab keeps ${feeBps / 100}% of each payment<br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p></div>
<script>document.getElementById('j').onclick=function(e){e.preventDefault();fetch(${JSON.stringify(payUrl)},{headers:{accept:'application/json'}}).then(function(r){return r.text()}).then(function(t){document.body.innerHTML='<pre style="max-width:860px;margin:24px auto;padding:16px;white-space:pre-wrap;word-break:break-all">'+t.replace(/</g,'&lt;').slice(0,4000)+'</pre>'})};</script>
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
        const abs = (l.abstract ?? '').trim();
        const absHtml = abs ? `<div class="m">${escHtml(abs.length > 220 ? `${abs.slice(0, 220).trim()}…` : abs)}</div>` : '';
        return `<div class="card"><div class="t"><a href="${origin}/p/${l.slug}" style="color:#f2f5f7">${escHtml(l.title)}</a>${badge} <span class="price">$${price}</span></div>${absHtml}<div class="m">${l.paid_calls ?? 0} paid calls · ${escHtml(l.mime)} · seller <code>${escHtml(l.merchant_wallet.slice(0, 6))}…${escHtml(l.merchant_wallet.slice(-4))}</code></div><div class="m"><a href="${origin}/p/${l.slug}">Read free preview</a> · <a href="${origin}/r/${l.slug}">Agent endpoint (402)</a></div></div>`;
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
      page_url: `${origin}/p/${l.slug}`,
      title: l.title,
      ...(l.abstract ? { abstract: l.abstract } : {}),
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
// (Account-based listing management removed: there are no accounts.
// Publishers keep their /r/<slug> + /p/<slug> links — bookmark them.
// There is no per-account dashboard to recover a lost link from.)

// --- GET /publish (API paste form; the accountless flow on / is the primary path) ---
function handlePublishPage(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Publish via API key — NanoTab Pay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0b0d10;color:#f2f5f7;font:16px/1.65 "IBM Plex Sans",system-ui,sans-serif}.wrap{max-width:640px;margin:0 auto;padding:40px 20px 56px}a{color:#3ecf8e}.logo{font-weight:700;color:#f2f5f7;text-decoration:none}.logo span{display:inline-flex;width:26px;height:26px;border-radius:7px;background:#3ecf8e;color:#06281a;align-items:center;justify-content:center;margin-right:8px;font-size:14px}h1{font-size:28px;letter-spacing:-.02em;margin:28px 0 8px}.sub{color:#9fb0c0}.card{background:#12161c;border:1px solid #232b36;border-radius:14px;padding:24px;margin-top:20px}label{display:block;margin:14px 0 5px;color:#9fb0c0;font-size:14px;font-weight:500}input,textarea,select{width:100%;background:#0e1218;border:1px solid #232b36;border-radius:9px;color:#f2f5f7;padding:11px 13px;font-size:15px;font-family:inherit}textarea{font-family:"IBM Plex Mono",monospace;min-height:140px}button{background:#3ecf8e;border:1px solid #3ecf8e;border-radius:10px;color:#06281a;font-weight:600;font-size:15.5px;padding:11px 22px;cursor:pointer;margin-top:16px}pre{background:#0e1218;border:1px solid #232b36;border-radius:10px;padding:14px;white-space:pre-wrap;word-break:break-all;font-size:13px;font-family:"IBM Plex Mono",monospace}</style></head><body>
<div class="wrap"><a class="logo" href="/"><span>N</span>NanoTab Pay</a>
<h1>Publish via API</h1>
<p class="sub">Most people should use the <a href="/">accountless create flow</a> — no account, no email, no key. This page is for automation: it posts to <code>/v1/publish</code> (no credentials needed) and shows the test curl commands. Keep your link — bookmark it after you publish.</p>
<div class="card"><form id="f">
<label>title <input name="title" maxlength="200" required></label>
<label>price (USD) <input name="price" type="number" min="0.01" max="100" step="0.01" required></label>
<label>USDC wallet <input name="wallet" pattern="0x[0-9a-fA-F]{40}" required></label>
<label>mime <select name="mime"><option>text/markdown</option><option>text/plain</option><option>text/html</option><option>application/json</option></select></label>
<label>content <textarea name="body" rows="12" cols="60" required></textarea></label>
<button>publish</button></form>
<pre id="out">Your agent paywall link (HTTP 402) and test commands appear here. Unpaid: curl the link for a 402 with the price. Paid: retry with an X-Payment proof for 200.</pre></div>
<p class="sub">New here? <a href="/">Create a link with no account</a> — you keep 98% hosted (NanoTab keeps 2%), agents pay in USDC on Base. No wallet yet? Generate one in the browser on the create page, or read the <a href="/wallet-guide">plain-English wallet guide</a>.</p><p class="sub" style="text-align:center;font-size:13px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds</a> · <a href="/contact">Contact</a> · <a href="/about">About</a></p></div>
<script>
const f=document.getElementById('f'),out=document.getElementById('out');
f.onsubmit=async(e)=>{e.preventDefault();const d=new FormData(f);
const price_cents=Math.round(parseFloat(d.get('price'))*100);
const body={title:d.get('title'),mime:d.get('mime'),price_cents,
merchant_wallet:d.get('wallet'),body_b64:btoa(unescape(encodeURIComponent(d.get('body'))))};
const hdrs={'content-type':'application/json'};
const r=await fetch('/v1/publish',{method:'POST',headers:hdrs,body:JSON.stringify(body)});
const j=await r.json();
if(!r.ok){out.textContent='error '+r.status+': '+j.error;return;}
const curl='curl -i '+j.url;
out.textContent='agent paywall link (HTTP 402): '+j.url+'\\nexample agent request: '+curl+'  # unpaid -> 402 + price in JSON; pay USDC on Base, retry with X-Payment for 200';};
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

// --- Discovery: robots.txt / llms.txt / sitemap.xml ---
function handleRobots(req: Request): Response {
  const origin = new URL(req.url).origin;
  const body = `# NanoTab Pay — paywall any link; agents pay USDC on Base (x402).
# Every post has a free abstract at /p/<slug> for discovery and citation.
# The full paid body is only served after payment — it is never in the teaser.

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  });
}

function handleLlms(req: Request): Response {
  const origin = new URL(req.url).origin;
  const body = `# NanoTab Pay

> NanoTab Pay lets anyone paywall a link in seconds. Paste content, set a price, and share one link: AI agents pay automatically in USDC on Base (x402 / HTTP 402), and humans can pay the same way. No account is needed to publish or to pay. Sellers keep 98% of every payment; NanoTab keeps 2%.

## What can be paywalled

Articles, guides, reports, research, lists, datasets, and files (text, markdown, HTML, JSON, PDF, PNG, JPEG, up to 1 MB). If you wrote it or have permission to share it, you can charge per view.

## Free abstract on every post

Every paywalled post shows a few sentences free — a real abstract taken from the first sentences of the content (about 200-400 characters of plain text). It is rendered server-side on the post's human page so search engines and AI answer engines can find and quote it without paying. The abstract is labelled "Free preview". Everything past the abstract stays paid: the teaser page never contains the full paid body.

## Where things live

- Human post page (free abstract + unlock): ${origin}/p/<slug>
- Agent payment endpoint (402 -> pay -> 200): ${origin}/r/<slug>
- Create a paywall (no account): ${origin}/
- Browse posts: ${origin}/marketplace
- Machine listing index (JSON, includes each post's abstract and page_url): ${origin}/v1/marketplace.json
- Sitemap (human pages only): ${origin}/sitemap.xml
- Live stats: ${origin}/stats
- x402 discovery: ${origin}/.well-known/x402
- Main site: https://nanotab.dev

## How agents pay (x402, USDC on Base)

1. GET ${origin}/r/<slug> with Accept: application/json (or any agent HTTP client) and no payment: you get HTTP 402 with a JSON price quote (x402 v2: network eip155:8453, asset USDC 0x833589fCD6eDb6E08f4C7c32D4F71B54BdA4B4E5, per-listing amount and payTo wallet, 2% NanoTab fee split).
2. Pay that amount in USDC on Base to the payTo wallet, following the 402 terms.
3. Retry the same URL with an X-Payment proof header: you get HTTP 200 with the full content bytes.

Browsers and discovery crawlers (Googlebot, Bingbot, OAI-SearchBot, GPTBot, PerplexityBot, ClaudeBot) always get HTTP 200 with the free abstract at both /p/<slug> and /r/<slug> — never a 402, and never the paid body. Only callers that ask for JSON or use an agent-style HTTP client get the 402 quote when unpaid.

## Citing a post

Quote the free abstract from ${origin}/p/<slug> and link that canonical page. To read past the preview, pay via the /r/<slug> flow above.
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  });
}

async function handleSitemap(req: Request, env: Env): Promise<Response> {
  const kv = needKv(env);
  const origin = new URL(req.url).origin;
  const keys = await listRKeys(kv);
  const listings = (
    await Promise.all(keys.map(async (k) => (await kv.get(k, 'json').catch(() => null)) as Listing | null))
  )
    .filter((l): l is Listing => !!l?.slug && isLive(l))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const url = (loc: string, lastmod?: string) =>
    `  <url><loc>${escXml(loc)}</loc>${lastmod ? `<lastmod>${escXml(lastmod.slice(0, 10))}</lastmod>` : ''}</url>`;
  const demoDate = '2026-11-01';
  const lines = [
    url(`${origin}/`),
    url(`${origin}/marketplace`),
    url(`${origin}/p/${DEMO_SLUG}`, demoDate),
    url(`${origin}/demo`),
    url(`${origin}/developers`),
    url(`${origin}/wallet-guide`),
    url(`${origin}/about`),
    url(`${origin}/contact`),
    url(`${origin}/terms`),
    url(`${origin}/privacy`),
    url(`${origin}/refunds`),
    ...listings.map((l) => url(`${origin}/p/${l.slug}`, l.created_at)),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  });
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
      if (req.method === 'GET' && pathname === '/developers') {
        return new Response(developersHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' },
        });
      }
      if (req.method === 'GET' && pathname === '/agent-auth') {
        // Owner-only page: ADMIN_KEY via ?key=... (no cookies, no accounts).
        // Missing/wrong key → 403 page, never the queue.
        try {
          requireAdmin(req, env);
        } catch {
          return new Response(agentAuthForbiddenHtml(), {
            status: 403,
            headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' },
          });
        }
        return new Response(agentAuthHtml(), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' },
        });
      }
      if (req.method === 'GET' && ['/terms', '/privacy', '/refunds', '/refund-policy', '/contact', '/about', '/wallet-guide', '/demo'].includes(pathname)) {
        const page = pathname === '/terms' ? termsHtml() : pathname === '/privacy' ? privacyHtml() : pathname === '/contact' ? contactHtml() : pathname === '/about' ? aboutHtml() : pathname === '/wallet-guide' ? walletGuideHtml() : pathname === '/demo' ? demoHtml() : refundsHtml();
        return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' } });
      }
      if (req.method === 'GET' && pathname === '/robots.txt') {
        return handleRobots(req);
      }
      if (req.method === 'GET' && pathname === '/llms.txt') {
        return handleLlms(req);
      }
      if (req.method === 'GET' && pathname === '/sitemap.xml') {
        return await handleSitemap(req, env);
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
      // Account routes were removed entirely — they fall through to 404 below.
      if (req.method === 'GET' && pathname.startsWith('/r/')) {
        const slug = pathname.slice('/r/'.length);
        if (!/^[A-Za-z0-9]{10}$/.test(slug)) {
          return Response.json({ error: 'listing not found' }, { status: 404 });
        }
        return await handleRead(req, env, ctx, slug, 'r');
      }
      if (req.method === 'GET' && pathname.startsWith('/p/')) {
        const slug = pathname.slice('/p/'.length);
        if (!/^[A-Za-z0-9]{10}$/.test(slug)) {
          return Response.json({ error: 'listing not found' }, { status: 404 });
        }
        return await handleRead(req, env, ctx, slug, 'p');
      }

      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': '*, X-Payment, X-Agent-Key, X-Admin-Key',
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
