# @nanotab/agent-sdk

Agent-side client for x402-style 402 payments. **Real signing: viem EIP-191 on Base mainnet, USDC `0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5`.**

## Quickstart

```bash
NANOTAB_WALLET_KEY=0x… npx nanotab init --budget '$1.00' --per-call '$0.10'
```

```ts
import { nanotabFetch } from '@nanotab/agent-sdk';
// needs NANOTAB_WALLET_KEY env for real signing
const data = await nanotabFetch('https://gateway.nanotab.dev/keyword/ai%20agents');
```

Every paid call appends a JSON line to `nanotab-spend.log`: `{ timestamp, url, amount, merchant }`.

Key never touches the repo — env only. Without the env key, `nanotabFetch` throws (local demos may pass an explicit address + `NANOTAB_ALLOW_MOCK=1` for offline sig-shape tests only).

## Wallet API

```ts
import { createSmartWallet, USDC_BASE, centsToUsdcUnits, encodeUsdcTransfer } from '@nanotab/agent-sdk';
const w = createSmartWallet(process.env.NANOTAB_WALLET_KEY as `0x${string}`);
const sig = await w.signPayment({ to: payTo, amountCents: '2', asset: USDC_BASE });
const header = await w.paymentHeader({ to: payTo, amountCents: '2' }); // X-Payment value
const bal = await w.getUsdcBalance(); // Base mainnet USDC base units
```

Same key can be an owner of a Coinbase Smart Wallet (ERC-4337) — the signed intent is EIP-191, verifiable for EOAs and (via EIP-1271) smart-wallet accounts.

## Policy

`parseUsd('$0.10') → 0.10`. `PolicyEngine.check()` rejects when amount exceeds `maxPerCall`, cumulative spend would exceed `totalBudget`, merchant is not in `allowlist`, or more than `maxCallsPerMinute` paid calls occur in a rolling 60s window.
