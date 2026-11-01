// pay.nanotab.dev pages. Leading product: Paywall Any Link.
//   /            hero + step-flow (paste link → content → price → Next)
//   /login       clean single-purpose sign-in (required to publish/collect)
//   /developers  demoted developer path (SDK / self-host docs funnel)
//   /agent-auth  daily authorization queue: owner approves agent links
// Design system: premium fintech dark (shared with the 402 paywall page).

const CSS = `
:root{--bg:#0b0d10;--panel:#12161c;--panel2:#0e1218;--line:#232b36;--line2:#2d3746;--txt:#f2f5f7;--mut:#9fb0c0;--mut2:#7f8fa3;--acc:#3ecf8e;--acc-ink:#06281a;--warn:#e8b34b;--bad:#e86a6a;--radius:12px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.65 "IBM Plex Sans",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--acc);text-decoration:none}
a:hover{text-decoration:underline}
::selection{background:var(--acc);color:var(--acc-ink)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.topbar{border-bottom:1px solid var(--line);background:rgba(11,13,16,.92);position:sticky;top:0;z-index:10}
.topbar-in{max-width:1080px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;letter-spacing:-.01em;color:var(--txt)}
.logo:hover{text-decoration:none}
.logo-mark{width:28px;height:28px;border-radius:7px;background:var(--acc);color:var(--acc-ink);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
.nav{display:flex;gap:22px;align-items:center;font-size:14px}
.nav a{color:var(--mut)}
.nav a:hover{color:var(--txt);text-decoration:none}
.nav .nav-cta{background:var(--txt);color:#0b0d10;font-weight:600;padding:7px 14px;border-radius:8px}
.nav .nav-cta:hover{background:#fff;color:#0b0d10}
@media(max-width:760px){.nav a:not(.nav-cta){display:none}}
.hero{padding:64px 0 8px;display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:start}
@media(max-width:860px){.hero{grid-template-columns:1fr;padding-top:44px}}
.badge{display:inline-block;border:1px solid var(--line2);border-radius:999px;padding:4px 12px;font-size:12.5px;color:var(--mut);letter-spacing:.02em;margin-bottom:20px;background:var(--panel)}
.badge b{color:var(--acc);font-weight:600}
.hero h1{font-size:clamp(38px,5.2vw,58px);line-height:1.06;letter-spacing:-.03em;margin:0 0 18px;font-weight:700}
.hero h1 .accent{color:var(--acc)}
.hero .sub{color:var(--mut);font-size:17.5px;line-height:1.65;margin:0 0 14px;max-width:540px}
.hero .sub b{color:var(--txt);font-weight:600}
.who-line{font-size:14.5px;color:var(--mut);margin:0 0 26px}
.who-line b{color:var(--txt);font-weight:600}
.hero-ctas{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn{display:inline-block;background:var(--acc);color:var(--acc-ink);font-weight:600;font-size:15.5px;padding:12px 22px;border-radius:10px;border:1px solid var(--acc);cursor:pointer;font-family:inherit}
.btn:hover{text-decoration:none;filter:brightness(1.06)}
.btn.secondary{background:transparent;color:var(--txt);border-color:var(--line2)}
.btn.secondary:hover{border-color:var(--mut2)}
.hero-note{font-size:13.5px;color:var(--mut2);margin-top:16px}
.preview{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.preview-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--mut)}
.preview-head b{color:var(--txt);font-size:13.5px}
.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--acc);margin-right:7px;vertical-align:1px}
.preview-body{padding:18px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.8px;line-height:1.75}
.flow-row{display:flex;gap:10px;align-items:baseline}
.flow-code{color:#b7c5d6;word-break:break-all}
.flow-code .k{color:var(--acc)}
.flow-code .s{color:var(--warn)}
.pill{flex:none;font-size:11px;font-weight:600;letter-spacing:.04em;border-radius:6px;padding:1px 7px;border:1px solid var(--line2);color:var(--mut)}
.pill.p402{color:var(--warn);border-color:rgba(232,179,75,.45)}
.pill.p200{color:var(--acc);border-color:rgba(62,207,142,.45)}
.flow-sep{border:0;border-top:1px dashed var(--line);margin:12px 0}
.preview-foot{padding:12px 18px;border-top:1px solid var(--line);font-size:13px;color:var(--mut);background:var(--panel2)}
.preview-foot b{color:var(--txt)}
.audience{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:44px 0 0;border:1px solid var(--line);border-radius:14px;overflow:hidden}
@media(max-width:760px){.audience{grid-template-columns:1fr}}
.aud{padding:22px;background:var(--panel)}
.aud+.aud{border-left:1px solid var(--line)}
@media(max-width:760px){.aud+.aud{border-left:0;border-top:1px solid var(--line)}}
.aud h3{margin:0 0 6px;font-size:16px}
.aud p{margin:0;color:var(--mut);font-size:14.5px}
section.block{padding:56px 0 0}
.eyebrow{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);font-weight:600;margin:0 0 10px}
h2{font-size:clamp(26px,3.6vw,36px);letter-spacing:-.02em;line-height:1.15;margin:0 0 10px}
.secsub{color:var(--mut);max-width:620px;margin:0 0 28px;font-size:16px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:760px){.steps{grid-template-columns:1fr}}
.step{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.step .n{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--acc);display:block;margin-bottom:12px}
.step h3{margin:0 0 8px;font-size:17px}
.step p{margin:0;color:var(--mut);font-size:14.5px}
.step code{font-size:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px;margin:16px 0}
.card h2{font-size:20px;margin:0 0 6px}
.card .card-sub{color:var(--mut);font-size:14.5px;margin:0 0 8px}
.step-tag{display:inline-block;background:var(--acc);color:var(--acc-ink);font-weight:700;font-size:11.5px;letter-spacing:.05em;border-radius:6px;padding:2px 9px;margin-left:8px;vertical-align:2px;text-transform:uppercase}
.stepflow{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 4px}
.sf-step{flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--panel2)}
.sf-step .sf-n{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--acc);display:block}
.sf-step .sf-t{font-size:14px;font-weight:600}
.sf-step .sf-d{font-size:12.5px;color:var(--mut2);line-height:1.45}
label{display:block;margin:14px 0 5px;color:var(--mut);font-size:14px;font-weight:500}
input,textarea{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--txt);padding:11px 13px;font-size:15px;font-family:inherit}
input:focus,textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px rgba(62,207,142,.16)}
textarea{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;min-height:140px;resize:vertical;line-height:1.6}
input[type=file]{padding:9px 13px;font-size:14px;color:var(--mut)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.row{grid-template-columns:1fr}}
button{background:var(--acc);border:1px solid var(--acc);border-radius:10px;color:var(--acc-ink);font-weight:600;font-size:15.5px;padding:11px 22px;cursor:pointer;margin-top:16px;font-family:inherit}
button:hover{filter:brightness(1.06)}
button:disabled{opacity:.55;cursor:wait}
button.ghost{background:transparent;border:1px solid var(--line2);color:var(--txt);font-weight:500;font-size:14px;padding:7px 14px;margin:6px 6px 0 0}
button.ghost:hover{border-color:var(--mut2);filter:none}
button.danger{background:transparent;border:1px solid rgba(232,106,106,.5);color:var(--bad);font-weight:600;font-size:14px;padding:7px 14px;margin:6px 6px 0 0}
button.danger:hover{border-color:var(--bad);filter:none}
.out{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:13px 14px;margin-top:14px;word-break:break-word;font-size:14px;line-height:1.6}
.out a{word-break:break-all}
.hint{font-size:13px;color:var(--mut2);margin-top:6px}
.earn-preview{font-size:13.5px;color:var(--mut);margin-top:6px}
.earn-preview b{color:var(--acc)}
#pub-lock{display:flex;gap:10px;align-items:flex-start;background:rgba(62,207,142,.07);border:1px solid rgba(62,207,142,.35);border-radius:10px;padding:13px 15px;margin-top:16px;font-size:14.5px}
#pub-lock.hidden{display:none}
.item{border-top:1px solid var(--line);padding:14px 0;font-size:14px}
.item:first-child{border-top:0;padding-top:4px}
.item .t{font-weight:600}
.item .m{color:var(--mut);margin-top:2px}
.tag{display:inline-block;border:1px solid var(--line2);color:var(--mut);border-radius:999px;padding:0 9px;font-size:11.5px;font-weight:600;vertical-align:2px;margin-left:6px}
.tag.agent{border-color:rgba(62,207,142,.45);color:var(--acc)}
.tag.pending{border-color:rgba(232,179,75,.45);color:var(--warn)}
code{background:var(--panel2);border:1px solid var(--line);padding:1px 6px;border-radius:6px;font-size:13px;font-family:"IBM Plex Mono",monospace;color:#cfe3d8}
pre.codeblock{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:16px;overflow-x:auto;font-family:"IBM Plex Mono",monospace;font-size:13px;line-height:1.7;margin:0}
pre.codeblock code{background:none;border:0;padding:0}
.earn-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.earn-grid{grid-template-columns:1fr}}
.earn-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.earn-box .price-big{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:4px 0}
.earn-box p{color:var(--mut);font-size:14.5px;margin:0}
.earn-rows{margin-top:14px;border-top:1px solid var(--line)}
.earn-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--mut)}
.earn-row b{color:var(--txt);font-family:"IBM Plex Mono",monospace;font-weight:500}
.devbox{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:24px;margin:16px 0}
footer{color:var(--mut2);font-size:13.5px;text-align:center;padding:48px 0 40px;margin-top:56px;border-top:1px solid var(--line)}
.hidden{display:none}
.center-wrap{max-width:520px;margin:0 auto;padding:56px 24px 40px}
.queue-item{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin:12px 0}
.queue-item .t{font-weight:600;font-size:16px}
.queue-item .m{color:var(--mut);font-size:14px;margin-top:3px;word-break:break-all}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

function head(title: string, desc: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>`;
}

function topbar(ctaHref: string, ctaLabel: string): string {
  return `<header class="topbar"><div class="topbar-in">
<a class="logo" href="/"><span class="logo-mark">N</span> NanoTab Pay</a>
<nav class="nav" aria-label="Primary"><a href="/marketplace">Marketplace</a><a href="/agent-auth">Agent review</a><a href="/developers">For developers</a><a href="/login">Sign in</a><a class="nav-cta" href="${ctaHref}">${ctaLabel}</a></nav>
</div></header>`;
}

const FOOTER = `<footer>NanoTab Pay · <a href="/developers">For developers</a> · <a href="/agent-auth">Agent review</a> · <a href="/marketplace">marketplace</a> (<a href="/v1/marketplace.json">json</a>) · <a href="/stats">stats</a> · <a href="https://nanotab.dev">nanotab.dev</a> · USDC on Base via x402 · Self-host fee 0.1% · Hosted fee 2%</footer>`;

export function landingHtml(): string {
  return head(
    'NanoTab Pay — Paywall Any Link in seconds',
    'Paywall Any Link in seconds. Paste a link, add the content, set a price — AI agents pay per view in USDC on Base. You keep 98% hosted, 99.9% self-hosted.'
  ) + topbar('#create', 'Paywall a link') + `
<div class="wrap">
<div class="hero">
<div>
<div class="badge"><span class="live-dot"></span><b>Live on Base mainnet</b> &nbsp;·&nbsp; USDC &nbsp;·&nbsp; x402</div>
<h1>Paywall Any Link <span class="accent">in seconds.</span></h1>
<p class="sub">Paste any link, add the content behind it, set a price. You get a <b>pay.nanotab.dev/r/…</b> link — <b>AI agents pay per view in USDC on Base</b>, straight to your wallet. No subscriptions. No ETH for gas.</p>
<p class="who-line">For <b>creators</b> with articles &amp; research, <b>data sellers</b> with feeds &amp; datasets, and <b>developers</b> with APIs — <a href="/developers">developer path</a>.</p>
<div class="hero-ctas"><a class="btn" href="#create">Paywall a link — free</a><a class="btn secondary" href="/marketplace">Browse the marketplace</a></div>
<p class="hero-note">Hosted links: you keep 98% (2% fee). Self-host with npm: you keep 99.9% (0.1% fee). Buyers always pay the listed price.</p>
</div>
<div class="preview" aria-label="What an agent payment looks like">
<div class="preview-head"><span><b>What an agent pays</b></span><span>pay.nanotab.dev/r/…</span></div>
<div class="preview-body">
<div class="flow-row"><span class="pill">GET</span><span class="flow-code">/r/YourLink &nbsp;→&nbsp; <span class="s">no payment yet</span></span></div>
<hr class="flow-sep">
<div class="flow-row"><span class="pill p402">402</span><span class="flow-code">{ <span class="k">"amount"</span>: <span class="s">"50000"</span>, <span class="k">"payTo"</span>: <span class="s">"0xYourWallet"</span>,<br>&nbsp;&nbsp;<span class="k">"asset"</span>: <span class="s">"USDC · Base"</span> }</span></div>
<hr class="flow-sep">
<div class="flow-row"><span class="pill">PAY</span><span class="flow-code">Agent pays <span class="k">$0.05 USDC</span> on Base,<br>retries with <span class="k">X-Payment</span> proof</span></div>
<hr class="flow-sep">
<div class="flow-row"><span class="pill p200">200</span><span class="flow-code">Content delivered to the agent.<br><span class="k">You receive $0.049</span> — instantly on-chain.</span></div>
</div>
<div class="preview-foot">Every link works this way: <b>402 → pay USDC → 200</b>. Try the live demo below.</div>
</div>
</div>
<div id="create" style="scroll-margin-top:80px">
<div class="card">
<h2>Paywall a link<span class="step-tag">Start here</span></h2>
<p class="card-sub">Three steps, then Next. You draft freely in this browser — an account is only needed to publish and collect earnings, so sign-in comes after you hit Next.</p>
<div class="stepflow" aria-label="Steps">
<div class="sf-step"><span class="sf-n">Step 1</span><span class="sf-t">Paste the link</span><div class="sf-d">The page, doc or dataset you are selling access to.</div></div>
<div class="sf-step"><span class="sf-n">Step 2</span><span class="sf-t">Add the content</span><div class="sf-d">Paste the document, or upload the file behind the link.</div></div>
<div class="sf-step"><span class="sf-n">Step 3</span><span class="sf-t">Set the price</span><div class="sf-d">Per view, in USD. Agents pay it in USDC.</div></div>
</div>
<label for="p-link">1 · Link you are paywalling</label>
<input id="p-link" type="url" placeholder="https://your-site.com/premium-report" autocomplete="off" spellcheck="false">
<div class="hint">Kept as provenance on your listing. The paid content itself is what you add in step 2 — buyers unlock that, byte for byte.</div>
<label for="p-title">Title buyers and agents see</label><input id="p-title" maxlength="200" placeholder="e.g. Q3 keyword pack — 500 terms with volume &amp; CPC">
<label for="p-body">2 · Content behind the paywall (paste, or upload below)</label><textarea id="p-body" placeholder="# Hello agents&#10;&#10;Pay to read the full pack..."></textarea>
<label for="p-file">…or upload the file for this link</label>
<input id="p-file" type="file" accept=".txt,.md,.markdown,.json,.html,text/plain,text/markdown,application/json,text/html">
<div class="hint" id="file-hint">Text, Markdown, JSON or HTML, up to 1 MB. The file fills the box above; nothing is uploaded until you publish.</div>
<div class="row"><div><label for="p-price">3 · Price per view (USD)</label><input id="p-price" type="number" min="0.01" max="100" step="0.01" value="1.00"><div class="earn-preview" id="earn-preview"></div></div>
<div><label for="p-wallet">Your USDC wallet (Base)</label><input id="p-wallet" placeholder="0x..." autocomplete="off" spellcheck="false"><div class="hint">Payouts land here in USDC on Base. Use an address you control.</div></div></div>
<button id="btn-next" onclick="onNext()" style="font-size:16.5px;padding:13px 28px">Next →</button>
<div id="pub-out"></div>
<div id="pub-lock"><span>Draft freely — then hit Next to sign in and publish. Your draft is saved in this browser and restored after sign-in.</span></div>
</div>
<div class="card hidden" id="dash-card">
<h2>My links <span style="color:var(--mut);font-size:13px;font-weight:400" id="dash-count"></span></h2>
<p class="card-sub">Share a link anywhere agents look. Every paid view pays your wallet and counts here. Human links publish instantly; agent-submitted links wait for your daily approval in <a href="/agent-auth">Agent review</a>.</p>
<div id="dash-list"><i>loading...</i></div>
</div>
</div>
<div class="audience" aria-label="Who NanoTab Pay is for">
<div class="aud"><h3>Content owners</h3><p>Articles, reports, prompt packs and research notes. Paste the text, set a price, share the link anywhere.</p></div>
<div class="aud"><h3>Data sellers</h3><p>Feeds, lookups and niche datasets. Agents pay for each fresh read — you see every paid view in your dashboard.</p></div>
<div class="aud"><h3>Developers</h3><p>Charge per API call instead of giving keys away. The SDK and self-host path live under <a href="/developers">For developers</a>.</p></div>
</div>
<section class="block" aria-label="How it works">
<p class="eyebrow">How it works</p>
<h2>Three steps. Then agents pay you.</h2>
<p class="secsub">No server to run, no Stripe account, no gas to manage. If you can paste a link, you can sell to agents.</p>
<div class="steps">
<div class="step"><span class="n">Step 1</span><h3>Paste, price, hit Next</h3><p>Paste the link, add the content behind it, set a USD price and your Base wallet — then sign in to publish your <code>pay.nanotab.dev/r/…</code> link.</p></div>
<div class="step"><span class="n">Step 2</span><h3>Agent pays per view in USDC</h3><p>An agent opens your link, gets a <code>402</code> with the price, pays USDC on Base, and retries — content unlocks automatically.</p></div>
<div class="step"><span class="n">Step 3</span><h3>You get paid</h3><p>USDC lands in your wallet on every paid view, minus the fee. Track links and paid views in your dashboard above.</p></div>
</div>
</section>
<section class="block" aria-label="What you earn">
<p class="eyebrow">Pricing</p>
<h2>What you earn, plainly.</h2>
<p class="secsub">The buyer always pays exactly your listed price. The fee comes out of that — you never invoice anyone and there is no monthly charge.</p>
<div class="earn-grid">
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Hosted on pay.nanotab.dev</div><div class="price-big">You keep 98%</div><p>2% per paid view covers hosting, the paywall and payment verification. No setup fee, no gas — the Circle paymaster covers gas from the payment.</p>
<div class="earn-rows"><div class="earn-row"><span>You list at $0.05</span><b>You receive $0.049</b></div><div class="earn-row"><span>You list at $1.00</span><b>You receive $0.98</b></div><div class="earn-row"><span>You list at $10.00</span><b>You receive $9.80</b></div></div></div>
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Self-host with npm</div><div class="price-big">You keep 99.9%</div><p>0.1% per paid call when you run the paywall yourself with <code>npx nanotab protect</code>. Same x402 flow, your own server. See <a href="/developers">For developers</a>.</p>
<div class="earn-rows"><div class="earn-row"><span>You list at $0.05</span><b>You receive $0.04995</b></div><div class="earn-row"><span>You list at $1.00</span><b>You receive $0.999</b></div><div class="earn-row"><span>Monthly fee</span><b>None</b></div></div></div>
</div>
</section>
<div class="card">
<h2>Live demo — the 402 an agent sees</h2>
<p style="color:var(--mut);font-size:14.5px">An unpaid request to a paywalled link returns <code>402 Payment Required</code> with machine-readable terms. This box loads a real listing:</p>
<div class="out" id="demo-out" style="font-family:'IBM Plex Mono',monospace;font-size:13px;white-space:pre-wrap">loading demo...</div>
<p class="hint">Agents read this JSON, pay the <b style="color:var(--txt)">amount</b> in USDC to <b style="color:var(--txt)">payTo</b>, then retry for the content. <a href="/marketplace">Browse all listings</a> · <a href="/v1/marketplace.json">marketplace.json for machines</a></p>
</div>
<section class="block" aria-label="For developers">
<p class="eyebrow">Secondary path</p>
<h2>For developers</h2>
<p class="secsub">Prefer code? Paywall your own server at 0.1%, or let your agent buy with its own wallet. The full SDK flow is a separate, clearly-labelled path — the hosted link flow above stays the product.</p>
<div class="devbox">
<pre class="codeblock"><code># paywall an existing Express server, one command
npx nanotab protect --price 0.02 --wallet 0xYourWallet ./server.js

# or charge per call in code (merchant) and pay from an agent (SDK)
import { nanotabCharge } from "@nanotab/merchant";
import { nanotabFetch } from "@nanotab/agent-sdk";</code></pre>
<p style="color:var(--mut);font-size:14.5px;margin:16px 0 0"><a href="/developers">Open the developer path →</a> · <a href="https://nanotab.dev">nanotab.dev</a> · <a href="https://github.com/HectorTries/nanotab">GitHub</a> · Agents creating links: <a href="/developers#agents">agentic submissions + daily review</a></p>
</div>
</section>
<div class="card" style="text-align:center">
<h2>Your knowledge is already worth something.</h2>
<p style="color:var(--mut)">Paste the link, price it, share it. The next agent that needs it pays you.</p>
<button onclick="document.getElementById('create').scrollIntoView({behavior:'smooth'})">Paywall your first link — free</button>
</div>
${FOOTER}
</div>
<script>
var $=function(id){return document.getElementById(id)};
var signedIn=false;
async function api(p,o){o=o||{};o.credentials='include';if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
var DKEY='nt_draft';
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify({l:$('p-link').value,t:$('p-title').value,p:$('p-price').value,w:$('p-wallet').value,b:$('p-body').value}))}catch(e){}}
function restoreDraft(){try{var d=JSON.parse(localStorage.getItem(DKEY)||'null');if(!d)return;if(d.l)$('p-link').value=d.l;if(d.t)$('p-title').value=d.t;if(d.p)$('p-price').value=d.p;if(d.w)$('p-wallet').value=d.w;if(d.b)$('p-body').value=d.b;}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DKEY)}catch(e){}}
function updateEarn(){var el=$('earn-preview');if(!el)return;var v=parseFloat($('p-price').value);if(!(v>0)){el.textContent='';return}var net=(v*0.98);el.innerHTML='You receive <b>$'+net.toFixed(net<0.1?4:2)+'</b> per view hosted (98%) · $'+(v*0.999).toFixed(v<0.1?4:3)+' self-hosted (99.9%)'}
['p-link','p-title','p-price','p-wallet','p-body'].forEach(function(id){$(id).addEventListener('input',function(){saveDraft();if(id==='p-price')updateEarn()})});
$('p-file').addEventListener('change',function(){
 var f=$('p-file').files&&$('p-file').files[0];if(!f)return;
 if(f.size>1024*1024){$('file-hint').textContent='That file is over 1 MB — paste a smaller extract instead.';return}
 var rd=new FileReader();
 rd.onload=function(){$('p-body').value=String(rd.result||'');saveDraft();$('file-hint').textContent='Loaded '+f.name+' ('+f.size+' bytes) into the content box. Nothing is uploaded until you publish.'};
 rd.onerror=function(){$('file-hint').textContent='Could not read that file — paste the content instead.'};
 rd.readAsText(f);
});
restoreDraft();updateEarn();
function setSignedIn(email){
 signedIn=true;
 var l=$('pub-lock');if(l)l.classList.add('hidden');
 var b=$('btn-next');if(b)b.textContent='Publish paywall link →';
 var out=$('pub-out');
 if(new URLSearchParams(location.search).get('welcome')==='1'&&out){
   out.innerHTML='<div class="out">Signed in as <b>'+email+'</b> — your draft is restored below. Hit <b>Publish paywall link</b> to go live instantly.</div>';
 }
}
async function checkSession(){
 try{var m=await api('/v1/me');if(m.ok&&m.j&&m.j.email){setSignedIn(m.j.email);$('dash-card').classList.remove('hidden');restoreDraft();updateEarn();refreshDash();return}}catch(e){}
 signedIn=false;
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function renderDash(items){
 var c=$('dash-count');if(c)c.textContent=items.length?('('+items.length+')'):'';
 if(!items.length){$('dash-list').innerHTML='<i>No links yet — publish your first above.</i>';return}
 $('dash-list').innerHTML=items.map(function(l){
  var tags='';
  if(l.created_by_agent)tags+='<span class="tag agent">Created by agent</span>';
  if(l.status&&l.status!=='live')tags+='<span class="tag pending">'+esc(l.status)+'</span>';
  return '<div class="item"><div class="t">'+esc(l.title)+' — $'+l.price_usd+tags+'</div><div class="m"><a href="'+l.url+'">'+l.url+'</a> · '+l.paid_calls+' paid views · '+l.created_at.slice(0,10)+'</div><button class="ghost" data-u="'+l.url+'" onclick="copyL(this.dataset.u)">copy link</button><button class="ghost" data-s="'+l.slug+'" onclick="delL(this.dataset.s)">delete</button></div>'}).join('');
}
async function refreshDash(){var r=await api('/v1/listings');if(r.ok)renderDash(r.j)}
async function copyL(u){try{await navigator.clipboard.writeText(u);alert('copied')}catch(e){prompt('copy:',u)}}
async function delL(slug){if(!confirm('delete '+slug+'?'))return;var r=await fetch('/v1/listings/'+slug,{method:'DELETE',credentials:'include'});if(r.ok)refreshDash();else alert('delete failed')}
function validDraft(){
 var link=$('p-link').value.trim(),title=$('p-title').value.trim(),price=parseFloat($('p-price').value),wallet=$('p-wallet').value.trim(),body=$('p-body').value;
 if(link&&!/^https?:\\/\\//i.test(link))return 'That link needs to start with http:// or https:// — or clear it and just sell the pasted content.';
 if(!title&&link){try{title=new URL(link).hostname.replace(/^www\\./,'')}catch(e){}}
 if(!title)return 'Give your link a title buyers will recognise.';
 if(!body)return 'Add the content behind the paywall: paste it in step 2, or upload the file.';
 if(!(price>0)||price>100)return 'Set a price between $0.01 and $100.';
 if(!/^0x[0-9a-fA-F]{40}$/.test(wallet))return 'Add your Base USDC wallet (0x + 40 hex) so payouts have somewhere to land.';
 return null;
}
function onNext(){
 saveDraft();
 var err=validDraft();
 if(err){$('pub-out').innerHTML='<div class="out">'+err+'</div>';return}
 if(!signedIn){
   // Account required to publish and collect earnings: clean login next.
   location.href='/login?next='+encodeURIComponent('/?welcome=1#create');
   return;
 }
 publish();
}
async function publish(){
 var title=$('p-title').value.trim(),link=$('p-link').value.trim(),price=parseFloat($('p-price').value),wallet=$('p-wallet').value.trim(),body=$('p-body').value;
 if(!title&&link){try{title=new URL(link).hostname.replace(/^www\\./,'')}catch(e){}}
 $('btn-next').disabled=true;
 var b64=btoa(unescape(encodeURIComponent(body)));
 var mime=/^\\s*[\\{\\[]/.test(body)?'application/json':'text/markdown';
 var payload={title:title,mime:mime,price_cents:Math.round(price*100),merchant_wallet:wallet,body_b64:b64};
 if(link)payload.source_url=link;
 var r=await api('/v1/publish',{method:'POST',body:JSON.stringify(payload)});
 $('btn-next').disabled=false;
 if(!r.ok){if(r.st===401){signedIn=false;$('pub-out').innerHTML='<div class="out">Session expired — <a href="/login?next='+encodeURIComponent('/?welcome=1#create')+'">sign in again</a>; your draft is saved.</div>';saveDraft()}else{$('pub-out').innerHTML='<div class="out">Error: '+((r.j&&r.j.error)||r.st)+'</div>'}return}
 clearDraft();
 $('pub-out').innerHTML='<div class="out"><b>Live instantly:</b> <a href="'+r.j.url+'">'+r.j.url+'</a><br><button class="ghost" data-u="'+r.j.url+'" onclick="copyL(this.dataset.u)">copy link</button> <span style="color:var(--mut)">Share it — unpaid visits get 402 + x402 terms, agents pay and unlock.</span></div>';
 refreshDash();
}
checkSession();
(function(){fetch('/v1/marketplace.json').then(function(r){return r.json()}).then(function(d){
 if(d.length){var l=d[0];fetch(l.url,{headers:{accept:'application/json'}}).then(function(r){return r.json().then(function(b){return{st:r.status,b:b}})}).then(function(x){
  var a=x.b.accepts&&x.b.accepts[0];var usd=a?('$'+(Number(a.amount)/1000000).toFixed(2)):'';var show=a?('amount '+a.amount+' ('+usd+' USDC) · payTo '+a.payTo+' · fee '+a.fee):JSON.stringify(x.b).slice(0,300);
  $('demo-out').textContent='GET '+l.url+'\\n→ '+x.st+(x.st===402?' Payment Required':'')+'\\n'+show;
 })} else $('demo-out').textContent='No listings yet — paywall the first link above.';
}).catch(function(){$('demo-out').textContent='demo unavailable'})})();
</script></body></html>`;
}

export function loginHtml(): string {
  return head(
    'Sign in — NanoTab Pay',
    'Sign in to NanoTab Pay to publish paywall links and collect earnings in USDC on Base. Email magic link, no password.'
  ) + topbar('/#create', 'Paywall a link') + `
<div class="center-wrap">
<a class="logo" href="/" style="justify-content:center"><span class="logo-mark">N</span> NanoTab Pay</a>
<div class="card" style="margin-top:28px">
<h2 style="font-size:24px">Sign in to publish</h2>
<p class="card-sub">An account is required to publish links and collect earnings. We email you a sign-in link — no password, nothing else on this page.</p>
<div id="login-form">
<label for="email">Email</label>
<input id="email" type="email" placeholder="you@example.com" autocomplete="email">
<button id="btn-login" onclick="requestLink()" style="width:100%">Email me a sign-in link</button>
<div id="login-msg" class="out hidden"></div>
</div>
<div id="login-done" class="hidden">
<div class="out" style="margin-top:0">Signed in as <b id="who">…</b></div>
<button id="btn-continue" onclick="goNext()" style="width:100%">Continue →</button>
</div>
</div>
<p class="hint" style="text-align:center">New here? The same link creates your account.<br>Your paywall draft is saved in this browser and restored after sign-in.<br><a href="/">← Back to Paywall Any Link</a> · <a href="/developers">For developers</a></p>
</div>
${FOOTER}
<script>
var $=function(id){return document.getElementById(id)};
async function api(p,o){o=o||{};o.credentials='include';if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
function nextTarget(){
 var n=new URLSearchParams(location.search).get('next')||'/';
 if(!/^\\/(?!\\/)/.test(n))return '/';
 return n;
}
function goNext(){location.href=nextTarget()}
async function requestLink(){
 var email=($('email').value||'').trim();var box=$('login-msg');box.classList.remove('hidden');
 if(!email){box.textContent='Enter your email above first.';return}
 $('btn-login').disabled=true;box.textContent='Sending...';
 try{
  var r=await api('/v1/auth/request',{method:'POST',body:JSON.stringify({email:email,next:nextTarget()})});
  $('btn-login').disabled=false;
  if(!r.ok){box.textContent='Error: '+((r.j&&r.j.error)||r.st);return}
  if(r.j.emailed){box.textContent='Check your inbox — link expires in 15 min. You will land back on your draft after sign-in.'}
  else{box.innerHTML='<b>Dev mode: email not configured — click to sign in:</b><br><a href="'+r.j.link+'">'+r.j.link+'</a>'}
 }catch(e){$('btn-login').disabled=false;box.textContent='Error: '+(e&&e.message||e)}
}
(async function(){
 try{var m=await api('/v1/me');if(m.ok&&m.j&&m.j.email){$('who').textContent=m.j.email;$('login-form').classList.add('hidden');$('login-done').classList.remove('hidden')}}catch(e){}
})();
</script></body></html>`;
}

export function developersHtml(): string {
  return head(
    'For developers — NanoTab',
    'Developer path for NanoTab: paywall your own server with npx nanotab protect at 0.1%, charge per call with @nanotab/merchant, and let agents pay with @nanotab/agent-sdk. USDC on Base via x402.'
  ) + topbar('/#create', 'Paywall a link') + `
<div class="wrap">
<section class="block" style="padding-top:48px">
<p class="eyebrow">Secondary path · For developers</p>
<h2 style="font-size:clamp(30px,4.4vw,44px)">Build with the SDK.<br>Everyone else: <a href="/">Paywall Any Link</a>.</h2>
<p class="secsub">Hosted links on pay.nanotab.dev keep 98% and need zero code. This page is the developer path: self-host the same x402 paywall on your own server and keep 99.9% (0.1% fee), or give your agent a wallet that pays per call.</p>
</section>
<section class="block" aria-label="Self-host">
<h2>Self-host: paywall your server</h2>
<p class="secsub">One command wraps an existing Express server. Health routes stay free; every other route answers 402 until an agent pays USDC on Base.</p>
<pre class="codeblock"><code>npx nanotab protect --price 0.02 --wallet 0xYourWallet ./server.js
# --route "/keyword/*" limits wrapping · --yes applies in place
# without --yes it prints a diff and asks [Y/n]</code></pre>
</section>
<section class="block" aria-label="Merchant and agent SDKs">
<h2>Charge and pay in code</h2>
<p class="secsub">Merchant middleware issues the 402; the agent SDK answers it — policy check, sign, retry — with spend logged per call.</p>
<div class="steps">
<div class="step"><span class="n">@nanotab/merchant</span><h3>Charge per call</h3><p><code>nanotabCharge({ price, wallet })</code> Express middleware. 402 with x402 terms, structural verify, settlement accounting.</p></div>
<div class="step"><span class="n">@nanotab/agent-sdk</span><h3>Pay per call</h3><p><code>nanotabFetch(url)</code> handles 402 → policy check → sign (USDC on Base, gas via paymaster) → retry with <code>X-Payment</code>.</p></div>
<div class="step"><span class="n">Gateway</span><h3>Managed edge</h3><p>The Cloudflare gateway verifies at the edge and proxies to your origin. Per-listing hosted links skip all of this — <a href="/">that is the leading product</a>.</p></div>
</div>
</section>
<section class="block" id="agents" aria-label="Agents creating paywalls">
<h2>Agents creating paywalls</h2>
<p class="secsub">Agents can submit links too — but nothing an agent submits publishes on its own. Every agent link waits in the account owner's <a href="/agent-auth">daily authorization queue</a>: unapproved links return <code>403</code> at fetch time (never 402 terms, never content), rejected links read as <code>404</code>, and approved links carry a <b style="color:var(--txt)">Created by agent</b> badge. Human-created links still publish instantly.</p>
<pre class="codeblock"><code># agent submits (queued as pending, returns 202)
curl -X POST https://pay.nanotab.dev/v1/agent/submit \\
  -H "X-Agent-Key: $AGENT_KEY" -H "content-type: application/json" \\
  -d '{"title":"…","mime":"text/markdown","price_cents":25,
       "merchant_wallet":"0x…","body_b64":"…","agent_name":"my-agent",
       "source_url":"https://example.com/source"}'

# owner reviews the daily queue (browser, sign-in required)
#   https://pay.nanotab.dev/agent-auth
# owner automation (session cookie or publish key):
#   GET  /v1/agent/pending
#   POST /v1/agent/review  {"slug":"…","action":"approve"|"reject"}</code></pre>
</section>
<section class="block" aria-label="Discovery">
<h2>Discovery for machines</h2>
<p class="secsub">Published links list themselves. Pending agent links never appear here.</p>
<pre class="codeblock"><code>GET https://pay.nanotab.dev/v1/marketplace.json   # flat listing file
GET https://pay.nanotab.dev/.well-known/x402      # x402 capability doc
GET https://pay.nanotab.dev/stats                 # totals + fee terms</code></pre>
<p style="color:var(--mut);font-size:14.5px">Automation with the shared publish key still works at <a href="/publish">/publish</a>. Full docs and source: <a href="https://nanotab.dev">nanotab.dev</a> · <a href="https://github.com/HectorTries/nanotab">GitHub</a>.</p>
</section>
<div class="card" style="text-align:center">
<h2>Not writing code today?</h2>
<p style="color:var(--mut)">The hosted flow needs no server, no key and no gas. Paste a link and you are selling in seconds.</p>
<a class="btn" href="/#create" style="margin-top:8px">Paywall Any Link — free</a>
</div>
${FOOTER}
</div></body></html>`;
}

export function agentAuthHtml(): string {
  return head(
    'Agent review — daily authorization queue · NanoTab Pay',
    'Daily authorization queue for NanoTab Pay: the account owner approves or rejects agent-submitted paywall links before they publish. Unapproved links return 403.'
  ) + topbar('/#create', 'Paywall a link') + `
<div class="wrap" style="max-width:820px">
<section class="block" style="padding-top:48px">
<p class="eyebrow">Owner only · Daily review</p>
<h2 style="font-size:clamp(28px,4vw,40px)">Agent authorization queue</h2>
<p class="secsub">Agents can create paywall links, but none of them publish on their own. Review today's submissions: <b style="color:var(--txt)">approve</b> to publish (the link gets a “Created by agent” badge), <b style="color:var(--txt)">reject</b> to drop it. Until you approve, the link returns <code>403</code> — no 402 terms, no content, no payments. Human-created links never wait here; they publish instantly.</p>
<p class="secsub" id="queue-date" style="font-size:14.5px"></p>
</section>
<div id="queue-signin" class="card hidden">
<h2>Sign in to review</h2>
<p class="card-sub">The queue is restricted to the account owner. Sign in with the owner email to approve or reject agent submissions.</p>
<a class="btn" href="/login?next=/agent-auth">Sign in →</a>
</div>
<div id="queue-main" class="hidden">
<div id="queue-list"><i>loading queue...</i></div>
</div>
<div class="card">
<h2 style="font-size:17px">How an agent submits</h2>
<p class="card-sub" style="margin-bottom:0">Agents post to <code>POST /v1/agent/submit</code> with an <code>X-Agent-Key</code>. The submission is stored as <b style="color:var(--txt)">pending</b> and listed here oldest-first. Approval flips it live with the badge; rejection keeps it unpublished (<code>404</code> at fetch). Details for agent builders: <a href="/developers#agents">For developers → Agents creating paywalls</a>.</p>
</div>
${FOOTER}
</div>
<script>
var $=function(id){return document.getElementById(id)};
async function api(p,o){o=o||{};o.credentials='include';if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
$('queue-date').textContent='Queue for '+new Date().toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})+' · oldest first · approval publishes instantly';
function renderQueue(items){
 if(!items.length){$('queue-list').innerHTML='<div class="card" style="margin:0"><b>Queue clear.</b><br><span style="color:var(--mut);font-size:14.5px">No agent submissions waiting. New submissions appear here as agents post them.</span></div>';return}
 $('queue-list').innerHTML=items.map(function(l){
  var src=l.source_url?'<div class="m">source: <a href="'+esc(l.source_url)+'">'+esc(l.source_url)+'</a></div>':'';
  return '<div class="queue-item"><div class="t">'+esc(l.title)+' <span class="tag pending">pending</span><span class="tag agent">Created by agent</span></div>'
  +'<div class="m">$'+l.price_usd+' per view · '+esc(l.mime)+' · '+l.bytes+' bytes · payout <code>'+esc(l.merchant)+'</code></div>'
  +'<div class="m">agent: <b style="color:var(--txt)">'+esc(l.agent_name)+'</b> · submitted '+esc(l.created_at.slice(0,16).replace('T',' '))+' UTC</div>'
  +src
  +'<div class="m">link (403 until approved): <a href="'+l.url+'">'+l.url+'</a></div>'
  +'<button onclick="review(\\''+l.slug+'\\',\\'approve\\')">Approve &amp; publish</button> <button class="danger" onclick="review(\\''+l.slug+'\\',\\'reject\\')">Reject</button></div>'}).join('');
}
async function loadQueue(){
 var r=await api('/v1/agent/pending');
 if(r.st===401){$('queue-signin').classList.remove('hidden');$('queue-main').classList.add('hidden');return}
 if(r.st===403){$('queue-list').innerHTML='<div class="out">Signed in, but agent review is restricted to the account owner.</div>';$('queue-main').classList.remove('hidden');return}
 if(!r.ok){$('queue-list').textContent='Could not load the queue ('+r.st+').';$('queue-main').classList.remove('hidden');return}
 $('queue-signin').classList.add('hidden');$('queue-main').classList.remove('hidden');
 renderQueue(r.j);
}
async function review(slug,action){
 var r=await api('/v1/agent/review',{method:'POST',body:JSON.stringify({slug:slug,action:action})});
 if(!r.ok){alert('review failed: '+((r.j&&r.j.error)||r.st));return}
 loadQueue();
}
loadQueue();
</script></body></html>`;
}
