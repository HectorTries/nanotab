# NanoTab gateway worker

Paywalls **any** origin API with x402-style 402s. Zero code changes on the merchant side. **Base mainnet, real USDC.**

## How it works

1. No `X-Payment` → **402** with payment spec (`x402Version`, `accepts[{scheme: exact, network: base, maxAmountRequired, resource, payTo, asset: USDC_BASE, fee}]`).
2. Agent signs (viem EIP-191, key from `NANOTAB_WALLET_KEY`) and retries with `X-Payment: base64({amount, to, asset, network, signature, from, split?})` — `split = {feeTo, feeAmount, merchantAmount}` (USDC base units) is **required when `FEE_WALLET` is set**.
3. Worker verifies structurally (amount ≥ price, `to` == `MERCHANT_WALLET`, USDC-on-Base) **plus the atomic fee split** (`feeTo` == `FEE_WALLET`, fee == floor(gross·bps/10_000), net == gross − fee) **plus EIP-191 signature recovery** over the split-committed message. Underpay / wrong-asset / wrong-network / bad-sig / missing-or-wrong-fee-leg → 402.
4. Settlement: if `SETTLER_KEY` secret is set → on-chain `USDC.transfer(MERCHANT_WALLET, gross − fee)` on Base, tx hash in `x-nanotab-settle` header. Otherwise payer authorization is verified + logged (`x-nanotab: authorized-logged`), payer submits the transfer. Fee (default 10 bps) logged per call → `FEE_WALLET` or fee-ledger.
5. Proxies to `ORIGIN_URL`.

## Config

| Var | Example | How |
|---|---|---|
| `ORIGIN_URL` | `https://origin.nanotab.dev` | vars |
| `PRICE_USD_CENTS` | `"2"` = $0.02/call | vars |
| `MERCHANT_WALLET` | `0x…` (real address) | **secret** — `wrangler secret put MERCHANT_WALLET` |
| `NANOTAB_FEE_BPS` | `"10"` = 0.1% | vars |
| `FEE_WALLET` | `0x…` | secret — `wrangler secret put FEE_WALLET`. When set, enforces the atomic split (missing/wrong fee leg → 402). Unset = legacy single-transfer mode |
| `SETTLER_KEY` | hex key, never commit | secret (optional, enables on-chain transfer) |
| `BASE_RPC_URL` | Base RPC | vars (optional) |

`NETWORK`/`ASSET` are pinned to `base` / USDC mainnet contract in code.

## Deploy

```bash
npx wrangler deploy   # needs CLOUDFLARE_API_TOKEN
```

## Smoke test (no funds needed)

```bash
# terminal 1: origin — node demo/keyword-api.js  (repo root)
# terminal 2: ORIGIN_URL=http://localhost:4021 npx wrangler dev --port 8787
# terminal 3:
NANOTAB_TEST_KEY=<throwaway, unfunded> npm test
# 6 checks: 402, schema, bad-header, underpay, wrong-asset, valid-sig→200
```
