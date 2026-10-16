#!/usr/bin/env node
// Regression tests for `nanotab protect` (gaps 2 + 4, 2026-10-16):
//   Gap 2: --yes must apply the change to the target file in-place.
//   Gap 4: /health-style routes are skipped by default; --route glob still works.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PROTECT = path.join(__dirname, 'protect.js');
const MIRROR = path.join(__dirname, 'protect.js');

let pass = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`ok - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}: ${e.message}`); process.exitCode = 1; }
}
function tmpSrv(lines) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-protect-'));
  fs.writeFileSync(path.join(d, 'package.json'), '{"dependencies":{"express":"^4"}}');
  const f = path.join(d, 'srv.js');
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}
function run(file, args) {
  return execFileSync('node', [PROTECT, 'protect', ...args, file], { encoding: 'utf8' });
}
const BASE = [
  "const express = require('express');",
  'const app = express();',
  "app.get('/health', (req, res) => res.send('ok'));",
  "app.get('/ready', (req, res) => res.send('ok'));",
  "app.get('/live', (req, res) => res.send('ok'));",
  "app.get('/status', (req, res) => res.send('ok'));",
  "app.get('/keyword/:term', (req, res) => res.json({}));",
  'app.listen(3000);',
];

// Mirror copies must stay identical (both are published paths).
check('cli mirror copies identical', () => {
  assert.strictEqual(fs.readFileSync(PROTECT, 'utf8'), fs.readFileSync(MIRROR, 'utf8'));
});

// Gap 2: --yes applies in place.
check('--yes applies change in place', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--yes']);
  const out = fs.readFileSync(f, 'utf8');
  assert.ok(out.includes("nanotabCharge({ price: 0.02, wallet: '0xABC' })"), 'wrapped middleware missing');
  assert.ok(!fs.existsSync(f + '.nanotab-new'), '.nanotab-new temp file leaked');
});
check('-y alias applies change in place', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '-y']);
  assert.ok(fs.readFileSync(f, 'utf8').includes('nanotabCharge('), 'wrapped middleware missing');
});

// Gap 4: health skipped by default, --route still works.
check('/health skipped by default', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--yes']);
  const out = fs.readFileSync(f, 'utf8');
  assert.ok(out.includes("app.get('/health', (req, res)"), '/health was wrapped');
});
check('all health-style routes skipped by default', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--yes']);
  const out = fs.readFileSync(f, 'utf8');
  for (const p of ['/health', '/ready', '/live', '/status']) {
    assert.ok(out.includes(`app.get('${p}', (req, res)`), `${p} was wrapped`);
    assert.ok(!out.includes(`'${p}', nanotabCharge(`), `${p} was wrapped`);
  }
  assert.ok(out.includes("'/keyword/:term', nanotabCharge("), '/keyword not wrapped');
});
check('--include-health wraps health routes', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--include-health', '--yes']);
  const out = fs.readFileSync(f, 'utf8');
  for (const p of ['/health', '/ready', '/live', '/status']) {
    assert.ok(out.includes(`'${p}', nanotabCharge(`), `${p} not wrapped`);
  }
});
check('--route glob wraps matching routes incl. non-GET', () => {
  const f = tmpSrv([...BASE.slice(0, 6), "app.post('/keyword/run', (req, res) => res.json({}));", BASE[6]]);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--route', '/keyword/*', '--yes']);
  const out = fs.readFileSync(f, 'utf8');
  assert.ok(out.includes("'/keyword/:term', nanotabCharge("), 'GET /keyword not wrapped');
  assert.ok(out.includes("'/keyword/run', nanotabCharge("), 'POST /keyword not wrapped');
  assert.ok(out.includes("app.get('/health', (req, res)"), '/health was wrapped');
});
check('explicit --route /health opts in', () => {
  const f = tmpSrv(BASE);
  run(f, ['--price', '0.02', '--wallet', '0xABC', '--route', '/health', '--yes']);
  assert.ok(fs.readFileSync(f, 'utf8').includes("'/health', nanotabCharge("), '/health not wrapped');
});

console.log(`\n${pass} passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
