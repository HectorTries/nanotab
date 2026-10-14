# NanoTab gateway worker

Paywalls **any** origin API with x402-style 402s. Zero code changes on the merchant side.

## How it works

1. Request hits the worker with no `X-Payment` header → **402** with payment spec (`x402Version`, `accepts[{scheme: exact, network: base-sepolia, maxAmountRequired, resource, payTo, asset: USDC, fee}]`).
2. Agent pays (USDC, Base Sepolia) and retries with `X-Payment: base64({amount, to, asset, network, signature, from})`.
3. Worker verifies (⚠️ **MOCKED for MVP** — well-formed + matching `to`/amount passes, same as `@nanotab/merchant`), logs `gross − 0.5% fee = net`, and proxies to `ORIGIN_URL`.

## Config (env vars)

| Var | Example |
|---|---|
| `ORIGIN_URL` | `https://api.theirsite.com` (no trailing slash) |
| `PRICE_USD_CENTS` | `"2"` = $0.02/call |
| `MERCHANT_WALLET` | `0x…` |
| `NANOTAB_FEE_BPS` | `"50"` = 0.5% (default 50) |
| `NETWORK` / `ASSET` | `base-sepolia` / `USDC` |

## Deploy

```bash
cd workers/gateway
npm install
wrangler login
# set secrets (or edit [vars] in wrangler.toml)
wrangler secret put ORIGIN_URL        # https://api.theirsite.com
wrangler secret put PRICE_USD_CENTS   # 2
wrangler secret put MERCHANT_WALLET   # 0x…
wrangler deploy
```

Point agents / DNS at `https://nanotab-gateway.<you>.workers.dev`.

## Local test

```bash
# terminal 1 — origin (demo keyword API, $0.02/call logic lives in gateway now)
node ../../demo/keyword-api.js   # :4021 — note: demo has its own middleware; for a pure
                                 # gateway test point ORIGIN_URL at a bare API instead
# terminal 2 — gateway (override ORIGIN_URL to local origin)
ORIGIN_URL=http://localhost:4021 npx wrangler dev --port 8787
# terminal 3
GW_URL=http://localhost:8787 npm test
```
