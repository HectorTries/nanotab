import * as fs from 'fs';
import * as path from 'path';
import { PolicyEngine, PolicyConfig, parseUsd } from './policy';
import { createMockWallet, createSmartWallet, submitSplitUserOp, resolveFeeWallet, splitFeeUnits, centsToUsdcUnits } from './wallet';
import { loadConfig } from './config';

export { PolicyEngine, parseUsd, createMockWallet };
export type { PolicyConfig };
export * from './config';
export * from './wallet';

export interface PaymentAccept {
  scheme: string;
  network: string;
  /** x402 v2: USDC base units (e.g. '50000' = $0.05). Prefer `amount`. */
  amount?: string;
  /** x402 v1 (merchant middleware): USD cents (e.g. '2' = $0.02).
   *  In v2 responses this field also carries base units — see acceptAmountCents(). */
  maxAmountRequired: string;
  resource?: string;
  payTo: string;
  asset: string;
  fee?: string;
  feeTo?: string;
  extra?: { fee?: string; feeTo?: string };
}

export interface X402Spec {
  x402Version: number;
  accepts: PaymentAccept[];
}

export interface FetchOptions {
  policy?: PolicyConfig;
  walletAddress?: string;
  spendLog?: string;
  merchant?: string;
  /** Spec-compat legacy opts: price cap, wallet address, total budget, allowlist. */
  price?: number;
  wallet?: string;
  budget?: number;
  allowlist?: string[];
}

export interface SpendEntry {
  ts: string;
  url: string;
  price: number;
}

export function readSpendLog(spendLog = path.join(process.cwd(), 'spend.log')): SpendEntry[] {
  if (!fs.existsSync(spendLog)) return [];
  return fs
    .readFileSync(spendLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const r = JSON.parse(line) as Record<string, unknown>;
      return {
        ts: String(r.ts ?? r.timestamp ?? ''),
        url: String(r.url ?? ''),
        price: Number(r.price ?? r.amount ?? 0),
      };
    });
}

export function getSpentTotal(entries: SpendEntry[]): number {
  return entries.reduce((s, e) => s + e.price, 0);
}

const sharedEngines = new Map<string, PolicyEngine>();

function engineFor(key: string, policy: PolicyConfig): PolicyEngine {
  let e = sharedEngines.get(key);
  if (!e) {
    e = new PolicyEngine(policy);
    sharedEngines.set(key, e);
  }
  return e;
}

export function centsToUsd(cents: string): number {
  return Number(cents) / 100;
}

/** USDC base units (6 decimals) → USD cents (2 decimals). 50000 → '5'.
 *  NanoTab prices are whole cents, so non-cent-aligned units are rejected. */
export function usdcUnitsToCents(units: string): string {
  const u = BigInt(units);
  const perCent = 10_000n; // 10^(6-2)
  if (u % perCent !== 0n) {
    throw new Error(`402 price ${units} USDC base units is not a whole-cent amount`);
  }
  return (u / perCent).toString();
}

/**
 * Canonical price in USD cents for a 402 spec.
 * x402 v2 (gateway + publish worker) quotes `amount`/`maxAmountRequired`
 * in USDC base units; x402 v1 (merchant middleware) quotes cents.
 * The X-Payment proof and signature always commit to cents.
 */
export function acceptAmountCents(spec: X402Spec): string {
  const accept = spec.accepts?.[0];
  if (!accept) throw new Error('402 without x402 accepts spec');
  if ((spec.x402Version ?? 1) >= 2) {
    const raw = accept.amount ?? accept.maxAmountRequired;
    if (!raw) throw new Error('402 accepts entry missing amount');
    return usdcUnitsToCents(raw);
  }
  const raw = accept.maxAmountRequired ?? accept.amount;
  if (!raw) throw new Error('402 accepts entry missing amount');
  return raw;
}

/** Fee in basis points from the 402 terms ('2%' → 200, '0.1%' → 10). Defaults to managed 200. */
export function acceptFeeBps(accept: PaymentAccept): number {
  const raw = accept.fee ?? accept.extra?.fee;
  if (!raw) return 200;
  const m = String(raw).match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!m) return 200;
  return Math.round(parseFloat(m[1]) * 100);
}

/** Fee recipient advertised by the server (wins over local env so the split matches verify). */
export function acceptFeeTo(accept: PaymentAccept): string | undefined {
  const v = accept.feeTo ?? accept.extra?.feeTo;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : undefined;
}

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function logSpend(spendLog: string, entry: Record<string, unknown>): void {
  fs.appendFileSync(spendLog, JSON.stringify(entry) + '\n');
}

/**
 * nanotabFetch(url): plain GET; on HTTP 402 parses the x402 payment spec,
 * checks policy, real-signs a Base-mainnet USDC payment, retries with X-Payment proof.
 */
export async function nanotabFetch(url: string, opts: FetchOptions = {}): Promise<any> {
  const fileCfg = loadConfig();
  const policy: PolicyConfig = opts.policy ?? {
    totalBudget: opts.budget ?? fileCfg?.totalBudget ?? 1.0,
    maxPerCall: opts.price ?? fileCfg?.maxPerCall ?? 0.1,
    allowlist: opts.allowlist ?? fileCfg?.allowlist,
    maxCallsPerMinute: fileCfg?.maxCallsPerMinute,
  };
  const walletAddress = opts.wallet ?? opts.walletAddress ?? fileCfg?.walletAddress;
  const spendLog = opts.spendLog ?? path.join(process.cwd(), 'nanotab-spend.log');

  const res = await fetch(url);
  if (res.status !== 402) {
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return readBody(res);
  }

  const spec = (await res.json()) as X402Spec;
  const accept = spec.accepts?.[0];
  if (!accept) throw new Error('402 without x402 accepts spec');
  // Normalize to cents: v2 quotes base units, v1 quotes cents (see acceptAmountCents).
  const amountCents = acceptAmountCents(spec);
  const amountUsd = centsToUsd(amountCents);
  const feeBps = acceptFeeBps(accept);

  // Policy enforcement: per-call cap, total budget, allowlist, velocity.
  const engine = engineFor(spendLog, policy);
  engine.check(url, amountUsd, accept.payTo);

  // Real-sign USDC payment intent on Base mainnet (viem, EIP-191).
  // Key from NANOTAB_WALLET_KEY env. Falls back to a read-only mock only if
  // a walletAddress was explicitly passed AND no key is set (local demo).
  const walletKey = process.env.NANOTAB_WALLET_KEY as `0x${string}` | undefined;
  let signature: string;
  let fromAddr: string;
  // Mandatory protocol-fee split: computed up-front, committed into the signature.
  // Server-advertised feeTo/fee win so the split matches server-side verify.
  const feeTo = (acceptFeeTo(accept) as `0x${string}` | undefined) ?? resolveFeeWallet();
  const { feeUnits, netUnits } = splitFeeUnits(centsToUsdcUnits(amountCents), feeBps);
  const split = { feeTo, feeAmount: feeUnits.toString(), merchantAmount: netUnits.toString() };
  if (walletKey) {
    const wallet = createSmartWallet(walletKey);
    signature = await wallet.signSplitPayment({
      to: accept.payTo,
      amountCents,
      asset: accept.asset,
      feeTo: split.feeTo, feeAmount: split.feeAmount, merchantAmount: split.merchantAmount,
    });
    fromAddr = wallet.address;
  } else if (walletAddress) {
    const wallet = createMockWallet(walletAddress);
    signature = wallet.signPayment({
      to: accept.payTo,
      amountCents,
      asset: accept.asset,
    });
    fromAddr = wallet.address;
  } else {
    throw new Error('no wallet: set NANOTAB_WALLET_KEY env (real Base mainnet USDC signing)');
  }
  // Gap-3 close: submit the payment as a REAL UserOp (Pimlico bundler +
  // Circle paymaster, gas in USDC, 0 ETH) BEFORE retrying with X-Payment.
  // Env: NANOTAB_WALLET_KEY + PIMLICO_API_KEY. Skip only when explicitly
  // disabled (NANOTAB_NO_SUBMIT=1) or when running the mock/demo path.
  let userOp: { userOpHash: string; txHash: string } | null = null;
  if (walletKey && process.env.NANOTAB_NO_SUBMIT !== '1') {
    const feeArg = (process.env.NANOTAB_FEE_WALLET ?? process.env.FEE_WALLET ?? '') as `0x${string}` | '';
    const sub = await submitSplitUserOp({
      privateKey: walletKey,
      merchant: accept.payTo as `0x${string}`,
      amountCents,
      feeBps,
      ...(feeTo ? { feeWallet: feeTo } : feeArg ? { feeWallet: feeArg } : {}),
    });
    if (!sub.success) throw new Error(`UserOp reverted: ${sub.txHash}`);
    userOp = { userOpHash: String(sub.userOpHash), txHash: sub.txHash };
  }
  const proof = Buffer.from(
    JSON.stringify({
      amount: amountCents,
      to: accept.payTo,
      asset: accept.asset,
      // Proof network is always the short name the verifier expects;
      // the 402 may advertise CAIP-2 (eip155:8453) instead.
      network: 'base',
      signature,
      from: fromAddr,
      split,
      ...(userOp ? { userOpHash: userOp.userOpHash, txHash: userOp.txHash } : {}),
    })
  ).toString('base64');

  const paid = await fetch(url, { headers: { 'X-Payment': proof } });
  if (!paid.ok) {
    const detail = await paid.text().catch(() => '');
    throw new Error(`paid GET ${url} → ${paid.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = await readBody(paid);

  let merchant = opts.merchant ?? '';
  try {
    merchant = new URL(url).hostname;
  } catch {
    merchant = url;
  }
  logSpend(spendLog, {
    ts: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    url,
    price: amountUsd,
    amount: amountUsd,
    merchant,
  });
  return data;
}
