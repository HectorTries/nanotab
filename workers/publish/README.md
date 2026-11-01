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

Pages (Paywall Any Link is the leading product):

- `GET /` — hero “Paywall Any Link in seconds” + step-flow: paste the
  link → paste/upload the content → set the price → **Next** routes to
  `/login`; after sign-in the saved draft publishes in one click.
  Human links are live instantly.
- `GET /login` — clean single-purpose magic-link sign-in (account
  required to publish/collect earnings). `?next=` is a validated
  same-site redirect carried through the email link.
- `GET /developers` — demoted developer path (self-host, SDKs,
  gateway, machine discovery, agentic submissions).
- `GET /agent-auth` — daily authorization queue: the account owner
  approves/rejects agent-submitted links (see below).
- `GET /marketplace`, `GET /publish` (legacy API-key form).

APIs:

- `POST /v1/publish` — auth: magic-link session (primary) OR
  `X-Nanotab-Key` = `PUBLISH_KEY` secret. Body `{title, mime,
  price_cents (int 1–10000), merchant_wallet (0x…), body_b64 (≤1MB
  decoded), source_url?}`. Mime allowlist: `text/plain`,
  `text/markdown`, `text/html`, `application/json`, `application/pdf`,
  `image/png`, `image/jpeg`. → `201 {url, slug, x402: {accepts}}`.
- `POST /v1/agent/submit` — agent submissions, auth `X-Agent-Key` =
  `AGENT_KEY` secret (unset = disabled, fail closed). Same body plus
  `agent_name?`. Stores the listing as `status: "pending"` →
  `202 {url, slug, status}`. Nothing publishes yet.
- `GET /v1/agent/pending` / `POST /v1/agent/review {slug, action}` —
  the review queue, owner-gated (session; `OWNER_EMAILS` comma
  allowlist when set; publish key accepted for automation). Approve →
  live with `created_by_agent` badge (“Created by agent” on the
  paywall page + marketplace); reject → stays unpublished.
  Pending links return `403` from `GET /r/:slug` (never 402 terms or
  content, even with an `X-Payment` header); rejected read as `404`.
  Marketplace + stats only count live listings.
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

Secrets (Cloudflare, never in repo):

```sh
wrangler secret put PUBLISH_KEY    # legacy publish/review automation
wrangler secret put AGENT_KEY      # enables POST /v1/agent/submit
wrangler secret put RESEND_API_KEY # magic-link email (unset = dev-mode link)
# optional reviewer allowlist (wrangler.toml [vars] or secret):
#   OWNER_EMAILS=hector@example.com (unset = any signed-in user may review)
```
