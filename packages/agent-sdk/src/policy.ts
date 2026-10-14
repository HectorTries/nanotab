// Budget-cap parsing + policy enforcement.

export interface PolicyConfig {
  /** Total spend budget in USD (e.g. 1.0 = $1.00). */
  totalBudget: number;
  /** Max spend per single 402 call in USD. */
  maxPerCall: number;
  /** Optional merchant allowlist (matched against URL hostname or payTo). */
  allowlist?: string[];
  /** Max paid calls per rolling 60s window. */
  maxCallsPerMinute?: number;
}

/** Spec-compat: budget cap check. canSpend(spent, budget, price) → within budget? */
export function canSpend(spent: number, budget: number, price: number): boolean {
  return spent + price <= budget + 1e-9;
}

/** Spec-compat: allowlist check. isAllowed(host, allowlist) → allowed? */
export function isAllowed(host: string, allowlist?: string[]): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.some((entry) => host.includes(entry));
}

/** Parse caps like '$0.10', '0.10', '$1' → 0.10. Throws on invalid input. */
export function parseUsd(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error(`invalid budget: ${input}`);
    return input;
  }
  const cleaned = input.trim().replace(/^\$/, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || cleaned === '') throw new Error(`invalid budget cap: '${input}'`);
  return n;
}

export interface SpendRecord {
  amount: number;
  at: number;
}

export class PolicyEngine {
  private cfg: PolicyConfig;
  private spent = 0;
  private calls: number[] = [];

  constructor(cfg: PolicyConfig) {
    this.cfg = cfg;
  }

  get cumulativeSpend(): number {
    return this.spent;
  }

  /** Throws on violation with a human-readable reason; otherwise records the spend. */
  check(url: string, amountUsd: number, payTo?: string): void {
    if (amountUsd > this.cfg.maxPerCall) {
      throw new Error(
        `policy: amount $${amountUsd.toFixed(2)} exceeds per-call cap $${this.cfg.maxPerCall.toFixed(2)}`
      );
    }
    if (this.spent + amountUsd > this.cfg.totalBudget + 1e-9) {
      throw new Error(
        `policy: cumulative $${(this.spent + amountUsd).toFixed(2)} would exceed total budget $${this.cfg.totalBudget.toFixed(2)} (spent $${this.spent.toFixed(2)})`
      );
    }
    if (this.cfg.allowlist && this.cfg.allowlist.length > 0) {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        host = url;
      }
      const ok = this.cfg.allowlist.some(
        (entry) => host.includes(entry) || url.includes(entry) || payTo === entry
      );
      if (!ok) throw new Error(`policy: merchant not in allowlist (${host})`);
    }
    if (this.cfg.maxCallsPerMinute !== undefined) {
      const now = Date.now();
      this.calls = this.calls.filter((t) => now - t < 60_000);
      if (this.calls.length >= this.cfg.maxCallsPerMinute) {
        throw new Error(`policy: velocity limit exceeded (${this.cfg.maxCallsPerMinute}/min)`);
      }
      this.calls.push(now);
    }
    this.spent += amountUsd;
  }
}
