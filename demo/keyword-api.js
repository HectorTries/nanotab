const express = require('express');
const { nanotabCharge } = require('../packages/merchant/dist/index.js');

const MERCHANT_WALLET = process.env.MERCHANT_WALLET || '0xMERCHANT00000000000000000000000000000001';
const PRICE = 0.02; // $0.02 / call
const PORT = 4021;

const app = express();

function fakeSeo(term) {
  let h = 0;
  for (const c of term) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    term,
    volume: 1000 + (h % 90000),
    cpc: Number(((h % 500) / 100).toFixed(2)),
    difficulty: h % 100,
  };
}

app.get('/keyword/:term', nanotabCharge({ price: PRICE, wallet: MERCHANT_WALLET }), (req, res) => {
  res.json(fakeSeo(req.params.term));
});

app.listen(PORT, () => console.log(`keyword-api on http://localhost:${PORT} — $0.02/call → ${MERCHANT_WALLET}`));
