// NanoTab bare origin API (no paywall — the gateway worker adds the 402 layer).
// Endpoints: GET /health, GET /price, GET /keyword?q=term
// Run: node demo/origin-bare.js (PORT env, default 4022)
const express = require('express');

const PORT = Number(process.env.PORT || 4022);
const PRICE_USD_CENTS = 2; // must match gateway PRICE_USD_CENTS
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || '0xMERCHANT00000000000000000000000000000001';

function seo(term) {
  let h = 0;
  for (const c of term) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    term,
    volume: 1000 + (h % 90000),
    cpc: Number(((h % 500) / 100).toFixed(2)),
    difficulty: h % 100,
    source: 'nanotab-origin',
  };
}

const app = express();
app.get('/health', (req, res) => res.json({ ok: true, service: 'nanotab-origin', time: new Date().toISOString() }));
app.get('/price', (req, res) => res.json({
  price_usd_cents: PRICE_USD_CENTS,
  merchant: MERCHANT_WALLET,
  network: 'base-sepolia',
  asset: 'USDC',
  fee_bps: 10,
}));
app.get('/keyword', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing ?q=term' });
  res.json(seo(q));
});
// legacy path shape used by smoke test
app.get('/keyword/:term', (req, res) => res.json(seo(req.params.term)));

app.listen(PORT, () => console.log(`nanotab-origin on :${PORT} (bare, gateway paywalls)`));
