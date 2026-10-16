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

function defaultKeyPath(): string {
  return process.env.NANOTAB_KEY_PATH ?? path.join(os.homedir(), '.nanotab.key');
}

function shortLabel(p: string): string {
  return p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p;
}

/** Timestamped backup copy of the key file. Returns the backup path. Never logs the key. */
function backupKeyFile(keyPath: string): string {
  if (!fs.existsSync(keyPath)) {
    throw new Error(`no key file at ${shortLabel(keyPath)} — nothing to back up`);
  }
  const bak = `${keyPath}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(keyPath, bak);
  fs.chmodSync(bak, 0o600);
  return bak;
}

function printBackupWarning(keyPath: string, bakPath: string | null): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚠️  BACK UP THIS KEY — IT CONTROLS REAL MONEY (USDC on Base)  ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Key file:    ${(shortLabel(keyPath) + ' ').padEnd(52)}║`);
  if (bakPath) {
    console.log(`║  Backup copy: ${(shortLabel(bakPath) + ' ').padEnd(52)}║`);
  }
  console.log('║                                                                  ║');
  console.log('║  If you lose this key, your USDC is GONE FOREVER.                ║');
  console.log('║  Copy it to a password manager NOW:                              ║');
  console.log('║    nanotab export        # shows key path + backup instructions  ║');
  console.log('║    nanotab backup        # timestamped .bak copy of the key      ║');
  console.log('║                                                                  ║');
  console.log('║  Better: use a secret manager instead of a file —                ║');
  console.log('║    export NANOTAB_WALLET_KEY=0x…   (1Password, Vault, KMS, …)     ║');
  console.log('║  Never commit the key. Never paste it in chat or screenshots.    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
}

function cmdExport(keyPath: string): void {
  if (process.env.NANOTAB_WALLET_KEY) {
    console.log('Key source: NANOTAB_WALLET_KEY env var (secret-manager mode — good).');
    console.log('Backup instructions: back up the secret in your secret manager');
    console.log('(1Password / HashiCorp Vault / cloud KMS) and confirm a second');
    console.log('operator can retrieve it. Nothing on disk to copy.');
    return;
  }
  console.log(`Key file: ${shortLabel(keyPath)}`);
  console.log(`Exists: ${fs.existsSync(keyPath) ? 'yes' : 'NO — run `nanotab init` first'}`);
  console.log('');
  console.log('BACKUP INSTRUCTIONS (do all three):');
  console.log('  1. `nanotab backup` — timestamped .bak copy next to the key file.');
  console.log('  2. Copy the key into a password manager (1Password, Bitwarden, …).');
  console.log('  3. Or move to a secret manager: `export NANOTAB_WALLET_KEY=$(cat ' + shortLabel(keyPath) + ')`');
  console.log('     then delete the file copy (shred, not rm).');
  console.log('');
  console.log('NEVER: commit it, print it to logs, paste it in chat, screenshot it.');
  console.log('(This command deliberately never prints the key itself.)');
}

function cmdBackup(keyPath: string): void {
  if (process.env.NANOTAB_WALLET_KEY && !fs.existsSync(keyPath)) {
    console.log('Key comes from NANOTAB_WALLET_KEY env — no file to back up.');
    console.log('Back it up inside your secret manager instead.');
    return;
  }
  const bak = backupKeyFile(keyPath);
  console.log(`backed up ${shortLabel(keyPath)} → ${shortLabel(bak)} (mode 0600)`);
}

async function cmdInit(): Promise<void> {
  const existing = loadConfig();
  const keyPath = flag('key-path') ?? defaultKeyPath();
  const keyLabel = shortLabel(keyPath);
  const wantsRewrite = process.argv.includes('--force') || process.argv.includes('--backup');
  const writeFreshKey = (): `0x${string}` => {
    const fresh = generatePrivateKey() as `0x${string}`;
    fs.writeFileSync(keyPath, fresh, { mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
    return fresh;
  };
  let key: `0x${string}`;
  let keySaved = false;
  let autoBak: string | null = null;
  if (process.env.NANOTAB_WALLET_KEY) {
    // Secret-manager mode: key stays in env, nothing written to disk.
    key = process.env.NANOTAB_WALLET_KEY as `0x${string}`;
    console.log('Using key from NANOTAB_WALLET_KEY env (secret-manager mode — nothing written to disk).');
  } else if (fs.existsSync(keyPath)) {
    if (wantsRewrite) {
      autoBak = backupKeyFile(keyPath);
      console.log(`existing key backed up to ${shortLabel(autoBak)}`);
      key = writeFreshKey();
      keySaved = true;
    } else {
      console.error(`ERROR: ${keyLabel} already exists. Refusing to overwrite (funds protection).`);
      console.error(`Re-run with --force (backs up old key to ${keyLabel}.bak.<timestamp>, then overwrites) or --backup (auto-backs-up, then writes new key).`);
      console.error(`Custom location? Re-run with --key-path <path> or set NANOTAB_KEY_PATH.`);
      process.exit(2);
    }
  } else {
    key = writeFreshKey();
    keySaved = true;
  }
  const wallet = createSmartWallet(key);
  const ownedAddr = existing?.walletAddress && existing.walletAddress !== wallet.address ? existing.walletAddress : undefined;
  const isBuyInit = process.argv[2] === 'buy-init';
  const cfg = {
    walletAddress: wallet.address,
    network: 'base' as const,
    totalBudget: parseUsd(flag('budget') ?? (isBuyInit ? '$5.00' : '$1.00')),
    maxPerCall: parseUsd(flag('per-call') ?? '$0.10'),
    allowlist: flag('allowlist')?.split(',').map((s) => s.trim()).filter(Boolean),
    maxCallsPerMinute: flag('calls-per-min') ? Number(flag('calls-per-min')) : 30,
  };
  const p = saveConfig(cfg);
  if (keySaved) {
    console.log(`new key written to ${keyLabel} (mode 0600, keep secret)`);
    printBackupWarning(keyPath, autoBak);
  }
  console.log(`wallet: ${wallet.address} (base mainnet, real USDC signing)` + (ownedAddr ? ` [config keeps ${ownedAddr}]` : ''));
  console.log('fund with USDC on Base, that is it — no ETH needed (gas is paid in USDC via the Circle paymaster).');
  console.log(`onramp: ${ONRAMP_LINK}  (buy USDC on Base directly into this wallet)`);
  console.log(`wrote ${p}`);
  // One-click summary: wallet address + fund instructions + backup path in one block.
  let bakPath = autoBak;
  if (keySaved && !bakPath) {
    try { bakPath = backupKeyFile(keyPath); } catch { /* key just written; backup best-effort */ }
  }
  console.log('');
  console.log('─── ONE-CLICK BUYER SETUP COMPLETE ───');
  console.log(`  wallet:  ${wallet.address}`);
  console.log(`  fund:    send USDC on Base to the wallet above (no ETH needed)`);
  console.log(`  onramp:  ${ONRAMP_LINK}`);
  if (!process.env.NANOTAB_WALLET_KEY) {
    console.log(`  key:     ${keyLabel} (mode 0600 — keep secret, never commit)`);
    if (bakPath) console.log(`  backup:  ${shortLabel(bakPath)}`);
  } else {
    console.log('  key:     NANOTAB_WALLET_KEY env (secret-manager mode — back it up in your secret manager)');
  }
  console.log(`  config:  ${p} (budget $${cfg.totalBudget}, $${cfg.maxPerCall}/call)`);
  console.log(JSON.stringify(cfg, null, 2));
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
  const keyPath = flag('key-path') ?? defaultKeyPath();
  if (cmd === 'export') {
    cmdExport(keyPath);
    return;
  }
  if (cmd === 'backup') {
    cmdBackup(keyPath);
    return;
  }
  if (cmd !== 'init' && cmd !== 'buy-init') {
    console.log('Usage:');
    console.log('  nanotab buy-init                                   # ONE-CLICK buyer setup: wallet + config + backup ($5 budget, $0.10/call)');
    console.log('  nanotab init --budget \'$1.00\' --per-call \'$0.10\' [--allowlist host1,host2] [--calls-per-min 20] [--key-path <path>] [--force]');
    console.log('  nanotab export [--key-path <path>]   # key path + backup instructions (never prints the key)');
    console.log('  nanotab backup [--key-path <path>]   # timestamped .bak copy of the key file');
    console.log('  nanotab protect --price <usd> --wallet <0x..> [--route "<glob>"] [--yes] <file.js>');
    console.log('  nanotab deploy --price <usd> --wallet <0x..> [--file ./server.js | --dir ./api] [--name <worker>] [--yes]');
    console.log('');
    console.log('  Env: NANOTAB_WALLET_KEY=0x… (secret-manager mode, preferred for prod)');
    console.log('       NANOTAB_KEY_PATH=<path> (override default ~/.nanotab.key)');
    process.exit(1);
  }
  await cmdInit(); // handles both `init` and `buy-init` (buy-init = one-click defaults: $5 budget, $0.10/call)
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
