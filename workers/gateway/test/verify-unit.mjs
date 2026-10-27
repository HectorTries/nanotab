// Pure-unit tests for @nanotab/x402-verify — run WITHOUT a gateway:
//   npm run test:unit   (node test/verify-unit.mjs)
// Imports the shared pure.ts directly via node type stripping (node >= 22.18).
import {
  NANOTAB_PROTOCOL_WALLET,
  USDC_BASE_MAINNET,
  assetOk,
  centsToUnits,
  feeRecipientFor,
  paymentMessage,
  splitFee,
  splitPaymentMessage,
  topicToAddress,
  verifyFeeSplit,
  verifyPayment,
} from '../../../packages/x402-verify/src/pure.ts';

const MERCHANT = '0x1111111111111111111111111111111111111111';
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fail++; };
const throws = (fn, want) => {
  try { fn(); } catch (e) { return e.message === want ? null : `wrong message: ${e.message}`; }
  return 'did not throw';
};

// --- fee math ---
check('centsToUnits 5c', centsToUnits('5') === 50000n);
check('centsToUnits 1c', centsToUnits('1') === 10000n);
const s = splitFee('5', 200);
check('splitFee 5c@200bps', s.feeUnits === 1000n && s.netUnits === 49000n, JSON.stringify(s, (_, v) => typeof v === 'bigint' ? `${v}n` : v));

// --- fee recipient ---
check('feeRecipientFor default', feeRecipientFor() === NANOTAB_PROTOCOL_WALLET);
check('feeRecipientFor override', feeRecipientFor(MERCHANT) === MERCHANT);

// --- canonical messages ---
check('paymentMessage format',
  paymentMessage({ to: MERCHANT, amount: '5', asset: USDC_BASE_MAINNET }) ===
  `nanotab-x402|network=base|to=${MERCHANT}|amountCents=5|asset=${USDC_BASE_MAINNET}`);
check('splitPaymentMessage format',
  splitPaymentMessage({ to: MERCHANT, amount: '5', asset: USDC_BASE_MAINNET, feeTo: NANOTAB_PROTOCOL_WALLET, feeAmount: '1000', merchantAmount: '49000' }) ===
  `nanotab-x402|network=base|to=${MERCHANT}|amountCents=5|asset=${USDC_BASE_MAINNET}|feeTo=${NANOTAB_PROTOCOL_WALLET}|fee=1000|net=49000`);

// --- misc pure ---
check('topicToAddress', topicToAddress('0x0000000000000000000000001111111111111111111111111111111111111111') === MERCHANT);
check('assetOk USDC + alias', assetOk(USDC_BASE_MAINNET) && assetOk(USDC_BASE_MAINNET.toLowerCase()) && assetOk('USDC') && !assetOk('0xWRONG'));

// --- verifyPayment ---
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const good = { amount: '5', to: MERCHANT, asset: USDC_BASE_MAINNET, network: 'base', signature: '0xsig', from: MERCHANT };
try {
  const p = verifyPayment(b64(good), MERCHANT, '5');
  check('verifyPayment accepts valid', p.amount === '5' && p.to === MERCHANT);
} catch (e) { check('verifyPayment accepts valid', false, e.message); }
check('verifyPayment malformed header', throws(() => verifyPayment('!!!notbase64', MERCHANT, '5'), 'malformed X-Payment header') === null);
check('verifyPayment missing fields', throws(() => verifyPayment(b64({ amount: '5' }), MERCHANT, '5'), 'malformed X-Payment proof (need amount, to, asset, signature)') === null);
check('verifyPayment wrong merchant', throws(() => verifyPayment(b64({ ...good, to: '0x2222222222222222222222222222222222222222' }), MERCHANT, '5'), 'payment to wrong merchant') === null);
check('verifyPayment underpay', throws(() => verifyPayment(b64({ ...good, amount: '4' }), MERCHANT, '5'), 'payment amount too low') === null);
check('verifyPayment wrong asset', throws(() => verifyPayment(b64({ ...good, asset: '0xWRONG' }), MERCHANT, '5'), 'unsupported asset (need USDC on Base)') === null);
check('verifyPayment wrong network', throws(() => verifyPayment(b64({ ...good, network: 'ethereum' }), MERCHANT, '5'), 'wrong network (need base)') === null);

// --- verifyFeeSplit (5c @ 200bps → fee 1000, net 49000) ---
const split = { feeTo: NANOTAB_PROTOCOL_WALLET, feeAmount: '1000', merchantAmount: '49000' };
try {
  const r = verifyFeeSplit({ ...good, split }, '5', 200);
  check('verifyFeeSplit accepts exact', r.feeUnits === 1000n && r.netUnits === 49000n && r.feeTo === NANOTAB_PROTOCOL_WALLET);
} catch (e) { check('verifyFeeSplit accepts exact', false, e.message); }
check('verifyFeeSplit missing', throws(() => verifyFeeSplit({ ...good }, '5', 200),
  `fee split missing: UserOp must batch [transfer(merchant, 49000), transfer(${NANOTAB_PROTOCOL_WALLET}, 1000)]`) === null);
check('verifyFeeSplit wrong fee', throws(() => verifyFeeSplit({ ...good, split: { ...split, feeAmount: '50', merchantAmount: '49950' } }, '5', 200),
  'fee amount wrong (need 1000 units @200bps, got 50)') === null);
check('verifyFeeSplit wrong feeTo', throws(() => verifyFeeSplit({ ...good, split: { ...split, feeTo: MERCHANT } }, '5', 200),
  `fee to wrong wallet (need ${NANOTAB_PROTOCOL_WALLET})`) === null);
check('verifyFeeSplit wrong net', throws(() => verifyFeeSplit({ ...good, split: { ...split, feeAmount: '1000', merchantAmount: '48000' } }, '5', 200),
  'merchant net wrong (need 49000 units, got 48000)') === null);

process.exit(fail ? 1 : 0);
