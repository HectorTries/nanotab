#!/usr/bin/env node
import { createSmartWallet, ONRAMP_LINK } from './wallet';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { saveConfig, loadConfig } from './config';
import { parseUsd } from './policy';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'protect') {
    require('../../cli/protect.js');
    return;
  }
  if (cmd !== 'init') {
    console.log('Usage:');
    console.log('  nanotab init --budget \'$1.00\' --per-call \'$0.10\' [--allowlist host1,host2] [--calls-per-min 20]');
    console.log('  nanotab protect --price <usd> --wallet <0x..> [--route "<glob>"] [--yes] <file.js>');
    process.exit(1);
  }
  const existing = loadConfig();
  const key = (process.env.NANOTAB_WALLET_KEY ?? generatePrivateKey()) as `0x${string}`;
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
  if (!process.env.NANOTAB_WALLET_KEY) {
    console.log(`NEW wallet key generated for this session only — NOT saved. fund ${wallet.address} with real USDC on Base, then re-run with NANOTAB_WALLET_KEY=<key>.`);
  }
  console.log(`wallet: ${wallet.address} (base mainnet, real USDC signing)` + (ownedAddr ? ` [config keeps ${ownedAddr}]` : ''));
  console.log(`onramp: ${ONRAMP_LINK}`);
  console.log(`wrote ${p}`);
  console.log(JSON.stringify(cfg, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
