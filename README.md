# NanoTab — mainnet (Base, USDC)

Agent-side wallet + merchant middleware + Cloudflare gateway for x402-style HTTP 402 payments in **real USDC on Base mainnet**. Our fee: 0.5% (50 bps).

- Chain: Base mainnet (chain id 8453)
- Asset: USDC `0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5`
- Signing: viem EIP-191 (`nanotab-x402|network=base|to=…|amountCents=…|asset=…`), verifiable for EOAs and (via EIP-1271) Coinbase Smart Wallet owner keys
- Verify: gateway checks amount ≥ price, `to` == `MERCHANT_WALLET`, USDC-on-Base asset, and recovers the signature to `from`; underpays/wrong-asset/bad-sig → 402

## Packages

- `packages/agent-sdk` — `nanotabFetch(url)`: handles 402 → policy check → **real-sign** (key from `NANOTAB_WALLET_KEY`) → retry with `X-Payment`. Spend logging to `nanotab-spend.log`.
- `packages/merchant` — `nanotabCharge({ price, wallet })` Express middleware: 402 with x402 spec (network `base`, USDC mainnet contract), structural verify, settlement accounting log.
- `workers/gateway` — Cloudflare worker: 402 challenge + full verify (structural + EIP-191 recovery) + optional on-chain settlement, proxies to `ORIGIN_URL`.
- `demo/` — `keyword-api.js` ($0.02/call SEO API) + `agent-buys.js`.

## Quickstart

```bash
npm install
npm run build

# terminal 1 — paid API on :4021
node demo/keyword-api.js

# terminal 2 — agent buys 3 keywords on a $1 budget (needs NANOTAB_WALLET_KEY)
NANOTAB_WALLET_KEY=0x… node demo/agent-buys.js
cat nanotab-spend.log
```

Agent SDK CLI:

```bash
NANOTAB_WALLET_KEY=0x… npx nanotab init --budget '$1.00' --per-call '$0.10'
# uses the key's address, writes nanotab.config.json (network: base)
```

Merchant CLI — paywall an existing Express server in one command:

```bash
npx nanotab protect --price 0.02 --wallet 0xMERCHANT [--route "/keyword/*"] [--yes] ./server.js
```

## Gateway deploy

```bash
cd workers/gateway
npm run deploy   # or: npx wrangler deploy
```

Required config (`wrangler.toml` `[vars]` or secrets):

| Var | How | Notes |
|---|---|---|
| `ORIGIN_URL` | vars | e.g. `https://origin.nanotab.dev` |
| `PRICE_USD_CENTS` | vars | `"2"` = $0.02/call |
| `MERCHANT_WALLET` | **secret** | `wrangler secret put MERCHANT_WALLET` — Hector must set the real merchant address; placeholder in repo is NOT a real address |
| `NANOTAB_FEE_BPS` | vars | `50` = 0.5% |
| `FEE_WALLET` | secret (optional) | NanoTab fee recipient; fee accrual logged if unset |
| `SETTLER_KEY` | secret (optional) | settler private key — enables on-chain merchant transfer per call; **NEVER commit** |
| `BASE_RPC_URL` | vars (optional) | defaults to `https://mainnet.base.org` |

## Settlement model: paymaster-sponsored by default

Nobody touches ETH — not the agent, not the merchant. Gas is paid from the
user's USDC via the **Circle TokenPaymaster** (permissionless ERC-4337
paymaster, live on Base mainnet; +10% gas surcharge in USDC).

```
agent signs UserOp ──▶ Circle paymaster takes ETH-gas equivalent from user's USDC
        │
        ▼
USDC transfer executes on Base ──▶ merchant gets USDC minus 0.5% NanoTab fee
```

1. **Default (paymaster path):** `buildPaymasterUserOp()` in
   `packages/agent-sdk/src/wallet.ts` routes the USDC transfer through
   Circle's EntryPoint-v0.8 TokenPaymaster
   (`0x0578cFB241215b77442a541325d6A4E6dFE700Ec` on Base). The agent needs
   only USDC — zero ETH. Requires a 4337 smart account + bundler at submit time.
2. **Fallback (settler flow):** the EIP-191 intent signature
   (`signPayment`) is kept on every UserOp and verified by the gateway as
   today. When `SETTLER_KEY` is set, the gateway submits the on-chain
   merchant transfer per call and logs the tx hash (`x-nanotab-settle`).
3. **Fee handling:** 0.5% computed in USDC base units per call, logged
   (`fee → FEE_WALLET` when set, else fee-ledger for batch sweep).

Footnote: the legacy settler path still needs a little ETH on the *settler*
key only. The agent wallet and merchant never need ETH under either path
once the paymaster route is live end-to-end.

## Settlement model (legacy detail)

1. **Authorization (always on):** payer signs the canonical message; gateway recovers signer via EIP-191 and enforces amount/asset/merchant. Tampered sigs, underpays, wrong asset/network → 402.
2. **On-chain merchant transfer (when `SETTLER_KEY` set):** gateway submits `USDC.transfer(MERCHANT_WALLET, gross − fee)` on Base and logs the tx hash (`x-nanotab-settle` response header). One transfer per call keeps gas simple.
3. **Fee handling:** the 0.5% fee is computed in USDC base units per call and logged (`fee → FEE_WALLET` when set, else fee-ledger for batch sweep by ops). No dust transfers per call.
4. **Without `SETTLER_KEY`:** payer authorization is verified + logged with the merchant-net/fee split; the payer submits the on-chain USDC transfer themselves. Response header `x-nanotab: authorized-logged` vs `settled-onchain` makes the mode explicit.

## Test with real money (small amounts)

1. Fund a throwaway wallet with ~$0.10 USDC on Base — that's it, no ETH needed (gas comes from USDC via the paymaster).
2. `MERCHANT_WALLET` = an address you control; `PRICE_USD_CENTS=2` ($0.02).
3. `NANOTAB_WALLET_KEY=<throwaway key> node demo/agent-buys.js` → each call moves real $0.02 USDC.
4. Confirm on Basescan: merchant address receives 19900 units/call ($0.0199), fee ledger accrues 100 units/call.
5. Local smoke (no funds needed): run origin + `wrangler dev`, then `NANOTAB_TEST_KEY=<throwaway, unfunded> npm test` in `workers/gateway` — exercises 402, underpay, wrong-asset, bad-sig, and valid-sig→200 paths with real cryptography.

## What still needs Hector

- **Real `MERCHANT_WALLET`** via `wrangler secret put MERCHANT_WALLET` (repo placeholder is not a real address).
- **Funded wallets:** payer USDC on Base; settler ETH (gas) + USDC float if `SETTLER_KEY` mode is wanted.
- **`FEE_WALLET`** address for fee collection (else batch-swept from ledger).
- First real-money E2E on mainnet (staged: Sepolia key-gen flow works; mainnet transfer tested with unfunded throwaway sigs only — no funds moved yet).
