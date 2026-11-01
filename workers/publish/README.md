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
  link → paste/upload the content → set the price → payout wallet →
  **Publish link**. No account, email or sign-in is required: step 4
  takes a USDC-on-Base payout address or generates one in one click
  (**Generate instant wallet**: standard EVM keypair created in the
  browser, address auto-filled, private key shown once with save /
  don't-save choices; the key never leaves the browser). Human links
  are live instantly; publish success surfaces the `/r/<slug>` HTTP 402
  agent paywall link plus a copyable `curl -i` test request.
  Keep your link — bookmark it; there is no account to find it in later.
- `GET /developers` — demoted developer path (self-host, SDKs,
  gateway, machine discovery, agentic submissions).
- `GET /agent-auth?key=…` — daily review queue: the owner (ADMIN_KEY
  secret, key in URL, no cookies) approves/rejects agent links.
- `GET /marketplace`, `GET /publish` (plain API form, no credentials).
- `GET /terms`, `/privacy`, `/refunds` (+ `/refund-policy` alias),
  `/contact`, `/about` — plain-English trust pages, linked in every
  footer. Contact: support@nanotab.dev.
- `GET /wallet-guide` — plain-English USDC-on-Base wallet guide.
- `GET /demo` + `GET /r/DemoSample` — live demo paywall: a short sample
  behind a real $0.05 USDC-on-Base listing (built-in listing, merchant =
  fee wallet; unpaid → 402, paid → sample text). Hero links to it.
- `GET /p/:slug` — human/crawler post page (canonical): HTTP 200 with the
  free abstract (first 2–4 sentences, “Free preview”), Article JSON-LD
  (`isAccessibleForFree:false`, `hasPart` → `.paywall`), unique
  title/meta/canonical/Open Graph. Same intent routing as `/r/` below.
- `GET /robots.txt`, `GET /sitemap.xml`, `GET /llms.txt` — discovery:
  robots explicitly allows Googlebot/Bingbot/OAI-SearchBot/GPTBot/
  PerplexityBot/ClaudeBot/Google-Extended; the sitemap lists `/p/` pages
  only (no agent/API endpoints); llms.txt maps the free abstracts and the
  402 → USDC-on-Base payment flow.

APIs:

- `POST /v1/publish` — accountless: no credentials needed, works with
  zero cookies. Body `{title, mime,
  price_cents (int 1–10000), merchant_wallet (0x…), body_b64 (≤1MB
  decoded), source_url?}`. Mime allowlist: `text/plain`,
  `text/markdown`, `text/html`, `application/json`, `application/pdf`,
  `image/png`, `image/jpeg`. → `201 {url, slug, x402: {accepts}}`.
- `POST /v1/agent/submit` — agent submissions, auth `X-Agent-Key` =
  `AGENT_KEY` secret (unset = disabled, fail closed). Same body plus
  `agent_name?`. Every submission is auto-reviewed by TypeSafe Jev
  (one System One call: `spam`, `content_legal`, `price_sane` nouls +
  `quality` score over junk/mismatch…excellent). Clean + verified
  (`spam<0.2`, `content_legal>0.8`, `price_sane>0.8`, `quality>=fine`;
  `VERIFIED_AGENTS` unset = any key-authenticated agent) → live
  instantly, `201 {url, slug, status:"live", jev}`. Everything else is
  stored `status: "pending"` with the verdict on the record →
  `202 {url, slug, status, jev?}`. Code hard blocks run first and skip
  Jev: spam-domain blocklist (`src/blocklist.ts`) → `403`, over 10
  submissions/hour/agent → `429`, previously rejected URL → `403`.
  Missing `TYPESAFE_API_KEY` or any Jev error fails open to the
  pending queue — submissions never break on Jev.
- `GET /v1/agent/pending` / `POST /v1/agent/review {slug, action}` —
  the review queue, owner-gated by `ADMIN_KEY` (`X-Admin-Key` header
  or `?key=` on the page; unset = fail closed 403). Approve →
  live with `created_by_agent` badge (“Created by agent” on the
  paywall page + marketplace); reject → stays unpublished.
  Pending links return `403` from `GET /r/:slug` (never 402 terms or
  content, even with an `X-Payment` header); rejected read as `404`.
  Marketplace + stats only count live listings.
- `GET /r/:slug` — routed by intent (same on `/p/:slug`): valid
  `X-Payment` → R2 bytes with `content-type` + `nosniff` + `x-nanotab:*`
  headers; unpaid + `Accept: application/json` or an agent-style
  User-Agent → 402 (same body shape as the gateway, per-listing
  `payTo`/`amount`); unpaid browser or discovery crawler (Googlebot,
  Bingbot, OAI-SearchBot, GPTBot, PerplexityBot, ClaudeBot) → 200 teaser
  with the free abstract (never 402, never the paid body). Buyer-tx
  verify only — **no settler** on publish; without `txHash` the
  authorized-logged fallback applies (same as gateway). Paid `text/html`
  serves as `attachment` with sandboxed CSP (stored-XSS guard). Every
  listing stores a free `abstract` (derived at publish; legacy records
  backfill on first public read).
- `GET /v1/marketplace.json` — public flat file
  `[{url, page_url, title, abstract?, price_usd, mime}]`, cached 60s
  (day-one discovery).
- `GET /stats`, `GET /.well-known/x402` — free, gateway parity.

Storage: KV `NANOTAB_LISTINGS` (`r:<slug>` metadata, `listing:<slug>`
paid counters) + R2 `nanotab-content` (`r/<slug>` bytes). Missing
bindings → 500 with a clear message; there is no in-memory fallback.

## Dev / test (local only — do NOT deploy, no real resources yet)

Needs `wrangler` (via `npx -y wrangler@3` or on PATH). Local dev
emulates KV/R2 automatically:

```sh
cd workers/publish
npx -y wrangler@3 dev --var ADMIN_KEY:dev-admin --var AGENT_KEY:dev-agent   # :8788
node test/selftest.mjs   # offline suite (no server needed)
```

Secrets (Cloudflare, never in repo):

```sh
wrangler secret put ADMIN_KEY      # owner review (unset = review fail-closed 403)
wrangler secret put AGENT_KEY      # enables POST /v1/agent/submit
wrangler secret put TYPESAFE_API_KEY # Jev auto-reviewer (unset = manual queue only)
# optional auto-publish allowlist (unset = any AGENT_KEY agent verified):
#   VERIFIED_AGENTS=agent-one,agent-two
```
