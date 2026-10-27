# nanotab-publish

NanoTab hosted one-click agent paywalls (MVP step 2). Paste content in,
get a public `https://pay.nanotab.dev/r/<slug>` URL that returns a 402
challenge to agents/browsers and serves the bytes after a valid x402
payment (USDC on Base, 2% protocol fee). No arbitrary URL proxying —
R2-hosted bytes only, so SSRF is structurally impossible.

Payment verification is shared with the gateway via
`packages/x402-verify/` (env-agnostic pure helpers + on-chain checks);
the only semantic delta is per-listing merchant wallet + price from KV.

## Routes

- `POST /v1/publish` — auth: `X-Nanotab-Key` must equal the `PUBLISH_KEY`
  secret (**shared-secret stub**; real magic-link auth lands in step 4).
  Body `{title, mime, price_cents (int 1–10000), merchant_wallet (0x…),
  body_b64 (≤1MB decoded)}`. Mime allowlist: `text/plain`,
  `text/markdown`, `text/html`, `application/json`, `application/pdf`,
  `image/png`, `image/jpeg`. → `201 {url, slug, x402: {accepts}}`.
- `GET /r/:slug` — no `X-Payment` → 402 (same body shape as the gateway,
  per-listing `payTo`/`amount`); valid payment → R2 bytes with
  `content-type` + `nosniff` + `x-nanotab:*` headers. Buyer-tx verify
  only — **no settler** on publish; without `txHash` the
  authorized-logged fallback applies (same as gateway). `text/html`
  serves as `attachment` with sandboxed CSP (stored-XSS guard).
- `GET /v1/marketplace.json` — public flat file
  `[{url, title, price_usd, mime}]`, cached 60s (day-one discovery).
- `GET /stats`, `GET /.well-known/x402` — free, gateway parity.

Storage: KV `NANOTAB_LISTINGS` (`r:<slug>` metadata, `listing:<slug>`
paid counters) + R2 `nanotab-content` (`r/<slug>` bytes). Missing
bindings → 500 with a clear message; there is no in-memory fallback.

## Dev / test (local only — do NOT deploy, no real resources yet)

Needs `wrangler` (via `npx -y wrangler@3` or on PATH). Local dev
emulates KV/R2 automatically:

```sh
cd workers/publish
npx -y wrangler@3 dev --var PUBLISH_KEY:dev-secret   # :8788
PUBLISH_URL=http://localhost:8788 PUBLISH_KEY=dev-secret npm test
```

Real bindings (later, not now):

```sh
wrangler kv namespace create NANOTAB_LISTINGS
wrangler r2 bucket create nanotab-content
wrangler secret put PUBLISH_KEY
```
