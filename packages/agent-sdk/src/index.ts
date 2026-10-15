import * as fs from 'fs';
import * as path from 'path';
import { PolicyEngine, PolicyConfig, parseUsd } from './policy';
import { createMockWallet, createSmartWallet } from './wallet';
import { loadConfig } from './config';

export { PolicyEngine, parseUsd, createMockWallet };
export type { PolicyConfig };
export * from './config';
export * from './wallet';

export interface PaymentAccept {
  scheme: string;
  network: string;
  maxAmountRequired: string; // USD cents as string, e.g. '2' = $0.02
  resource: string;
  payTo: string;
  asset: string;
  fee?: string;
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
    return res.json();
  }

  const spec = (await res.json()) as X402Spec;
  const accept = spec.accepts?.[0];
  if (!accept) throw new Error('402 without x402 accepts spec');
  const amountUsd = centsToUsd(accept.maxAmountRequired);

  // Policy enforcement: per-call cap, total budget, allowlist, velocity.
  const engine = engineFor(spendLog, policy);
  engine.check(url, amountUsd, accept.payTo);

  // Real-sign USDC payment intent on Base mainnet (viem, EIP-191).
  // Key from NANOTAB_WALLET_KEY env. Falls back to a read-only mock only if
  // a walletAddress was explicitly passed AND no key is set (local demo).
  const walletKey = process.env.NANOTAB_WALLET_KEY as `0x${string}` | undefined;
  let signature: string;
  let fromAddr: string;
  if (walletKey) {
    const wallet = createSmartWallet(walletKey);
    signature = await wallet.signPayment({
      to: accept.payTo,
      amountCents: accept.maxAmountRequired,
      asset: accept.asset,
    });
    fromAddr = wallet.address;
  } else if (walletAddress) {
    const wallet = createMockWallet(walletAddress);
    signature = wallet.signPayment({
      to: accept.payTo,
      amountCents: accept.maxAmountRequired,
      asset: accept.asset,
    });
    fromAddr = wallet.address;
  } else {
    throw new Error('no wallet: set NANOTAB_WALLET_KEY env (real Base mainnet USDC signing)');
  }
  const proof = Buffer.from(
    JSON.stringify({
      amount: accept.maxAmountRequired,
      to: accept.payTo,
      asset: accept.asset,
      network: accept.network,
      signature,
      from: fromAddr,
    })
  ).toString('base64');

  const paid = await fetch(url, { headers: { 'X-Payment': proof } });
  if (!paid.ok) throw new Error(`paid GET ${url} → ${paid.status}`);
  const data = await paid.json();

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
