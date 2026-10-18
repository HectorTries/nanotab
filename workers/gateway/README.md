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
| `FEE_WALLET` | `0x…` | optional override — `wrangler secret put FEE_WALLET`. Unset = hardcoded protocol wallet `0xc47b6d6a4137373ab169aeeedb95971d4939ef0b`. The atomic split is enforced on EVERY paid call (missing/wrong fee leg → 402) |

> 0.1% protocol fee to NanoTab on every paid call, non-optional.
| `SETTLER_KEY` | hex key, never commit | secret (optional, enables on-chain transfer) |
| `BASE_RPC_URL` | Base RPC | vars (optional) |

`NETWORK`/`ASSET` are pinned to `base` / USDC mainnet contract in code.

## Stats (public `GET /stats`)

Every successful paid verification logs fire-and-forget counters to a KV
namespace: `total_paid_calls`, `total_volume_usdc_units`, `merchant:<addr>`,
`day:YYYY-MM-DD`. `GET /stats` returns
`{total_paid_calls, total_volume_usdc, by_merchant (top 20), last_7_days, fee_wallet, fee_bps}` —
public, no auth (marketing numbers), cached 60s. Works with zero KV too
(all zeros when `NANOTAB_STATS` is unbound).

One-time setup:

```bash
wrangler kv namespace create NANOTAB_STATS
# paste the returned id into wrangler.toml under [[kv_namespaces]] (already stubbed, commented out)
```

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
