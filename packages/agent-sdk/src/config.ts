import * as fs from 'fs';
import * as path from 'path';
import { PolicyConfig, parseUsd } from './policy';

export interface NanotabConfig extends PolicyConfig {
  walletAddress: string;
  network: 'base';
}

export const CONFIG_FILENAME = 'nanotab.config.json';

export function configPath(cwd = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function loadConfig(cwd = process.cwd()): NanotabConfig | null {
  const candidates = [configPath(cwd), path.join(cwd, 'nanotab.config.json')];
  const home = process.env.HOME;
  if (home) candidates.push(path.join(home, '.nanotab.json'));
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

export function saveConfig(cfg: NanotabConfig, cwd = process.cwd()): string {
  const p = configPath(cwd);
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  return p;
}
