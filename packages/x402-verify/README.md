# @nanotab/x402-verify

Shared NanoTab x402 payment verification (USDC on Base mainnet). Extracted
verbatim from `workers/gateway/src/index.ts`; imported by `workers/gateway`
(env-level price/wallet) and `workers/publish` (per-listing price/wallet
from the KV record). Env-agnostic: every function takes explicit args.

## Layout

- `src/pure.ts` — dependency-free: constants, `PaymentProof`, `paymentMessage`,
  `splitPaymentMessage`, `feeRecipientFor`, `assetOk`, `verifyPayment`,
  `verifyFeeSplit`, `centsToUnits`, `splitFee`, `topicToAddress`.
  Importable from plain `node` (type stripping) with zero installs.
- `src/onchain.ts` — `verifyBuyerTx` (needs `viem` + network).
- `src/index.ts` — barrel re-exporting both.

## Exports

- `verifyPayment(header, to, amountCents)` — structural X-Payment proof check
  (well-formed, right merchant, sufficient amount, USDC-on-Base).
- `verifyFeeSplit(proof, amountCents, feeBps?, feeWalletOverride?)` — atomic
  fee-split enforcement: `split.feeTo` must equal the fee recipient,
  `feeAmount`/`merchantAmount` must equal exact fee math. Throws otherwise.
- `verifyBuyerTx({rpcUrl?, merchantWallet, feeTo, feeBps?, txHash, amountCents})`
  — on-chain receipt check: the tx must hold EXACTLY the two USDC legs
  (net → merchant, fee → fee wallet). `rpcUrl` defaults to
  `https://mainnet.base.org`.
- Fee math + constants: `centsToUnits`, `splitFee`, `feeRecipientFor`,
  `paymentMessage`, `splitPaymentMessage`, `assetOk`, `topicToAddress`,
  `USDC_BASE_MAINNET`, `NANOTAB_NETWORK` (`base`), `NANOTAB_NETWORK_CAIP2`
  (`eip155:8453`), `NANOTAB_PROTOCOL_WALLET`, `PROTOCOL_FEE_BPS`,
  `USDC_DECIMALS`, `ERC20_TRANSFER_TOPIC`.

## Per-listing use (publish worker)

Pass the listing's values explicitly — the only semantic delta vs the
gateway's env-level config:

```ts
import { verifyPayment, verifyFeeSplit, verifyBuyerTx, feeRecipientFor } from '@nanotab/x402-verify';

const proof = verifyPayment(header, listing.merchant_wallet, listing.price_cents);
verifyFeeSplit(proof, listing.price_cents, feeBps);
if (proof.txHash) await verifyBuyerTx({ merchantWallet: listing.merchant_wallet, feeTo: feeRecipientFor(), feeBps, txHash: proof.txHash, amountCents: listing.price_cents });
```

Workers import via relative path
(`../../../packages/x402-verify/src/index.ts`) so wrangler bundles it with
no extra build step; plain `node` (v22.6+ type stripping) imports `pure.ts`
directly in tests. Requires `viem` (dependency, hoisted at the repo root).
