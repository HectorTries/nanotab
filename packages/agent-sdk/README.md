# @nanotab/agent-sdk

Agent-side client for x402-style 402 payments. MOCKED wallet (Base Sepolia).

## Quickstart

```bash
npx nanotab init --budget '$1.00' --per-call '$0.10'
```

```ts
import { nanotabFetch } from '@nanotab/agent-sdk';
const data = await nanotabFetch('http://localhost:4021/keyword/ai%20agents');
```

Every paid call appends a JSON line to `nanotab-spend.log`: `{ timestamp, url, amount, merchant }`.

## Policy

`parseUsd('$0.10') → 0.10`. `PolicyEngine.check()` rejects when amount exceeds `maxPerCall`, cumulative spend would exceed `totalBudget`, merchant is not in `allowlist`, or more than `maxCallsPerMinute` paid calls occur in a rolling 60s window.

## Mocked

Fake signatures via `createMockWallet().signPayment()` — no private key, no bundler, no chain. Verification server-side accepts any well-formed `X-Payment` header.
