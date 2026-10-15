# @nanotab/merchant

Express middleware for x402-style 402 charges. **Base mainnet, USDC `0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5`.**

```ts
import express from 'express';
import { nanotabCharge } from '@nanotab/merchant';

const app = express();
app.get('/keyword/:term', nanotabCharge({ price: 0.02, wallet: '0xMERCHANT' }), (req, res) => {
  res.json({ term: req.params.term });
});
```

## 402 schema

`{ x402Version: 1, accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: '<cents>', resource, payTo, asset: USDC_BASE, fee: '0.5%' }] }`

## Verification

Structural: well-formed header, `to` == merchant (case-insensitive), `amount` ≥ price (BigInt compare), asset == USDC-on-Base, network == `base` when present. Full EIP-191 signature recovery is enforced at the gateway (`workers/gateway`); use this middleware behind the gateway or add an async sig check in your own stack.

Settlement accounting (0.5% fee split) is logged per call; on-chain merchant transfer happens at the gateway when `SETTLER_KEY` is configured.
