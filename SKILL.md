# nanotab-pay

Pay for APIs and content with USDC on Base in one call.

## When to use

The user wants an agent to fetch a paid API, paywalled content, or any
URL that returns HTTP 402 — without managing crypto wallets by hand.

## Prerequisites

- Node.js 18+
- A Base-mainnet wallet private key with USDC (no ETH needed — gas is
  sponsored from your USDC via the Circle TokenPaymaster)
- Export it: `export NANOTAB_WALLET_KEY=0xYOUR_KEY`

## Install

```bash
npm i @nanotab/agent-sdk
```

## Pay

```js
import { nanotabFetch } from '@nanotab/agent-sdk';
const data = await nanotabFetch('https://gateway.nanotab.dev/keyword/ai%20agents');
console.log(data);
```

`nanotabFetch` handles the whole 402 flow: it reads the price from the
402 challenge, signs a USDC payment intent, retries with `X-Payment`,
and returns the origin response. Spend is logged to `nanotab-spend.log`.

## Verify it worked

1. The call returns origin data (not a 402) — payment accepted.
2. Check `nanotab-spend.log` for the amount, merchant, and timestamp.
3. Underpay, wrong asset, or bad signature → gateway returns 402 again.

## Optional: budget guard

```bash
npx nanotab init --budget '$1.00' --per-call '$0.10'
```

Caps total spend and per-call spend for the agent.

## Reference

- Gateway: `https://gateway.nanotab.dev`
- Chain: Base mainnet (8453) · USDC `0x833589fCD6eDb6E08f4C7c32D4F71B54bda02913`
- Fee: 0.1% self-host (10 bps) · 2% managed gateway (200 bps), atomic · Minimum: 1¢ · No ETH required
- Integration guide: https://nanotab.dev/agents.html
