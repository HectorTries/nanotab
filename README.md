# NanoTab MVP

Agent-side wallet + merchant middleware for x402-style HTTP 402 payments (USDC on Base). Our fee: 0.5%.

## Packages

- `packages/agent-sdk` — `nanotabFetch(url)` agent client: handles 402 → policy check → mock-sign → retry with `X-Payment`. Spend logging to `nanotab-spend.log`.
- `packages/merchant` — `nanotabCharge({ price, wallet })` Express middleware: 402 with x402 spec, mock-verify, settle minus 0.5% fee.
- `demo/` — `keyword-api.js` ($0.02/call SEO API) + `agent-buys.js` (buys 3 lookups on a $1 budget).

## What's mocked (MVP)

- **Wallet signing** — fake signatures, no chain interaction. Base Sepolia only.
- **Payment verification** — accepts any well-formed `X-Payment` header (base64 JSON with `amount`, `to`, `asset`, `signature`).
- **Settlement** — no on-chain transfer; merchant logs `gross - 0.5% fee = net`.
- Real mainnet wiring = next step (viem + Coinbase Smart Wallet SDK + x402 facilitator).

## Quickstart

```bash
npm install
npm run build

# terminal 1 — paid API on :4021
node demo/keyword-api.js

# terminal 2 — agent buys 3 keywords on a $1 budget
node demo/agent-buys.js
cat nanotab-spend.log
```

Agent SDK CLI:

```bash
npx nanotab init --budget '$1.00' --per-call '$0.10'
# creates mock wallet, prints Base Sepolia onramp link, writes nanotab.config.json
```

Merchant CLI — paywall an existing Express server in one command:

```bash
npx nanotab protect --price 0.02 --wallet 0xMERCHANT [--route "/keyword/*"] [--yes] ./server.js
```

What it does:

1. Installs `@nanotab/merchant` into the target project if missing (skipped when resolvable from the monorepo).
2. Inserts the `require('@nanotab/merchant')` import + wraps matching routes with `nanotabCharge({ price, wallet })`.
3. Prints a `diff -u` preview and asks `Y/n` before writing (`--yes` skips the prompt).
4. Default wraps all `app.get` routes with string-literal paths; `--route "<glob>"` (`*` wildcard, `:params` count as wildcards) limits to matches. `app.post`/`app.use` are only wrapped when they match `--route`.

Regex-based MVP, no babel: variable/template-literal paths, `app.all`/`app.route`, routers, and already-wrapped routes are flagged and left untouched — never mis-edited.

## Next steps for mainnet

1. Replace `wallet.ts` mock with viem + Coinbase Smart Wallet (ERC-4337) on Base.
2. Verify `X-Payment` against USDC contract transfer + facilitator signature.
3. Settle on-chain (merchant `payTo` minus 0.5% NanoTab fee split).
4. Switch `network: 'base-sepolia'` → `'base'`, `asset: 'USDC'` to mainnet contract address.
