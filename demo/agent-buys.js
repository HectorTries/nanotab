const fs = require('fs');
const path = require('path');
const { nanotabFetch } = require('../packages/agent-sdk/dist/index.js');

const API = process.env.NANOTAB_API || 'http://localhost:4021';
const SPEND_LOG = path.join(__dirname, '..', 'nanotab-spend.log');

async function main() {
  if (fs.existsSync(SPEND_LOG)) fs.unlinkSync(SPEND_LOG);
  const terms = ['ai agents', 'crypto wallet', 'seo tools'];
  console.log(`budget $1.00, per-call cap $0.10 — buying ${terms.length} lookups\n`);
  for (const t of terms) {
    const data = await nanotabFetch(`${API}/keyword/${encodeURIComponent(t)}`, {
      policy: { totalBudget: 1.0, maxPerCall: 0.1, maxCallsPerMinute: 30 },
      spendLog: SPEND_LOG,
    });
    console.log(JSON.stringify(data));
  }
  console.log('\n— spend log summary —');
  const lines = fs.readFileSync(SPEND_LOG, 'utf8').trim().split('\n').map(JSON.parse);
  let total = 0;
  for (const l of lines) {
    total += l.amount;
    console.log(`${l.timestamp} ${l.merchant} ${l.url} $${l.amount.toFixed(2)}`);
  }
  console.log(`calls: ${lines.length}, total: $${total.toFixed(2)}`);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
