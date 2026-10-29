// Smoke test: `node test/smoke.mjs` (npm test).
//
// Two layers:
//  A. OFFLINE unit tests (always run): exercise the shared @nanotab/x402-verify
//     module directly — per-listing price/wallet overrides, fee-split exactness,
//     and negative cases. No server or RPC needed.
//  B. LIVE gateway tests (run only when a gateway answers at GW_URL): the
//     original origin + `wrangler dev --port 8787` integration checks.
//     Skipped gracefully when no server is up.
//
// MAINNET: proofs are real EIP-191 signatures over the canonical payment message.
// Set NANOTAB_TEST_KEY to a throwaway dev key to generate valid sigs locally
// (NEVER a funded mainnet key). Without it, only the 402-reject paths are tested.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  NANOTAB_NETWORK_CAIP2,
  NANOTAB_PROTOCOL_WALLET,
  USDC_BASE_MAINNET,
  centsToUnits,
  feeRecipient,
  split,
  verifyBuyerTx,
  verifyFeeSplit,
  verifyPayment,
} from '../../../packages/x402-verify/src/index.ts';

const GW = process.env.GW_URL || 'http://localhost:8787';
const WALLET = process.env.MERCHANT_WALLET || '0xMERCHANT00000000000000000000000000000001';
const USDC = '0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913';

const j = async (r) => ({ status: r.status, body: await r.text() });
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };

// ================= A. OFFLINE verify-module tests (always run) =================
// Env defaults (gateway-style) vs a per-listing override (publish-style:
// price + wallet come from the KV record, not env).
const ENV_PRICE = '2';
const ENV_WALLET = '0xAAAA0000000000000000000000000000000000AA';
const LISTING_PRICE = '7';
const LISTING_WALLET = '0xb157000000000000000000000000000000000001';
const FEE = process.env.FEE_WALLET || NANOTAB_PROTOCOL_WALLET;
const feeEnv = { NANOTAB_FEE_BPS: '200', FEE_WALLET: FEE };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const mkProof = (over = {}, splitOver) => ({
  amount: LISTING_PRICE, to: LISTING_WALLET, asset: USDC, network: 'base',
  from: '0xBUYER000000000000000000000000000000000001',
  signature: '0xSIG',
  split: { feeTo: FEE, feeAmount: '1400', merchantAmount: '68600' }, // 7¢ @200bps
  ...over,
  ...(splitOver === null ? {} : splitOver ? { split: { feeTo: FEE, feeAmount: '1400', merchantAmount: '68600', ...splitOver } } : {}),
});
const threw = async (fn, re) => {
  try { await fn(); return false; }
  catch (e) { return re ? re.test(e.message) : true; }
};

// --- A1. Per-listing price/wallet override ---
{
  const header = b64(mkProof());
  let proof;
  try {
    proof = verifyPayment(header, LISTING_WALLET, LISTING_PRICE);
    check('override: listing price+wallet verify ok', proof.to === LISTING_WALLET && proof.amount === LISTING_PRICE);
  } catch (e) { check('override: listing price+wallet verify ok', false, e.message); }
  try {
    const r = verifyFeeSplit(proof, LISTING_PRICE, feeEnv);
    check('override: listing fee-split exact (fee 1400, net 68600)',
      r.feeUnits === 1400n && r.netUnits === 68600n && r.feeTo === FEE);
  } catch (e) { check('override: listing fee-split exact (fee 1400, net 68600)', false, e.message); }
  check('override: env-default wallet rejects listing proof',
    await threw(() => verifyPayment(header, ENV_WALLET, LISTING_PRICE), /wrong merchant/));
  check('override: env-default price rejects listing split',
    await threw(() => verifyFeeSplit(proof, ENV_PRICE, feeEnv), /wrong/));
}

// --- A2. Fee-split exactness ---
{
  check('feemath: centsToUnits(5) = 50000', centsToUnits('5') === 50000n);
  check('feemath: centsToUnits(1) = 10000', centsToUnits('1') === 10000n);
  const s5 = split('5', 200);
  check('feemath: 5c @200bps → fee 1000, net 49000', s5.feeUnits === 1000n && s5.netUnits === 49000n);
  const s1 = split('1', 200);
  check('feemath: 1c @200bps → fee 200, net 9800', s1.feeUnits === 200n && s1.netUnits === 9800n);
  check('feemath: feeRecipient default = protocol wallet', feeRecipient({}) === NANOTAB_PROTOCOL_WALLET);
  check('feemath: feeRecipient honors FEE_WALLET', feeRecipient({ FEE_WALLET: FEE }) === FEE);
  check('consts: USDC + eip155:8453', USDC_BASE_MAINNET === USDC && NANOTAB_NETWORK_CAIP2 === 'eip155:8453');
  // Full split round-trip at env-default price (gateway path shape).
  const p = verifyPayment(b64(mkProof({ amount: ENV_PRICE, to: ENV_WALLET },
    { feeAmount: '400', merchantAmount: '19600' })), ENV_WALLET, ENV_PRICE);
  const r = verifyFeeSplit(p, ENV_PRICE, feeEnv);
  check('feemath: 2c split round-trip (fee 400, net 19600)', r.feeUnits === 400n && r.netUnits === 19600n);
}

// --- A3. Negative cases (wrong amounts rejected) ---
{
  const good = mkProof();
  check('neg: fee off-by-one rejected',
    await threw(() => verifyFeeSplit({ ...good, split: { ...good.split, feeAmount: '1401' } }, LISTING_PRICE, feeEnv), /fee amount wrong/));
  check('neg: net off-by-one rejected',
    await threw(() => verifyFeeSplit({ ...good, split: { ...good.split, merchantAmount: '68601' } }, LISTING_PRICE, feeEnv), /merchant net wrong/));
  check('neg: missing split rejected',
    await threw(() => verifyFeeSplit({ ...good, split: undefined }, LISTING_PRICE, feeEnv), /fee split missing/));
  check('neg: wrong feeTo rejected',
    await threw(() => verifyFeeSplit({ ...good, split: { ...good.split, feeTo: LISTING_WALLET } }, LISTING_PRICE, feeEnv), /wrong wallet/));
  check('neg: underpay rejected',
    await threw(() => verifyPayment(b64(mkProof({ amount: '1' })), LISTING_WALLET, LISTING_PRICE), /too low/));
  check('neg: wrong asset rejected',
    await threw(() => verifyPayment(b64(mkProof({ asset: '0xWRONG' })), LISTING_WALLET, LISTING_PRICE), /unsupported asset/));
  check('neg: wrong network rejected',
    await threw(() => verifyPayment(b64(mkProof({ network: 'ethereum' })), LISTING_WALLET, LISTING_PRICE), /wrong network/));
  check('neg: malformed header rejected',
    await threw(() => verifyPayment('!!!notbase64', LISTING_WALLET, LISTING_PRICE), /malformed/));
  check('neg: buyer-tx bad hash format rejected (no RPC touched)',
    await threw(() => verifyBuyerTx({ MERCHANT_WALLET: LISTING_WALLET }, '0x1234', LISTING_PRICE), /invalid txHash/));
}

// ================= B. LIVE gateway tests (only when GW_URL answers) =================
let live = false;
try {
  await fetch(`${GW}/stats`);
  live = true;
} catch {
  console.log(`SKIP live-gateway cases (no server at ${GW}; start origin + \`wrangler dev --port 8787\`)`);
}

if (live) {
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

  let r = await fetch(`${GW}/keyword/solar`);
  let t = await j(r);
  check('no-header → 402', r.status === 402, t.body.slice(0, 100));
  try {
    const s = JSON.parse(t.body);
    check('402 schema (v2 + resource, eip155:8453, amount, USDC contract)',
      s.x402Version === 2 && !!s.resource?.url && !!s.resource?.description &&
      s.accepts?.[0]?.scheme === 'exact' &&
      s.accepts[0].network === 'eip155:8453' && s.accepts[0].asset === USDC &&
      typeof s.accepts[0].amount === 'string' &&
      typeof s.accepts[0].maxTimeoutSeconds === 'number');
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

  // --- Atomic fee-split cases (run only when GW has FEE_WALLET set + NANOTAB_TEST_KEY) ---
  if (devKey && process.env.FEE_WALLET) {
    const FEEW = process.env.FEE_WALLET;
    const leg = (to, amount, asset, split) =>
      `nanotab-x402|network=base|to=${to}|amountCents=${amount}|asset=${asset}|feeTo=${split.feeTo}|fee=${split.feeAmount}|net=${split.merchantAmount}`;
    const paySplit = async (split) => {
      const p = { amount: '2', to: WALLET, asset: USDC, network: 'base', from, split };
      p.signature = await signFn(leg(p.to, p.amount, p.asset, split));
      return Buffer.from(JSON.stringify(p)).toString('base64');
    };
    r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await paySplit({ feeTo: FEEW, feeAmount: '400', merchantAmount: '19600' }) } });
    check('split-valid → passes verify (non-402)', r.status !== 402, `status=${r.status}`);
    r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await pay() } });
    check('split-missing → 402', r.status === 402, (await r.text()).slice(0, 90));
    r = await fetch(`${GW}/keyword/solar`, { headers: { 'X-Payment': await paySplit({ feeTo: FEEW, feeAmount: '50', merchantAmount: '19950' }) } });
    check('split-wrong-fee → 402', r.status === 402, (await r.text()).slice(0, 90));
  } else {
    console.log('SKIP fee-split cases (need NANOTAB_TEST_KEY + FEE_WALLET env)');
  }

  // --- Listing-readiness: free discovery + price ($0.05 = 50000 units) ---
  r = await fetch(`${GW}/.well-known/x402`);
  t = await j(r);
  try {
    const s = JSON.parse(t.body);
    check('well-known → 200 + accepts', r.status === 200 && Array.isArray(s.accepts));
    check('well-known bazaar inputSchema', !!s.accepts?.[0]?.bazaar?.inputSchema);
  } catch { check('well-known JSON', false); }

  r = await fetch(`${GW}/openapi.json`);
  t = await j(r);
  try {
    const s = JSON.parse(t.body);
    check('openapi → 200, 3.0.0, paths / + /stats, components',
      r.status === 200 && s.openapi === '3.0.0' && !!s.paths?.['/'] && !!s.paths?.['/stats'] && !!s.components);
  } catch { check('openapi JSON', false); }

  r = await fetch(`${GW}/stats`);
  check('stats → 200', r.status === 200);
}

process.exit(fail ? 1 : 0);
