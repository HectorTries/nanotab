// Self-test: `node test/selftest.mjs` (npm test). Fully offline —
// drives the publish worker's handlers with mocked KV/R2 env bindings.
import worker from '../src/index.ts';
import { splitPaymentMessage } from '../../../packages/x402-verify/src/index.ts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const USDC = '0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913';
const WALLET = '0xb157000000000000000000000000000000000001';
const SECRET = 'test-secret-123';

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
    list: async ({ prefix = '' } = {}) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
};
const mkR2 = () => {
  const store = new Map();
  return {
    store,
    put: async (k, v) => { store.set(k, v); },
    get: async (k) => (store.has(k) ? { body: store.get(k), size: store.get(k).length } : null),
  };
};
const kv = mkKV();
const r2 = mkR2();
const env = { PUBLISH_KEY: SECRET, NANOTAB_FEE_BPS: '200', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: r2 };

let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };
const req = (path, init = {}) => new Request(`https://pay.nanotab.dev${path}`, init);
const post = (body, secret = SECRET) => req('/v1/publish', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret !== null ? { ['X-Nanotab-Key']: secret } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const good = () => ({
  title: 'Q3 keyword pack', mime: 'text/markdown', price_cents: 5,
  merchant_wallet: WALLET, body_b64: Buffer.from('# hello\npaid content').toString('base64'),
});

// --- POST /v1/publish: auth ---
{
  let r = await worker.fetch(post(good(), null), env, {});
  check('publish: missing auth → 401', r.status === 401);
  r = await worker.fetch(post(good(), 'wrong'), env, {});
  check('publish: wrong secret → 401', r.status === 401);
  // Fail closed when no secret configured.
  r = await worker.fetch(post(good()), { ...env, PUBLISH_KEY: undefined }, {});
  check('publish: no secret configured → 500 (fail closed)', r.status === 500);
}

// --- POST /v1/publish: validation → 400 ---
{
  const cases = [
    ['bad mime', { ...good(), mime: 'video/mp4' }],
    ['bad wallet', { ...good(), merchant_wallet: '0xZZZ' }],
    ['price 0', { ...good(), price_cents: 0 }],
    ['price 10001', { ...good(), price_cents: 10001 }],
    ['price non-int', { ...good(), price_cents: 1.5 }],
    ['missing title', { ...good(), title: '' }],
    ['bad base64', { ...good(), body_b64: '!!!' }],
    ['oversize', { ...good(), body_b64: Buffer.alloc(1024 * 1024 + 1).toString('base64') }],
  ];
  for (const [name, body] of cases) {
    const r = await worker.fetch(post(body), env, {});
    const j = await r.json().catch(() => ({}));
    check(`publish: ${name} → 400 JSON`, r.status === 400 && typeof j.error === 'string', `status=${r.status}`);
  }
  const r = await worker.fetch(post('not-json{'), env, {});
  check('publish: invalid JSON → 400', r.status === 400);
}

// --- POST /v1/publish: success ---
let slug, url;
{
  const r = await worker.fetch(post(good()), env, {});
  const j = await r.json();
  check('publish: valid → 201', r.status === 201, JSON.stringify(j).slice(0, 120));
  slug = j.slug;
  url = j.url;
  check('publish: slug 10x[alnum]', typeof slug === 'string' && /^[A-Za-z0-9]{10}$/.test(slug));
  check('publish: url = origin/r/slug', url === `https://pay.nanotab.dev/r/${slug}`);
  check('publish: x402 echoes price+wallet',
    JSON.stringify(j.x402?.accepts?.[0]||'').includes(WALLET));
  check('publish: 201 x402 accepts shape',
    j.x402?.accepts?.[0]?.scheme === 'exact' && j.x402?.accepts?.[0]?.payTo === WALLET &&
    typeof j.x402?.accepts?.[0]?.amount === 'string');
  const rec = JSON.parse(await kv.get(`r:${slug}`));
  check('publish: KV record schema (paste, price, wallet, r2_key)',
    rec.slug === slug && rec.source === 'paste' && rec.price_cents === '5' &&
    rec.merchant_wallet === WALLET && rec.r2_key === `r/${slug}` &&
    rec.title === 'Q3 keyword pack' && rec.mime === 'text/markdown' &&
    rec.paid_calls === 0 && typeof rec.created_at === 'string');
  const obj = r2.store.get(`r/${slug}`);
  check('publish: R2 bytes stored', obj && Buffer.from(obj).toString() === '# hello\npaid content');
  const mkt = await (await worker.fetch(req('/v1/marketplace.json'), env, {})).json();
  check('publish: marketplace lists slug', Array.isArray(mkt) && mkt.some((e) => e.url === url));
}

// --- GET /r/:slug ---
{
  let r = await worker.fetch(req(`/r/${slug}`), env, {});
  check('get: no X-Payment → 402', r.status === 402);
  const ch = await r.json();
  check('get: 402 shape (v2, eip155:8453, per-listing payTo/amount, canonical url)',
    ch.x402Version === 2 && ch.resource?.url === url &&
    ch.accepts?.[0]?.network === 'eip155:8453' && ch.accepts[0].asset === USDC &&
    ch.accepts[0].payTo === WALLET && ch.accepts[0].amount === '50000' &&
    typeof ch.accepts[0].feeTo === 'string');
  check('get: 402 nosniff + sandbox',
    r.headers.get('x-content-type-options') === 'nosniff' &&
    (r.headers.get('content-security-policy') || '').includes('sandbox'));

  r = await worker.fetch(req('/r/doesnotexist'), env, {});
  check('get: unknown slug → 404 JSON', r.status === 404 && typeof (await r.json()).error === 'string');

  // Underpay proof → 402 error.
  const bad = Buffer.from(JSON.stringify({
    amount: '1', to: WALLET, asset: USDC, network: 'base', signature: '0xBAD',
    split: { feeTo: '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b', feeAmount: '200', merchantAmount: '9800' },
  })).toString('base64');
  r = await worker.fetch(req(`/r/${slug}`, { headers: { 'X-Payment': bad } }), env, {});
  check('get: underpay proof → 402', r.status === 402);

  // Valid signed proof (no txHash → authorized-logged) → 200 with bytes.
  const acct = privateKeyToAccount(generatePrivateKey());
  const split = { feeTo: '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b', feeAmount: '1000', merchantAmount: '49000' };
  const proof = {
    amount: '5', to: WALLET, asset: USDC, network: 'base', from: acct.address, split,
    signature: await acct.signMessage({
      message: splitPaymentMessage({ to: WALLET, amount: '5', asset: USDC, feeTo: split.feeTo, feeAmount: split.feeAmount, merchantAmount: split.merchantAmount }),
    }),
  };
  const goodPay = Buffer.from(JSON.stringify(proof)).toString('base64');
  r = await worker.fetch(req(`/r/${slug}`, { headers: { 'X-Payment': goodPay } }), env, {});
  const body = await r.text();
  check('get: valid payment → 200 content', r.status === 200 && body === '# hello\npaid content', `status=${r.status}`);
  check('get: content-type + nosniff + x-nanotab headers',
    r.headers.get('content-type') === 'text/markdown' &&
    r.headers.get('x-content-type-options') === 'nosniff' &&
    r.headers.get('x-nanotab') === 'authorized-logged' &&
    typeof r.headers.get('x-nanotab-settle') === 'string');
  const rec = JSON.parse(await kv.get(`r:${slug}`));
  check('get: paid_calls incremented', rec.paid_calls === 1);
}

// --- GET /v1/marketplace.json ---
{
  const r = await worker.fetch(req('/v1/marketplace.json'), env, {});
  const j = await r.json();
  check('marketplace: 200 array with entry',
    r.status === 200 && Array.isArray(j) && j.length === 1 &&
    j[0].url === url && j[0].title === 'Q3 keyword pack' &&
    j[0].price_usd === '0.05' && j[0].mime === 'text/markdown' && j[0].merchant === WALLET,
    JSON.stringify(j).slice(0, 160));
}

// --- GET /publish + 404 ---
{
  const r = await worker.fetch(req('/publish'), env, {});
  const html = await r.text();
  check('page: /publish → 200 HTML form',
    r.status === 200 && (r.headers.get('content-type') || '').includes('text/html') &&
    html.includes('<form') && html.includes('price') && html.includes('wallet') &&
    html.includes('secret') && html.includes('textarea') && html.includes('/v1/publish') &&
    html.includes('curl'));
  const r2not = await worker.fetch(req('/nope'), env, {});
  check('404: unknown route → 404 JSON', r2not.status === 404 && typeof (await r2not.json()).error === 'string');
}

process.exit(fail ? 1 : 0);
