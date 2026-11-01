// Smoke test: run `wrangler dev` in workers/publish first (local mode
// emulates KV/R2 automatically), then:
//   PUBLISH_URL=http://localhost:8788 npm test
// Publishing needs no credentials — there are no accounts.
const PUB = process.env.PUBLISH_URL || 'http://localhost:8788';
const MERCHANT = '0x2222222222222222222222222222222222222222';
const PROTOCOL = '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b';
const USDC = '0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913';

const j = async (r) => ({ status: r.status, body: await r.text() });
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };
const b64 = (s) => Buffer.from(s).toString('base64');

// 1. publish a markdown paste at 5c
const pubBody = {
  title: 'smoke keyword pack',
  mime: 'text/markdown',
  price_cents: 5,
  merchant_wallet: MERCHANT,
  body_b64: b64('# hello\npaid markdown\n'),
};
let r = await fetch(`${PUB}/v1/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(pubBody),
});
let t = await j(r);
let slug = '';
try {
  const s = JSON.parse(t.body);
  slug = s.slug || '';
  check('publish → 201 + slug + url + x402',
    r.status === 201 && /^[A-Za-z0-9]{10}$/.test(slug) &&
    s.url === `${PUB}/r/${slug}` && Array.isArray(s.x402?.accepts),
    t.body.slice(0, 120));
} catch { check('publish → 201 JSON', false, t.body.slice(0, 120)); }

// 2. read without payment → 402, gateway-shaped, per-listing terms
if (slug) {
  r = await fetch(`${PUB}/r/${slug}`);
  t = await j(r);
  try {
    const s = JSON.parse(t.body);
    check('no-header → 402 x402Version 2', r.status === 402 && s.x402Version === 2, t.body.slice(0, 80));
    check('402 per-listing terms (payTo/amount/fee/asset)',
      s.accepts?.[0]?.payTo === MERCHANT && s.accepts[0].amount === '50000' &&
      s.accepts[0].asset === USDC && s.accepts[0].feeTo === PROTOCOL &&
      s.accepts[0].network === 'eip155:8453' && s.resource?.url?.endsWith(`/r/${slug}`));
  } catch { check('402 JSON', false, t.body.slice(0, 120)); }
}

// 3. marketplace contains the listing
r = await fetch(`${PUB}/v1/marketplace.json`);
t = await j(r);
try {
  const s = JSON.parse(t.body);
  const hit = Array.isArray(s) && slug && s.find((e) => e.url === `${PUB}/r/${slug}`);
  check('marketplace.json contains slug', r.status === 200 && !!hit, t.body.slice(0, 120));
  if (hit) check('marketplace entry shape', hit.title === pubBody.title && hit.price_usd === '0.05' && hit.mime === 'text/markdown');
} catch { check('marketplace.json JSON', false, t.body.slice(0, 120)); }

// 4. bad wallet → 400
r = await fetch(`${PUB}/v1/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...pubBody, merchant_wallet: '0xSHORT' }),
});
check('bad-wallet → 400', r.status === 400, (await r.text()).slice(0, 80));

// 5. accountless: no key at all → 201 (publishing needs no account/login)
r = await fetch(`${PUB}/v1/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...pubBody, title: 'smoke anonymous pack' }),
});
{
  const t2 = await r.text();
  let anonSlug = '';
  try { anonSlug = JSON.parse(t2).slug || ''; } catch {}
  check('no-auth publish → 201 anonymous', r.status === 201 && /^[A-Za-z0-9]{10}$/.test(anonSlug), t2.slice(0, 80));
  if (anonSlug) {
    const rr = await fetch(`${PUB}/r/${anonSlug}`);
    check('anonymous link → 402 unpaid', rr.status === 402, `status=${rr.status}`);
  }
}
// 5b. stray credentials are ignored → still 201 (no accounts at all)
r = await fetch(`${PUB}/v1/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Admin-Key': 'wrong', cookie: 'nt_sess=deadbeef' },
  body: JSON.stringify(pubBody),
});
check('stray-credentials → 201 (ignored, zero cookies needed)', r.status === 201, (await r.text()).slice(0, 80));

// extras: free routes + 404
r = await fetch(`${PUB}/stats`);
check('stats → 200', r.status === 200);
r = await fetch(`${PUB}/.well-known/x402`);
check('well-known → 200', r.status === 200);
r = await fetch(`${PUB}/r/AAAAAAAAAA`);
check('unknown-slug → 404', r.status === 404);

process.exit(fail ? 1 : 0);
