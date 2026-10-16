import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PolicyConfig, parseUsd } from './policy';

export interface NanotabConfig extends PolicyConfig {
  walletAddress: string;
  network: 'base';
}

export const CONFIG_FILENAME = '.nanotab.config.json';

/** Explicit config path override: --config flag value passed in, else NANOTAB_CONFIG env. */
let explicitConfigPath: string | null = null;

export function setExplicitConfigPath(p: string | null | undefined): void {
  explicitConfigPath = p ?? null;
}

/** Config always lives in $HOME (or the explicit --config path) — never CWD. */
export function configPath(): string {
  if (explicitConfigPath) return explicitConfigPath;
  if (process.env.NANOTAB_CONFIG) return process.env.NANOTAB_CONFIG;
  return path.join(os.homedir(), CONFIG_FILENAME);
}

export function loadConfig(): NanotabConfig | null {
  const candidates = [configPath()];
  const home = os.homedir();
  // Legacy filenames/locations (read-only back-compat; writes always go to configPath()).
  candidates.push(path.join(home, '.nanotab.json'));
  candidates.push(path.join(home, 'nanotab.config.json'));
  candidates.push(path.join(process.cwd(), CONFIG_FILENAME));
  candidates.push(path.join(process.cwd(), 'nanotab.config.json'));
  const p = candidates.find((c) => fs.existsSync(c));
  if (!p) return null;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    walletAddress: String(raw.walletAddress ?? ''),
    network: 'base',
    totalBudget: parseUsd(String(raw.totalBudget ?? raw.budgetUsd ?? raw.total ?? 0)),
    maxPerCall: parseUsd(String(raw.maxPerCall ?? raw.perCall ?? 0)),
    allowlist: raw.allowlist,
    maxCallsPerMinute: raw.maxCallsPerMinute ?? raw.maxCallsPerMin,
  };
}

export function saveConfig(cfg: NanotabConfig): string {
  const p = configPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  return p;
}
