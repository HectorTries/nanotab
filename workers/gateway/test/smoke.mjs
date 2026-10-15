// Smoke test: run origin + `wrangler dev --port 8787` first, then `npm test`.
// Env must point ORIGIN_URL at the local demo keyword-api.
// MAINNET: proofs are real EIP-191 signatures over the canonical payment message.
// Set NANOTAB_TEST_KEY to a throwaway dev key to generate valid sigs locally
// (NEVER a funded mainnet key). Without it, only the 402-reject paths are tested.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const GW = process.env.GW_URL || 'http://localhost:8787';
const WALLET = process.env.MERCHANT_WALLET || '0xMERCHANT00000000000000000000000000000001';
const USDC = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';

const devKey = process.env.NANOTAB_TEST_KEY;
let from = '0xBUYER000000000000000000000000000000000001';
let signFn = async (_msg) => '0xBAD';
if (devKey) {
  const acct = privateKeyToAccount(devKey);
  from = acct.address;
  signFn = (msg) => acct.signMessage({ message: msg });
}
const msg = (to, amount, asset) => `nanotab-x402|network=base|to=${to}|amountCents=${amount}|asset=${asset}`;
const pay = async (over = {}) => {
  const p = { amount: '2', to: WALLET, asset: USDC, network: 'base', from, ...over };
  if (!p.signature) p.signature = await signFn(msg(p.to, p.amount, p.asset));
  return Buffer.from(JSON.stringify(p)).toString('base64');
};

const j = async (r) => ({ status: r.status, body: await r.text() });
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };

let r = await fetch(`${GW}/keyword/solar`);
let t = await j(r);
check('no-header → 402', r.status === 402, t.body.slice(0, 100));
try {
  const s = JSON.parse(t.body);
  check('402 schema (x402Version/accepts/scheme exact, base, USDC contract)',
    s.x402Version === 1 && s.accepts?.[0]?.scheme === 'exact' &&
    s.accepts[0].network === 'base' && s.accepts[0].asset === USDC);
} catch { check('402 schema JSON', false); }

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': '!!!notbase64' } });
check('bad-header → 402', r.status === 402);

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await pay({ amount: '1' }) } });
check('underpay → 402', r.status === 402);

r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await pay({ asset: '0xWRONG' }) } });
check('wrong-asset → 402', r.status === 402);

if (devKey) {
  r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await pay() } });
  t = await j(r);
  check('valid-signed-payment → 200 proxied', r.status === 200, t.body.slice(0, 80));
} else {
  console.log('SKIP valid-signed-payment (set NANOTAB_TEST_KEY to a throwaway dev key)');
}

process.exit(fail ? 1 : 0);
