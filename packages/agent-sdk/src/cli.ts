#!/usr/bin/env node
import { createSmartWallet, ONRAMP_LINK } from './wallet';
import { generatePrivateKey } from 'viem/accounts';
import { saveConfig, loadConfig } from './config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseUsd } from './policy';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'protect') {
    require('../cli/protect.js');
    return;
  }
  if (cmd === 'deploy') {
    require('../cli/deploy.js');
    return;
  }
  if (cmd !== 'init') {
    console.log('Usage:');
    console.log('  nanotab init --budget \'$1.00\' --per-call \'$0.10\' [--allowlist host1,host2] [--calls-per-min 20]');
    console.log('  nanotab protect --price <usd> --wallet <0x..> [--route "<glob>"] [--yes] <file.js>');
    console.log('  nanotab deploy --price <usd> --wallet <0x..> [--file ./server.js | --dir ./api] [--name <worker>] [--yes]');
    process.exit(1);
  }
  const existing = loadConfig();
  const keyPath = flag('key-path') ?? path.join(os.homedir(), '.nanotab.key');
  const keyLabel = keyPath.startsWith(os.homedir()) ? '~' + keyPath.slice(os.homedir().length) : keyPath;
  const wantsRewrite = process.argv.includes('--force') || process.argv.includes('--backup');
  const backupKey = (): void => {
    const bak = `${keyPath}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(keyPath, bak);
    fs.chmodSync(bak, 0o600);
    console.log(`existing key backed up to ${bak}`);
  };
  const writeFreshKey = (): `0x${string}` => {
    const fresh = generatePrivateKey() as `0x${string}`;
    fs.writeFileSync(keyPath, fresh, { mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
    return fresh;
  };
  let key: `0x${string}`;
  let keySaved = false;
  if (process.env.NANOTAB_WALLET_KEY) {
    key = process.env.NANOTAB_WALLET_KEY as `0x${string}`;
  } else if (fs.existsSync(keyPath)) {
    if (wantsRewrite) {
      backupKey();
      key = writeFreshKey();
      keySaved = true;
    } else {
      console.error(`ERROR: ${keyLabel} already exists. Refusing to overwrite (funds protection).`);
      console.error(`Re-run with --force (backs up old key to ${keyLabel}.bak.<timestamp>, then overwrites) or --backup (auto-backs-up, then writes new key).`);
      console.error(`Custom location? Re-run with --key-path <path>.`);
      process.exit(2);
    }
  } else {
    key = writeFreshKey();
    keySaved = true;
  }
  const wallet = createSmartWallet(key);
  const ownedAddr = existing?.walletAddress && existing.walletAddress !== wallet.address ? existing.walletAddress : undefined;
  const cfg = {
    walletAddress: wallet.address,
    network: 'base' as const,
    totalBudget: parseUsd(flag('budget') ?? '$1.00'),
    maxPerCall: parseUsd(flag('per-call') ?? '$0.10'),
    allowlist: flag('allowlist')?.split(',').map((s) => s.trim()).filter(Boolean),
    maxCallsPerMinute: flag('calls-per-min') ? Number(flag('calls-per-min')) : 30,
  };
  const p = saveConfig(cfg);
  if (keySaved) {
    console.log(`key saved to ~/.nanotab.key (keep secret)`);
  }
  console.log(`wallet: ${wallet.address} (base mainnet, real USDC signing)` + (ownedAddr ? ` [config keeps ${ownedAddr}]` : ''));
  console.log('fund with USDC on Base, that is it — no ETH needed (gas is paid in USDC via the Circle paymaster).');
  console.log(`onramp: ${ONRAMP_LINK}  (buy USDC on Base directly into this wallet)`);
  console.log(`wrote ${p}`);
  console.log(JSON.stringify(cfg, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
