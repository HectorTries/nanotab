#!/usr/bin/env node
/**
 * nanotab protect — wrap Express routes with nanotabCharge() paywall.
 *
 * Usage:
 *   npx nanotab protect --price 0.02 --wallet 0xMERCHANT [--route "/keyword/*"] [--yes] ./server.js
 *
 * MVP: regex-based route matching, no babel. Anything ambiguous is flagged, never mis-edited.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

const IMPORT_CJS = `const { nanotabCharge } = require('@nanotab/merchant');`;
const IMPORT_ESM = `import { nanotabCharge } from '@nanotab/merchant';`;

function usageAndExit(code = 1) {
  console.log(`Usage: nanotab protect --price <usd> --wallet <0x..> [--route "<glob>"] [--yes] <file.js>

  --price   charge per call in USD (e.g. 0.02)
  --wallet  merchant wallet receiving settlement
  --route   only wrap routes matching glob, e.g. "/keyword/*" (default: all app.get routes)
  --include-health  wrap health-check routes too (skipped by default)
  --yes     apply without prompting (otherwise prints diff + asks Y/n)
  (-y, --yes=true also accepted)

  health-check routes (/health, /ready, /live, /status + z-variants) are
  skipped by default — pass --include-health or an explicit --route
  matching them to include.`);
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

/** Convert a simple glob (only * supported) to RegExp, anchored. */
function globToRegExp(glob) {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`);
}

/** Health-check endpoints are never paywalled unless --include-health or an
 *  explicit --route matching them is given. Load balancers / uptime probes
 *  must reach them without paying. */
const HEALTH_PATH_RE = /^\/(healthz?|readyz?|livez?|ready|live|status)([/?#].*)?$/i;

/** Express-style path like /keyword/:term matches a concrete sample; for matching
 *  route *definitions* against the user's glob, treat :params as wildcards. */
function routeDefMatches(routePath, filterRe) {
  if (filterRe.test(routePath)) return true;
  const paramWild = routePath.replace(/:[^/]+/g, '*');
  return filterRe.test(paramWild);
}

function main() {
  const priceRaw = flag('price');
  const wallet = flag('wallet');
  const routeGlob = flag('route');
  const includeHealth = hasFlag('include-health');
  const yes = hasFlag('yes') || hasFlag('y') || process.argv.includes('-y') || process.argv.some((a) => a === '--yes=true' || a === '--yes=1');
  // Bare `-y` is a flag (not a target file): drop it before target detection.
  const rest = process.argv.slice(2).filter((a) => a !== 'protect' && a !== '-y');
  const usedAsValue = new Set(['price', 'wallet', 'route'].flatMap((n) => {
    const i = rest.indexOf(`--${n}`);
    return i >= 0 ? [rest[i + 1]] : [];
  }));
  const target = rest.find((a) => !a.startsWith('--') && !usedAsValue.has(a));

  if (flag('help') !== undefined || hasFlag('help') || !priceRaw || !wallet || !target) usageAndExit(1);
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) {
    console.error('error: --price must be a positive number (USD).');
    process.exit(1);
  }

  const file = path.resolve(target);
  if (!fs.existsSync(file)) {
    console.error(`error: file not found: ${file}`);
    process.exit(1);
  }
  const projectDir = path.dirname(file);

  // 1. Ensure @nanotab/merchant is installed in the target project.
  let hasDep = false;
  for (const pj of [path.join(projectDir, 'package.json'), path.join(process.cwd(), 'package.json')]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['@nanotab/merchant']) { hasDep = true; break; }
    } catch { /* no package.json there */ }
  }
  if (!hasDep) {
    // Unpublished (monorepo dev)? Resolvable from here counts as available.
    try {
      require.resolve('@nanotab/merchant', { paths: [projectDir, process.cwd(), __dirname] });
      hasDep = true;
    } catch { /* not resolvable — needs install */ }
  }
  if (!hasDep) {
    console.log('@nanotab/merchant not found in target project — installing…');
    try {
      execSync('npm install @nanotab/merchant', { cwd: projectDir, stdio: 'inherit' });
    } catch {
      console.error('error: npm install @nanotab/merchant failed. Install it manually and re-run.');
      process.exit(1);
    }
  } else {
    console.log('@nanotab/merchant already present — skipping install.');
  }

  // 2. Parse + transform.
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const filterRe = routeGlob ? globToRegExp(routeGlob) : null;
  const chargeArg = `nanotabCharge({ price: ${price}, wallet: '${wallet}' })`;

  const alreadyImported = /require\s*\(\s*['"]@nanotab\/merchant['"]\s*\)/.test(src) || /import\s+[^;]*['"]@nanotab\/merchant['"]/.test(src);
  const isESM = !/require\s*\(/.test(src) && /^\s*import\s/m.test(src);

  // Matches: app.get('/path', ...  router.post("/path", ...  app.use(`/path`, ...
  // Captures: receiver (app|router), method, quote, route path, rest of line after the path's closing quote.
  const routeRe = /\b(app|router)\s*\.\s*(get|post|put|delete|patch|use|all)\s*\(\s*(['"`])((?:(?!\3).)*)\3/;
  const ambiguousRe = /\b(app|router)\s*\.\s*(get|post|put|delete|patch|use|all|route)\s*\(/;
  const varOrTemplateRe = /\b(app|router)\s*\.\s*(get|post|put|delete|patch|use|all)\s*\(\s*[^'"`\s]/; // path is not a string literal

  const touched = [];
  const skipped = [];
  const ambiguous = [];
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(routeRe);
    if (!m) {
      if (ambiguousRe.test(line) && !/require\(/.test(line)) ambiguous.push({ line: i + 1, text: line.trim() });
      else if (varOrTemplateRe.test(line)) ambiguous.push({ line: i + 1, text: line.trim() });
      out.push(line);
      continue;
    }
    const [, receiver, method, , routePath] = m;
    const where = `${receiver}.${method}`;
    if (line.includes('nanotabCharge')) {
      skipped.push({ method: where, path: routePath, reason: 'already wrapped' });
      out.push(line);
      continue;
    }
    // Template literals with ${} are dynamic — flag, don't touch.
    // Static template literals (no ${}) are safe to wrap.
    if (m[3] === '`' && routePath.includes('${')) {
      ambiguous.push({ line: i + 1, text: line.trim() });
      out.push(line);
      continue;
    }
    // app.use('/prefix', router) mounts middleware, not a payable route — flag, don't wrap.
    if (method === 'use' && /,\s*(router\b|\w+Router\b)/.test(line)) {
      ambiguous.push({ line: i + 1, text: `router mount (not wrapped): ${line.trim()}` });
      out.push(line);
      continue;
    }
    // Health-check endpoints stay public by default (load balancers / uptime
    // probes must reach them without paying). --include-health or an explicit
    // --route matching them opts back in.
    if (!includeHealth && !filterRe && HEALTH_PATH_RE.test(routePath)) {
      skipped.push({ method: where, path: routePath, reason: 'health-check route (skipped by default; use --route to include)' });
      out.push(line);
      continue;
    }
    const inScope = filterRe ? routeDefMatches(routePath, filterRe) : method === 'get';
    if (!inScope) {
      skipped.push({ method, path: routePath, reason: filterRe ? 'outside --route filter' : 'not a GET route (default wraps GET only)' });
      out.push(line);
      continue;
    }
    // Insert chargeArg right after the route-path argument: app.get('/p', <HERE>handler...
    const patched = line.replace(routeRe, (full, recv, meth, q, rp) => {
      // Rebuild the matched prefix and append the middleware after `'<path>',`.
      const prefixEnd = full.lastIndexOf(q) + 1;
      return full.slice(0, prefixEnd) + `, ${chargeArg}` + full.slice(prefixEnd);
    });
    touched.push({ method: where, path: routePath });
    out.push(patched);
  }

  if (touched.length === 0) {
    console.log('nothing to wrap.');
    if (ambiguous.length) {
      console.log('\nambiguous (left untouched — review manually):');
      for (const a of ambiguous) console.log(`  line ${a.line}: ${a.text}`);
    }
    if (skipped.length) {
      console.log('\nskipped:');
      for (const s of skipped) console.log(`  ${s.method} ${s.path} — ${s.reason}`);
    }
    return;
  }

  let next = out.join('\n');
  let importNote = 'import already present';
  if (!alreadyImported) {
    const importLine = isESM ? IMPORT_ESM : IMPORT_CJS;
    const lns = next.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lns.length; i++) {
      if (/^\s*(const|let|var)\s+.*=\s*require\s*\(/.test(lns[i]) || /^\s*import\s/.test(lns[i])) insertAt = i + 1;
      else if (lns[i].trim() === '' || lns[i].startsWith('//') || lns[i].startsWith('#')) continue;
      else break;
    }
    lns.splice(insertAt, 0, importLine);
    next = lns.join('\n');
    importNote = `added \`${importLine}\``;
  }

  // 3. Diff for review.
  const tmpNew = file + '.nanotab-new';
  fs.writeFileSync(tmpNew, next);
  let diff = '';
  try {
    execSync(`diff -u ${JSON.stringify(file)} ${JSON.stringify(tmpNew)}`, { encoding: 'utf8' });
  } catch (e) {
    diff = e.stdout || '';
  } finally {
    fs.unlinkSync(tmpNew);
  }
  console.log(`\n--- proposed changes to ${target} (${importNote}) ---\n`);
  console.log(diff || '(no textual diff — unexpected)');

  console.log(`\nwill wrap ${touched.length} route(s):`);
  for (const t of touched) console.log(`  ${t.method} ${t.path}  →  $${price}/call → ${wallet}`);
  if (skipped.length) {
    console.log(`skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s.method} ${s.path} — ${s.reason}`);
  }
  if (ambiguous.length) {
    console.log(`\nambiguous — left untouched, review manually:`);
    for (const a of ambiguous) console.log(`  line ${a.line}: ${a.text}`);
  }

  const apply = () => {
    fs.writeFileSync(file, next);
    console.log(`\nwrote ${target} — ${touched.length} route(s) protected at $${price}/call → ${wallet}`);
  };

  if (yes) { apply(); return; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\napply these changes? [Y/n] ', (ans) => {
    rl.close();
    if (/^\s*(y|yes|)\s*$/i.test(ans)) apply();
    else console.log('aborted — no changes written.');
  });
}

// Runs standalone (`node protect.js …`) and when delegated from the `nanotab`
// bin (`node dist/cli.js protect …`, where require.main is cli.js).
if (require.main === module || process.argv[2] === 'protect') main();
module.exports = { globToRegExp, routeDefMatches };
