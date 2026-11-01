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
    delete: async (k) => { store.delete(k); },
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
const AGENT_SECRET = 'agent-secret-456';
const env = { PUBLISH_KEY: SECRET, AGENT_KEY: AGENT_SECRET, NANOTAB_FEE_BPS: '200', NANOTAB_LISTINGS: kv, NANOTAB_CONTENT: r2 };

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

// --- POST /v1/publish: accountless (no login gate) ---
{
  const cleanup = (slug) => {
    try { kv.store.delete(`r:${slug}`); } catch {}
    try { r2.store.delete(`r/${slug}`); } catch {}
    try { kv.store.delete(`rb:${slug}`); } catch {}
  };
  let r = await worker.fetch(post(good(), null), env, {});
  let j = await r.json().catch(() => ({}));
  check('publish: missing auth → 201 anonymous (no login gate)', r.status === 201 && /^[A-Za-z0-9]{10}$/.test(j.slug || '') && j.url === `https://pay.nanotab.dev/r/${j.slug}`, `status=${r.status}`);
  let rec = j.slug ? JSON.parse(await kv.get(`r:${j.slug}`)) : null;
  check('publish: anonymous record live, no owner', !!rec && rec.owner === undefined && rec.status === 'live' && rec.source === 'paste');
  if (j.slug) {
    const g = await worker.fetch(req(`/r/${j.slug}`), env, {});
    check('publish: anonymous link live instantly → 402 (not 401/403)', g.status === 402);
    cleanup(j.slug);
  }
  r = await worker.fetch(post(good(), 'wrong'), env, {});
  j = await r.json().catch(() => ({}));
  check('publish: wrong legacy key still publishes anonymously → 201', r.status === 201 && /^[A-Za-z0-9]{10}$/.test(j.slug || ''), `status=${r.status}`);
  rec = j.slug ? JSON.parse(await kv.get(`r:${j.slug}`)) : null;
  check('publish: wrong-key record has no owner', !!rec && rec.owner === undefined);
  if (j.slug) cleanup(j.slug);
  r = await worker.fetch(post(good()), { ...env, PUBLISH_KEY: undefined }, {});
  j = await r.json().catch(() => ({}));
  check('publish: no key configured + no session → 201 anonymous', r.status === 201 && /^[A-Za-z0-9]{10}$/.test(j.slug || ''), `status=${r.status}`);
  if (j.slug) cleanup(j.slug);
  // A session, when present, associates the listing with the account.
  const tok = 'a'.repeat(64);
  await kv.put(`sess:${tok}`, JSON.stringify({ email: 'owner@example.com', exp: Date.now() + 3600_000 }));
  r = await worker.fetch(req('/v1/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `nt_sess=${tok}` },
    body: JSON.stringify(good()),
  }), env, {});
  j = await r.json().catch(() => ({}));
  check('publish: session publish → 201', r.status === 201 && /^[A-Za-z0-9]{10}$/.test(j.slug || ''), `status=${r.status}`);
  rec = j.slug ? JSON.parse(await kv.get(`r:${j.slug}`)) : null;
  check('publish: session record carries owner hash', !!rec && typeof rec.owner === 'string' && /^[0-9a-f]{64}$/.test(rec.owner) && rec.status === 'live');
  if (j.slug) cleanup(j.slug);
  await kv.delete(`sess:${tok}`).catch(() => {});
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

// --- Content negotiation: browsers get HTML, agents get JSON ---
{
  const htmlRes = await worker.fetch(req(`/r/${slug}`, { headers: { accept: 'text/html,application/xhtml+xml' } }), env, {});
  const htmlBody = await htmlRes.text();
  check('get: browser Accept → 402 HTML paywall',
    htmlRes.status === 402 && (htmlRes.headers.get('content-type') || '').includes('text/html') &&
    htmlBody.includes('USDC') && htmlBody.includes('402'));
  const jsonRes = await worker.fetch(req(`/r/${slug}`, { headers: { accept: 'application/json' } }), env, {});
  check('get: JSON Accept → 402 JSON', jsonRes.status === 402 && (jsonRes.headers.get('content-type') || '').includes('json'));
  const starRes = await worker.fetch(req(`/r/${slug}`), env, {});
  check('get: no Accept → 402 JSON (agent default)', starRes.status === 402);
  const mktPage = await worker.fetch(req('/marketplace'), env, {});
  const mktHtml = await mktPage.text();
  check('page: /marketplace → 200 HTML', mktPage.status === 200 && mktHtml.includes('Marketplace') && mktHtml.includes(slug));
  const home = await worker.fetch(req('/'), env, {});
  const homeHtml = await home.text();
  check('page: / → 200 landing with paywall headline', home.status === 200 && homeHtml.includes('Paywall Any Link in seconds'));
  check('page: / step-flow (link → content/upload → price → wallet → Publish, no login gate)',
    homeHtml.includes('id="p-link"') && homeHtml.includes('id="p-body"') && homeHtml.includes('id="p-file"') &&
    homeHtml.includes('id="p-price"') && homeHtml.includes('id="p-payto"') && homeHtml.includes('Publish link') &&
    !homeHtml.includes('/login?next=') && !homeHtml.includes('sign in at the end'));
  check('page: / instant wallet (generate button, one-time key panel, honest copy)',
    homeHtml.includes('Generate instant wallet') && homeHtml.includes('id="btn-generate-wallet"') &&
    homeHtml.includes('id="wallet-panel"') && homeHtml.includes('This key controls your payouts') &&
    homeHtml.includes('Anyone who has it can take the money') && homeHtml.includes('Store it in a password manager') &&
    homeHtml.includes('We cannot recover it') && homeHtml.includes('Save on this device') &&
    homeHtml.includes("Don't save on this device") && homeHtml.includes('No account needed') &&
    homeHtml.includes('USDC on the Base network') && homeHtml.includes('funds at that address are lost'));
  check('page: / private-key guards (masked field, no autocomplete, publish JS never sends the key)',
    homeHtml.includes('id="p-pk" type="password"') && homeHtml.includes('autocomplete="off"') &&
    homeHtml.includes('togglePkVisibility') && homeHtml.includes('saveWalletOnDevice') &&
    !homeHtml.includes("location.href='/login?next="));
  check('page: / publish success surfaces 402 agent link + copyable curl',
    homeHtml.includes('Agent paywall link (HTTP 402)') && homeHtml.includes('Copy paywall link') &&
    homeHtml.includes('curl -i'));
  check('page: / demotes developers to labelled secondary path',
    homeHtml.includes('For developers') && homeHtml.includes('href="/developers"'));
  const login = await worker.fetch(req('/login'), env, {});
  const loginHtml = await login.text();
  check('page: /login → 200 optional sign-in for managing links (not a publish gate)',
    login.status === 200 && loginHtml.includes('Sign in to manage links') && loginHtml.includes('Publishing needs no account') &&
    loginHtml.includes('/v1/auth/request') && !loginHtml.includes('id="p-body"'));
  const devs = await worker.fetch(req('/developers'), env, {});
  const devsHtml = await devs.text();
  check('page: /developers → 200 developer path',
    devs.status === 200 && devsHtml.includes('For developers') && devsHtml.includes('nanotab protect') &&
    devsHtml.includes('/v1/agent/submit') && devsHtml.includes('/agent-auth'));
  const queue = await worker.fetch(req('/agent-auth'), env, {});
  const queueHtml = await queue.text();
  check('page: /agent-auth → 200 daily review queue shell',
    queue.status === 200 && queueHtml.includes('Agent authorization queue') && queueHtml.includes('/v1/agent/pending') &&
    queueHtml.includes('/v1/agent/review'));
}

// --- GET /publish + 404 ---
{
  const r = await worker.fetch(req('/publish'), env, {});
  const html = await r.text();
  check('page: /publish → 200 HTML form',
    r.status === 200 && (r.headers.get('content-type') || '').includes('text/html') &&
    html.includes('<form') && html.includes('price') && html.includes('wallet') &&
    html.includes('textarea') && html.includes('/v1/publish') &&
    html.includes('curl'));
  const r2not = await worker.fetch(req('/nope'), env, {});
  check('404: unknown route → 404 JSON', r2not.status === 404 && typeof (await r2not.json()).error === 'string');
}

// --- Agentic submissions: queued pending, 403 until owner approves ---
{
  const agentPost = (path, body, key = AGENT_SECRET) => req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key !== null ? { 'X-Agent-Key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const agentBody = {
    title: 'agent dataset drop', mime: 'text/markdown', price_cents: 25,
    merchant_wallet: WALLET, body_b64: Buffer.from('# agent paid content').toString('base64'),
    agent_name: 'selftest-agent', source_url: 'https://example.com/dataset',
  };

  let r = await worker.fetch(agentPost('/v1/agent/submit', agentBody, null), env, {});
  check('agent: submit without key → 401', r.status === 401);
  r = await worker.fetch(agentPost('/v1/agent/submit', agentBody, 'wrong'), env, {});
  check('agent: submit wrong key → 401', r.status === 401);
  r = await worker.fetch(agentPost('/v1/agent/submit', { ...agentBody, merchant_wallet: '0xZZZ' }), env, {});
  check('agent: submit bad wallet → 400', r.status === 400);

  r = await worker.fetch(agentPost('/v1/agent/submit', agentBody), env, {});
  const aj = await r.json();
  check('agent: submit valid → 202 pending', r.status === 202 && aj.status === 'pending' && /^[A-Za-z0-9]{10}$/.test(aj.slug || ''), JSON.stringify(aj).slice(0, 140));
  const aslug = aj.slug;
  const arec = JSON.parse(await kv.get(`r:${aslug}`));
  check('agent: KV record pending + agent badge fields',
    arec.status === 'pending' && arec.source === 'agent' && arec.created_by_agent === true &&
    arec.agent_name === 'selftest-agent' && arec.source_url === 'https://example.com/dataset');

  // Unapproved: 403 for agents and browsers, never 402 terms or content.
  r = await worker.fetch(req(`/r/${aslug}`), env, {});
  const pend = await r.json();
  check('agent: pending fetch → 403 pending (no payTo leak)', r.status === 403 && pend.status === 'pending' && !JSON.stringify(pend).includes(WALLET));
  r = await worker.fetch(req(`/r/${aslug}`, { headers: { accept: 'text/html' } }), env, {});
  check('agent: pending browser fetch → 403 HTML', r.status === 403 && (await r.text()).includes('Pending approval'));
  r = await worker.fetch(req(`/r/${aslug}`, { headers: { 'X-Payment': 'AAAA' } }), env, {});
  check('agent: pending fetch with payment header → still 403', r.status === 403);
  let mkt = await (await worker.fetch(req('/v1/marketplace.json'), env, {})).json();
  check('agent: marketplace excludes pending', !mkt.some((e) => e.url.endsWith(`/r/${aslug}`)));

  // Review queue is owner-gated.
  r = await worker.fetch(req('/v1/agent/pending'), env, {});
  check('agent: pending list without auth → 401', r.status === 401);
  r = await worker.fetch(req('/v1/agent/pending', { headers: { 'X-Nanotab-Key': SECRET } }), env, {});
  const queue = await r.json();
  check('agent: pending list with reviewer key → 200 with submission',
    r.status === 200 && Array.isArray(queue) && queue.some((e) => e.slug === aslug && e.agent_name === 'selftest-agent'));

  const review = (body, key = SECRET) => req('/v1/agent/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key !== null ? { 'X-Nanotab-Key': key } : {}) },
    body: JSON.stringify(body),
  });
  r = await worker.fetch(review({ slug: aslug, action: 'maybe' }), env, {});
  check('agent: review bad action → 400', r.status === 400);
  r = await worker.fetch(review({ slug: aslug, action: 'approve' }, null), env, {});
  check('agent: review without auth → 401', r.status === 401);
  r = await worker.fetch(review({ slug: aslug, action: 'approve' }), env, {});
  const rv = await r.json();
  check('agent: approve → 200 live', r.status === 200 && rv.status === 'live', JSON.stringify(rv).slice(0, 120));
  r = await worker.fetch(review({ slug: aslug, action: 'approve' }), env, {});
  check('agent: re-review approved → 409', r.status === 409);

  // Approved: normal 402 flow + badge surfaces.
  r = await worker.fetch(req(`/r/${aslug}`), env, {});
  check('agent: approved fetch → 402 paywall', r.status === 402);
  r = await worker.fetch(req(`/r/${aslug}`, { headers: { accept: 'text/html' } }), env, {});
  check('agent: approved paywall shows Created by agent badge', r.status === 402 && (await r.text()).includes('Created by agent'));
  mkt = await (await worker.fetch(req('/v1/marketplace.json'), env, {})).json();
  const hit = mkt.find((e) => e.url.endsWith(`/r/${aslug}`));
  check('agent: marketplace lists approved with badge flag', !!hit && hit.created_by_agent === true);

  // Rejected: never publishes, reads as unknown.
  r = await worker.fetch(agentPost('/v1/agent/submit', { ...agentBody, title: 'spammy agent drop' }), env, {});
  const rslug = (await r.json()).slug;
  r = await worker.fetch(review({ slug: rslug, action: 'reject' }), env, {});
  check('agent: reject → 200 rejected', r.status === 200 && (await r.json()).status === 'rejected');
  r = await worker.fetch(req(`/r/${rslug}`), env, {});
  check('agent: rejected fetch → 404', r.status === 404);
  mkt = await (await worker.fetch(req('/v1/marketplace.json'), env, {})).json();
  check('agent: marketplace excludes rejected', !mkt.some((e) => e.url.endsWith(`/r/${rslug}`)));

  // Human links still publish instantly alongside the queue.
  const rec = JSON.parse(await kv.get(`r:${slug}`));
  check('human: earlier publish is live instantly', rec.status === 'live' && rec.source === 'paste');
}

// --- Magic-link next redirect (login funnel) ---
{
  let r = await worker.fetch(req('/v1/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', next: '/agent-auth' }),
  }), env, {});
  const j = await r.json();
  check('auth: dev-mode request returns link', r.status === 200 && typeof j.link === 'string');
  const token = new URL(j.link).searchParams.get('token');
  r = await worker.fetch(req(`/v1/auth/verify?token=${token}`), env, {});
  check('auth: verify redirects to requested next', r.status === 302 && (r.headers.get('location') || '').endsWith('/agent-auth'));
  const cookie = r.headers.get('set-cookie') || '';
  check('auth: verify sets session cookie', cookie.includes('nt_sess='));
  const sess = cookie.match(/nt_sess=([0-9a-f]{64})/)?.[1];
  r = await worker.fetch(req('/v1/agent/pending', { headers: { cookie: `nt_sess=${sess}` } }), env, {});
  check('auth: owner session can read review queue', r.status === 200);
  // Open-redirect guard: external next falls back to /.
  r = await worker.fetch(req('/v1/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', next: 'https://evil.example/phish' }),
  }), env, {});
  const j2 = await r.json();
  const t2 = new URL(j2.link).searchParams.get('token');
  r = await worker.fetch(req(`/v1/auth/verify?token=${t2}`), env, {});
  check('auth: external next rejected → /', r.status === 302 && new URL(r.headers.get('location')).pathname === '/');
}

process.exit(fail ? 1 : 0);
