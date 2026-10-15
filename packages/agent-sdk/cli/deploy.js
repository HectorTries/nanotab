#!/usr/bin/env node
/**
 * nanotab deploy — ship a protected endpoint to Cloudflare Workers (zero-server path).
 *
 * Usage:
 *   npx nanotab deploy --price 0.05 --wallet 0xMERCHANT [--file ./server.js | --dir ./api] [--name my-api] [--yes]
 *
 * What it does:
 *   1. Bundles the entry file with esbuild (platform=browser, format=esm) into .nanotab-worker/.
 *   2. Generates wrangler.toml (compatibility_date + vars PRICE_USD_CENTS / MERCHANT_WALLET / NETWORK / ASSET).
 *   3. Prompts for CLOUDFLARE_API_TOKEN if not set in env.
 *   4. Runs `npx wrangler deploy` and prints the live worker URL.
 *
 * PREFERRED: a plain fetch-handler module:
 *   export default { async fetch(req, env) { ... } }
 *   Use env.PRICE_USD_CENTS / env.MERCHANT_WALLET instead of hardcoding.
 *
 * LIMITATION — Express: `express` apps do NOT run natively on Workers (no Node
 * http server). Either (a) rewrite as a plain fetch handler (recommended), or
 * (b) add the `@cloudflare/express` adapter yourself:
 *     npm i @cloudflare/express
 *     import { fromExpress } from '@cloudflare/express';
 *     export default { fetch: fromExpress(app) };
 * This command bundles whatever you give it — Express without the adapter will
 * fail at runtime on Workers. Prefer the fetch handler.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

function usageAndExit(code = 1) {
  console.log(`Usage: nanotab deploy --price <usd> --wallet <0x..> [--file ./server.js | --dir ./dir] [--name <worker>] [--yes]

  --price   charge per call in USD (e.g. 0.05) → PRICE_USD_CENTS var
  --wallet  merchant wallet receiving settlement → MERCHANT_WALLET var
  --file    entry file to bundle (default: ./server.js)
  --dir     bundle every top-level .js file in this dir (entry: index.js or first file)
  --name    worker name (default: folder name of entry)
  --yes     skip confirmation prompt`);
  process.exit(code);
}

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

async function main() {
  if (hasFlag('help')) usageAndExit(0);
  const priceRaw = flag('price');
  const wallet = flag('wallet');
  const yes = hasFlag('yes') || hasFlag('y');
  if (!priceRaw || !wallet) usageAndExit(1);
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) {
    console.error('error: --price must be a positive number (USD).');
    process.exit(1);
  }

  // Resolve entry.
  let entry;
  let projectDir = process.cwd();
  const dirFlag = flag('dir');
  const fileFlag = flag('file');
  if (dirFlag) {
    projectDir = path.resolve(dirFlag);
    const idx = path.join(projectDir, 'index.js');
    if (fs.existsSync(idx)) entry = idx;
    else {
      const js = fs.readdirSync(projectDir).filter((f) => f.endsWith('.js') && !f.startsWith('.'));
      if (!js.length) { console.error(`error: no .js files in ${projectDir}`); process.exit(1); }
      entry = path.join(projectDir, js[0]);
    }
  } else {
    entry = path.resolve(fileFlag || './server.js');
    if (!fs.existsSync(entry)) {
      console.error(`error: entry not found: ${entry} (pass --file or --dir)`);
      process.exit(1);
    }
    projectDir = path.dirname(entry);
  }

  // Warn on raw express usage without the CF adapter.
  const src = fs.readFileSync(entry, 'utf8');
  const usesExpress = /require\(['"]express['"]\)|from\s+['"]express['"]/.test(src);
  const hasAdapter = /@cloudflare\/express/.test(src);
  const isFetchHandler = /export\s+default\s*\{/.test(src) || /addEventListener\s*\(\s*['"]fetch['"]/.test(src);
  if (usesExpress && !hasAdapter) {
    console.log('\nNOTE: this looks like an Express app with no @cloudflare/express adapter.');
    console.log('Express does not run natively on Workers — prefer a plain fetch handler');
    console.log('(export default { async fetch(req, env) { ... } }), or add the adapter:');
    console.log('  npm i @cloudflare/express  +  export default { fetch: fromExpress(app) }');
    console.log('Bundling anyway — it may fail at runtime without the adapter.\n');
  } else if (!isFetchHandler && !usesExpress) {
    console.log('NOTE: no `export default { fetch }` handler detected — Workers needs one.');
    console.log('If this is an Express app, see the adapter note above.\n');
  }

  const cents = Math.round(price * 100);
  const name = flag('name') || path.basename(projectDir).replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'nanotab-api';
  const outDir = path.join(projectDir, '.nanotab-worker');
  fs.mkdirSync(outDir, { recursive: true });
  const bundleOut = path.join(outDir, 'worker.js');

  // 1. Bundle with esbuild.
  console.log(`bundling ${entry} → ${bundleOut} …`);
  const eb = spawnSync('npx', ['--yes', 'esbuild', entry, '--bundle', `--outfile=${bundleOut}`, '--platform=browser', '--format=esm', '--target=es2022', '--log-level=warning'], { cwd: projectDir, stdio: 'inherit', shell: process.platform === 'win32' });
  let bundled = eb.status === 0;
  if (!bundled && /@nanotab\/merchant/.test(src)) {
    console.log('@nanotab/merchant not resolvable — installing in target project…');
    try {
      execSync('npm install @nanotab/merchant', { cwd: projectDir, stdio: 'inherit' });
      console.log('retrying bundle…');
      const eb2 = spawnSync('npx', ['--yes', 'esbuild', entry, '--bundle', `--outfile=${bundleOut}`, '--platform=browser', '--format=esm', '--target=es2022', '--log-level=warning'], { cwd: projectDir, stdio: 'inherit', shell: process.platform === 'win32' });
      bundled = eb2.status === 0;
    } catch { /* fall through to error */ }
  }
  if (!bundled) {
    console.error('error: esbuild bundling failed. Fix the errors above and retry.');
    process.exit(1);
  }

  // 2. wrangler.toml.
  const today = new Date().toISOString().slice(0, 10);
  const toml =
`name = "${name}"
main = ".nanotab-worker/worker.js"
compatibility_date = "${today}"

[vars]
PRICE_USD_CENTS = "${cents}"
MERCHANT_WALLET = "${wallet}"
NETWORK = "base"
ASSET = "USDC"
`;
  const tomlPath = path.join(projectDir, 'wrangler.toml');
  const hadToml = fs.existsSync(tomlPath);
  if (hadToml && !yes) {
    console.log(`\n${tomlPath} already exists — it will be overwritten.`);
    const ans = await ask('overwrite wrangler.toml? [Y/n] ');
    if (!/^\s*(y|yes|)\s*$/i.test(ans)) { console.log('aborted.'); process.exit(1); }
  }
  fs.writeFileSync(tomlPath, toml);
  console.log(`wrote ${tomlPath}${hadToml ? ' (overwritten)' : ''}`);

  // 3. Cloudflare token.
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.log('\nNo CLOUDFLARE_API_TOKEN in env.');
    console.log('Create one at https://dash.cloudflare.com/profile/api-tokens (Workers: Edit permission).');
    token = (await ask('paste CLOUDFLARE_API_TOKEN: ')).trim();
    if (!token) { console.error('error: token required.'); process.exit(1); }
  }

  // 4. Deploy.
  console.log('\ndeploying to Cloudflare Workers…');
  const dep = spawnSync('npx', ['--yes', 'wrangler', 'deploy'], {
    cwd: projectDir, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
  });
  if (dep.status !== 0) {
    console.error('error: wrangler deploy failed — see output above.');
    process.exit(1);
  }

  const url = `https://${name}.workers.dev`;
  console.log(`\n✅ live at ${url}`);
  console.log(`verify: curl -s ${url}/ | head -c 300  (expect HTTP 402 with payment spec)`);
  console.log(`price: $${price}/call (${cents}¢) → ${wallet} on Base/USDC`);
}

// Runs standalone and when delegated from the `nanotab` bin.
if (require.main === module || process.argv[2] === 'deploy') main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = {};
