// Jev auto-reviewer self-test: `node test/selftest-jev.mjs`.
// Offline: stubs the TypeSafe API via global fetch, drives the real worker
// handlers with mocked KV/R2. Covers auto-publish, held, fail-open and the
// code hard blocks (blocklist, rate limit, rejected resubmission).
import worker from '../src/index.ts';

const WALLET = '0xb157000000000000000000000000000000000001';
const SECRET = 'test-secret-123';
const AGENT_SECRET = 'agent-secret-456';

const mkKV = () => {
  const store = new Map();
  return {
    store,
    get: async (k, type) => {
      if (!store.has(k)) return null;
      const v = store.get(k);
      return type === 'json' ? JSON.parse(v) : v;
    },
    put: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
};
const mkR2 = () => {
  const store = new Map();
  return {
    store,
    put: async (k, v) => { store.set(k, v); },
    get: async (k) => (store.has(k) ? { body: store.get(k) } : null),
    delete: async (k) => { store.delete(k); },
  };
};

// --- TypeSafe stub: mode decides the verdict the real Jev API would give ---
let jevMode = 'clean';
let jevCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.typesafe.ai/')) return realFetch(url, init);
  jevCalls++;
  const body = JSON.parse(init.body);
  if (body.model !== 'jev-latest' || !body.questions?.spam || !body.questions?.content_legal || !body.questions?.price_sane || !body.questions?.quality) {
    throw new Error('worker sent a malformed Jev request');
  }
  // Spec request shape: state {url, title, content_excerpt<=2000, price, agent_id},
  // noul questions with exact instructions, quality score with exact criteria.
  const s = body.state ?? {};
  const shapeOk = typeof s.url === 'string' && typeof s.title === 'string'
    && typeof s.content_excerpt === 'string' && s.content_excerpt.length <= 2000
    && s.price !== undefined && typeof s.agent_id === 'string'
    && body.questions.spam.type === 'noul' && body.questions.spam.instructions === 'Is this submitted paywall content spam or abusive?'
    && body.questions.content_legal.type === 'noul' && body.questions.content_legal.instructions === 'Is this benign, lawful content?'
    && body.questions.price_sane.type === 'noul' && body.questions.price_sane.instructions === 'Is this price plausible for this content type (no extreme gouging or rate-limit abuse)?'
    && body.questions.quality.type === 'score' && body.questions.quality.instructions === 'Does the content genuinely match what the link title promises?'
    && JSON.stringify(body.questions.quality.criteria) === JSON.stringify(['junk/mismatch', 'weak', 'fine', 'good', 'excellent']);
  if (!shapeOk) throw new Error('worker sent a non-spec Jev request shape');
  if (jevMode === 'error') return new Response('boom', { status: 500 });
  const MODES = {
    clean: {
      spam: { type: 'noul', noul: 0.01 },
      content_legal: { type: 'noul', noul: 0.99 },
      price_sane: { type: 'noul', noul: 0.95 },
      quality: { type: 'score', score: 3.2, confidence: 0.9, legend: {}, probabilities: { '0': 0, '1': 0.05, '2': 0.15, '3': 0.8, '4': 0 } },
    },
    fine: {
      spam: { type: 'noul', noul: 0.05 },
      content_legal: { type: 'noul', noul: 0.9 },
      price_sane: { type: 'noul', noul: 0.9 },
      quality: { type: 'score', score: 2.0, confidence: 0.7, legend: {}, probabilities: { '0': 0, '1': 0.1, '2': 0.8, '3': 0.1, '4': 0 } },
    },
    weakclean: {
      spam: { type: 'noul', noul: 0.01 },
      content_legal: { type: 'noul', noul: 0.99 },
      price_sane: { type: 'noul', noul: 0.95 },
      quality: { type: 'score', score: 1.1, confidence: 0.7, legend: {}, probabilities: { '0': 0.1, '1': 0.8, '2': 0.1, '3': 0, '4': 0 } },
    },
    spamboundary: {
      spam: { type: 'noul', noul: 0.2 },
      content_legal: { type: 'noul', noul: 0.99 },
      price_sane: { type: 'noul', noul: 0.95 },
      quality: { type: 'score', score: 3.0, confidence: 0.9, legend: {}, probabilities: { '0': 0, '1': 0, '2': 0.1, '3': 0.9, '4': 0 } },
    },
    spammy: {
      spam: { type: 'noul', noul: 0.92 },
      content_legal: { type: 'noul', noul: 0.4 },
      price_sane: { type: 'noul', noul: 0.3 },
      quality: { type: 'score', score: 0.2, confidence: 0.85, legend: {}, probabilities: { '0': 0.85, '1': 0.1, '2': 0.05, '3': 0, '4': 0 } },
    },
  };
  const answers = MODES[jevMode] ?? MODES.spammy;
  return Response.json({ model: 'jev-test', answers, usage: { input_tokens: 1, output_tokens: 1 } });
};

let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };
const req = (path, init = {}) => new Request(`https://pay.nanotab.dev${path}`, init);
const submit = (env, body, key = AGENT_SECRET) => worker.fetch(req('/v1/agent/submit', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Agent-Key': key },
  body: JSON.stringify(body),
}), env, {});
const goodBody = (over = {}) => ({
  title: 'Q3 keyword pack — 500 terms with volume & CPC',
  mime: 'text/markdown',
  price_cents: 25,
  merchant_wallet: WALLET,
  body_b64: Buffer.from('# Q3 keyword pack\n\n500 researched terms with search volume and CPC data.').toString('base64'),
  agent_name: 'selftest-agent',
  source_url: 'https://example.com/q3-keywords',
  ...over,
});

// 1. Clean case from a verified agent -> auto-publish instantly.
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'clean'; jevCalls = 0;
  const r = await submit(env, goodBody());
  const j = await r.json();
  check('jev clean: submit -> 201 live', r.status === 201 && j.status === 'live', JSON.stringify(j).slice(0, 160));
  check('jev clean: verdict stored in response', j.jev?.spam === 0.01 && j.jev?.quality === 'good' && j.jev?.decision === 'auto-publish');
  check('jev clean: one Jev call with all questions', jevCalls === 1);
  const rec = JSON.parse(await kv.get(`r:${j.slug}`));
  check('jev clean: KV record live + jev scores', rec.status === 'live' && rec.jev?.content_legal === 0.99 && rec.reviewed_by === 'jev-auto');
  const read = await worker.fetch(req(`/r/${j.slug}`), env, {});
  check('jev clean: auto-published link serves 402 paywall', read.status === 402);
  const mkt = await (await worker.fetch(req('/v1/marketplace.json'), env, {})).json();
  check('jev clean: marketplace lists auto-published link', mkt.some((e) => e.url.endsWith(`/r/${j.slug}`)));
}

// 2. Spammy case -> held for review with scores stored and shown in queue.
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'spammy';
  const r = await submit(env, goodBody({ title: 'FREE MONEY CLICK NOW', source_url: 'https://example.com/free-money' }));
  const j = await r.json();
  check('jev spammy: submit -> 202 pending', r.status === 202 && j.status === 'pending', JSON.stringify(j).slice(0, 160));
  check('jev spammy: verdict stored (spam + junk quality)', j.jev?.spam === 0.92 && j.jev?.quality === 'junk/mismatch' && j.jev?.decision === 'held');
  const read = await worker.fetch(req(`/r/${j.slug}`), env, {});
  check('jev spammy: held link -> 403', read.status === 403);
  const q = await worker.fetch(req('/v1/agent/pending', { headers: { 'X-Nanotab-Key': SECRET } }), env, {});
  const queue = await q.json();
  const row = queue.find((e) => e.slug === j.slug);
  check('jev spammy: queue row carries jev flag + scores', !!row?.jev && row.jev.spam === 0.92 && row.agent_verified === true);
}

// 3. Fail-open: missing key and API error both land in the manual queue.
for (const [name, envExtra, mode] of [
  ['missing key', {}, 'clean'],
  ['API 500', { TYPESAFE_API_KEY: 'test-key' }, 'error'],
]) {
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2(), ...envExtra };
  jevMode = mode;
  const r = await submit(env, goodBody({ source_url: `https://example.com/failopen-${name.replace(/\s/g, '-')}` }));
  const j = await r.json();
  check(`jev fail-open (${name}): submit -> 202 pending, no jev`, r.status === 202 && j.status === 'pending' && j.jev === undefined);
}

// 4. Unverified agent (VERIFIED_AGENTS set, agent not listed) never auto-publishes.
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', VERIFIED_AGENTS: 'someone-else', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'clean';
  const r = await submit(env, goodBody({ source_url: 'https://example.com/unverified' }));
  const j = await r.json();
  check('jev unverified: clean scores still held', r.status === 202 && j.status === 'pending' && j.jev?.decision === 'held');
}

// 5. Hard blocks skip Jev entirely.
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'clean'; jevCalls = 0;
  const r = await submit(env, goodBody({ source_url: 'https://spam.example/win' }));
  check('hard block: spam blocklist domain -> 403, Jev skipped', r.status === 403 && jevCalls === 0, `status=${r.status}`);
}
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  let last;
  for (let i = 0; i < 11; i++) {
    last = await submit(env, goodBody({ title: `pack ${i}`, source_url: `https://example.com/pack-${i}` }));
    if (i < 10 && last.status !== 202) break;
  }
  check('hard block: 11th submission in an hour -> 429', last.status === 429, `status=${last.status}`);
}
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'spammy';
  const r1 = await submit(env, goodBody({ source_url: 'https://example.com/rejected-once' }));
  const slug = (await r1.json()).slug;
  const rv = await worker.fetch(req('/v1/agent/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Nanotab-Key': SECRET },
    body: JSON.stringify({ slug, action: 'reject' }),
  }), env, {});
  check('hard block setup: owner rejects submission', rv.status === 200);
  jevCalls = 0;
  const r2 = await submit(env, goodBody({ source_url: 'https://example.com/rejected-once' }));
  check('hard block: rejected URL resubmission -> 403, Jev skipped', r2.status === 403 && jevCalls === 0, `status=${r2.status}`);
}

// 6. Threshold edges: quality exactly 'fine' publishes; 'weak' or spam==0.2 held.
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'fine';
  const r = await submit(env, goodBody({ source_url: 'https://example.com/edge-fine' }));
  const j = await r.json();
  check('jev edge: quality fine + clean nouls -> auto-publish', r.status === 201 && j.jev?.quality === 'fine', JSON.stringify(j).slice(0, 160));
}
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'weakclean';
  const r = await submit(env, goodBody({ source_url: 'https://example.com/edge-weak' }));
  const j = await r.json();
  check('jev edge: quality weak held despite clean nouls', r.status === 202 && j.status === 'pending' && j.jev?.quality === 'weak');
}
{
  const kv = mkKV();
  const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, TYPESAFE_API_KEY: 'test-key', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: mkR2() };
  jevMode = 'spamboundary';
  const r = await submit(env, goodBody({ source_url: 'https://example.com/edge-spam' }));
  const j = await r.json();
  check('jev edge: spam exactly 0.2 held (needs <0.2)', r.status === 202 && j.status === 'pending' && j.jev?.spam === 0.2);
}

console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
process.exit(fail ? 1 : 0);
