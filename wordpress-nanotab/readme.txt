=== NanoTab Paywall ===
Contributors: nanotab
Tags: paywall, micropayments, usdc, base, x402
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

Paywall posts and API with USDC micropayments on Base. No Node, no API keys — pure PHP + public Base RPC.

== Description ==

NanoTab Paywall locks full post content and a REST endpoint behind a USDC payment on Base:

* Visitors see a 40-word excerpt + payment instructions.
* Paying readers send USDC to your wallet, then reload with an `X-Payment: <tx_hash>` header.
* The plugin verifies the tx on-chain via `eth_getTransactionReceipt` and checks the USDC `Transfer` log.
* REST clients get a machine-readable `402` JSON with the full payment spec at `/wp-json/nanotab/v1/post/<id>`.
* 0.1% protocol fee to NanoTab on every paid call, non-optional.

== Installation ==

1. Zip the `wordpress-nanotab` folder (or upload via FTP to `/wp-content/plugins/`).
2. In WP Admin go to Plugins → Activate "NanoTab Paywall".
3. Go to Settings → NanoTab, enter your Base wallet address + price in USDC, Save.
4. Done — all single posts are now paywalled.

== Frequently Asked Questions ==

= Do readers need an account? =
No. Install + wallet address only. Payment is a plain USDC transfer on Base.

= How do agents pay? =
GET the REST route, read the 402 JSON payment spec, send USDC, retry with `X-Payment` header.

== Changelog ==

= 0.1.0 =
Initial release. Content filter + REST route + admin settings + on-chain USDC verification.
