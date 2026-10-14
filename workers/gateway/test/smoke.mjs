// Smoke test: run origin + `wrangler dev --port 8787` first, then `npm test`.
// Env must point ORIGIN_URL at the local demo keyword-api.
const GW = process.env.GW_URL || 'http://localhost:8787';
const WALLET = process.env.MERCHANT_WALLET || '0xMERCHANT00000000000000000000000000000001';
const pay = (over = {}) =>
  Buffer.from(JSON.stringify({ amount: '2', to: WALLET, asset: 'USDC', network: 'base-sepolia', signature: '0xMOCK', from: '0xBUYER', ...over })).toString('base64');

const j = async (r) => ({ status: r.status, body: await r.text() });
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };

let r = await fetch(`${GW}/keyword/solar`);
let t = await j(r);
check('no-header → 402', r.status === 402, t.body.slice(0, 80));
try {
  const s = JSON.parse(t.body);
  check('402 schema (x402Version/accepts/scheme exact)', s.x402Version === 1 && s.accepts?.[0]?.scheme === 'exact');
} catch { check('402 schema JSON', false); }

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': '!!!notbase64' } });
check('bad-header → 402', r.status === 402);

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': pay({ amount: '1' }) } });
check('underpay → 402', r.status === 402);

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': pay() } });
t = await j(r);
check('valid-payment → 200 proxied', r.status === 200, t.body.slice(0, 80));

process.exit(fail ? 1 : 0);
