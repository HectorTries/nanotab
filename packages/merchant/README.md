# @nanotab/merchant

Express middleware for x402-style 402 charges. MOCKED settlement (Base Sepolia).

```ts
import express from 'express';
import { nanotabCharge } from '@nanotab/merchant';

const app = express();
app.get('/keyword/:term', nanotabCharge({ price: 0.02, wallet: '0xMERCHANT' }), (req, res) => {
  res.json({ term: req.params.term });
});
```

## 402 schema

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "2",
      "resource": "http://host/keyword/foo",
      "payTo": "0xMERCHANT",
      "asset": "USDC",
      "fee": "0.5%"
    }
  ]
}
```

- `maxAmountRequired` — USD **cents** as string (`'2'` = $0.02).
- Client pays by retrying with `X-Payment: base64({ amount, to, asset, network, signature, from })`.
- Verification is mocked: any well-formed header with matching `to` and sufficient `amount` passes.
- Settlement is mocked: server logs `gross − 0.5% fee = net`, no on-chain transfer.
