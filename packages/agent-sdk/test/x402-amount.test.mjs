// Unit tests for x402 amount normalization: v2 quotes USDC base units,
// v1 quotes cents. Run after build: npm run build && node test/x402-amount.test.mjs
import { acceptAmountCents, acceptFeeBps, acceptFeeTo, usdcUnitsToCents } from '../dist/index.js';

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) fail++;
};
const throws = (fn, re) => {
  try { fn(); return false; } catch (e) { return re.test(e.message); }
};

const WALLET = '0x2222222222222222222222222222222222222222';
const FEE = '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b';
const USDC = '0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913';

// --- units → cents ---
check('units 50000 → 5c', usdcUnitsToCents('50000') === '5');
check('units 10000 → 1c', usdcUnitsToCents('10000') === '1');
check('units 100000 → 10c', usdcUnitsToCents('100000') === '10');
check('units sub-cent rejected', throws(() => usdcUnitsToCents('500'), /whole-cent/));

// --- v2 (gateway + publish worker shape) ---
const v2 = {
  x402Version: 2,
  accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '50000', maxAmountRequired: '50000', asset: USDC, payTo: WALLET, fee: '2%', feeTo: FEE }],
};
check('v2 amount units → cents', acceptAmountCents(v2) === '5');
check('v2 fee 2% → 200bps', acceptFeeBps(v2.accepts[0]) === 200);
check('v2 feeTo from accepts', acceptFeeTo(v2.accepts[0]) === FEE);
// v2 with only maxAmountRequired (older gateway shape)
const v2b = { x402Version: 2, accepts: [{ scheme: 'exact', network: 'eip155:8453', maxAmountRequired: '20000', asset: USDC, payTo: WALLET }] };
check('v2 maxAmountRequired units → cents', acceptAmountCents(v2b) === '2');

// --- v1 (merchant middleware shape: maxAmountRequired is cents) ---
const v1 = {
  x402Version: 1,
  accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: '2', resource: 'http://x/keyword', payTo: WALLET, asset: USDC, fee: '0.1%' }],
};
check('v1 cents passthrough', acceptAmountCents(v1) === '2');
check('v1 fee 0.1% → 10bps', acceptFeeBps(v1.accepts[0]) === 10);
check('v1 no feeTo → undefined', acceptFeeTo(v1.accepts[0]) === undefined);

// --- fee parsing edge cases ---
check('fee missing → 200 default', acceptFeeBps({ scheme: 'exact', network: 'base', maxAmountRequired: '1', payTo: WALLET, asset: USDC }) === 200);
check('fee in extra → parsed', acceptFeeBps({ scheme: 'exact', network: 'base', maxAmountRequired: '1', payTo: WALLET, asset: USDC, extra: { fee: '0.1%', feeTo: FEE } }) === 10);
check('feeTo in extra → returned', acceptFeeTo({ scheme: 'exact', network: 'base', maxAmountRequired: '1', payTo: WALLET, asset: USDC, extra: { feeTo: FEE } }) === FEE);
check('bad feeTo ignored', acceptFeeTo({ scheme: 'exact', network: 'base', maxAmountRequired: '1', payTo: WALLET, asset: USDC, feeTo: 'nope' }) === undefined);

process.exit(fail ? 1 : 0);
