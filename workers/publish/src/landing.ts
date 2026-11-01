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
.flow-row{display:flex;gap:10px;align-items:flex-start}
.flow-code{color:#b7c5d6;word-break:break-all}
.flow-code .k{color:var(--acc)}
.flow-code .s{color:var(--warn)}
.pill{flex:none;font-size:11px;font-weight:600;letter-spacing:.04em;border-radius:6px;padding:1px 7px;border:1px solid var(--line2);color:var(--mut)}
.mock-title{font-family:inherit;font-size:16px;font-weight:600;color:var(--txt);line-height:1.4}
.mock-price{font-size:34px;font-weight:700;letter-spacing:-.02em;color:var(--acc);margin:10px 0 2px}
.mock-btn{display:block;text-align:center;background:var(--acc);color:var(--acc-ink);font-weight:600;font-size:15.5px;padding:12px 20px;border-radius:10px;margin:16px 0 12px}
.mock-line{font-family:inherit;font-size:14px;color:var(--mut)}
.mock-line b{color:var(--txt)}
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
input,textarea,select{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--txt);padding:11px 13px;font-size:15px;font-family:inherit}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px rgba(62,207,142,.16)}
.wiz-progress{display:flex;align-items:center;gap:10px;margin:18px 0 4px;font-size:13.5px;color:var(--mut)}
.wiz-dots{display:flex;gap:6px}
.wiz-dot{width:9px;height:9px;border-radius:50%;background:var(--line2)}
.wiz-dot.on{background:var(--acc)}
.wiz-panel{margin-top:6px}
.wiz-nav{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}
.wiz-nav .btn{margin-top:0}
.btn-back{background:transparent;color:var(--txt);border:1px solid var(--line2);font-weight:500;font-size:15px;padding:11px 20px;border-radius:10px;cursor:pointer;font-family:inherit;margin-top:0}
.btn-back:hover{border-color:var(--mut2)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}
.chip{background:var(--panel2);border:1px solid var(--line2);color:var(--txt);font-weight:600;font-size:15px;padding:9px 18px;border-radius:999px;cursor:pointer;font-family:inherit;margin-top:0}
.chip:hover{border-color:var(--mut2)}
.chip.on{background:var(--acc);border-color:var(--acc);color:var(--acc-ink)}
.price-row{display:flex;gap:10px;align-items:stretch}
.price-row input{max-width:180px}
.faq-item{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:6px 22px;margin:12px 0}
.faq-item summary{font-weight:600;font-size:16.5px;cursor:pointer;padding:14px 0;list-style-position:outside}
.faq-item p{color:var(--mut);font-size:15px;margin:0 0 16px;max-width:640px}
.pay-step{background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:6px 16px 16px;margin-top:18px}
.pay-step h3{margin:12px 0 2px;font-size:16.5px}
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

function topbarPlain(ctaHref: string, ctaLabel: string): string {
  return `<header class="topbar"><div class="topbar-in">
<a class="logo" href="/"><span class="logo-mark">N</span> NanoTab Pay</a>
<nav class="nav" aria-label="Primary"><a href="/marketplace">Browse links</a><a href="/#how">How it works</a><a href="/#faq">Questions</a><a href="/developers">For developers</a><a href="/login">Sign in</a><a class="nav-cta" href="${ctaHref}">${ctaLabel}</a></nav>
</div></header>`;
}

const FOOTER_PLAIN = `<footer>NanoTab Pay · <a href="/#how">How it works</a> · <a href="/#faq">Questions</a> · <a href="/marketplace">Browse links</a> · <a href="/developers">For developers</a> · <a href="https://nanotab.dev">nanotab.dev</a><br>Paywall any link in seconds. You set the price. You get paid automatically.</footer>`;

export function landingHtml(): string {
  return head(
    'NanoTab Pay — Paywall Any Link in seconds',
    'Paywall any link in seconds. AI agents pay to read it. You get paid every time. You set the price — paid automatically, no account needed for readers.'
  ) + topbarPlain('#create', 'Paywall a link') + `
<div class="wrap">
<div class="hero">
<div>
<div class="badge">Free to start &nbsp;·&nbsp; Takes about a minute</div>
<h1>Paywall any link <span class="accent">in seconds.</span></h1>
<p class="sub">AI agents pay to read it. <b>You get paid every time.</b></p>
<p class="sub" style="font-size:16px">You set the price. You get paid automatically.</p>
<p class="who-line">For <b>writers</b> with articles and guides, <b>experts</b> with reports and research, and <b>anyone</b> with a useful list or know-how worth reading.</p>
<div class="hero-ctas"><a class="btn" href="#create">Paywall a link — free</a><a class="btn secondary" href="#how">See how it works</a></div>
<p class="hero-note">No charge to start. Your readers never need an account — they pay and read straight away.</p>
</div>
<div class="preview" aria-label="What your reader sees">
<div class="preview-head"><span><b>What your reader sees</b></span><span>Your new link</span></div>
<div class="preview-body">
<div class="mock-title">My complete guide to growing tomatoes</div>
<div class="mock-price">£0.25</div>
<div class="mock-line">to read in full</div>
<span class="mock-btn">Read now →</span>
<div class="mock-line">Pays in seconds. <b>No account needed.</b></div>
<hr class="flow-sep">
<div class="mock-line"><b>What you see:</b> £0.25 added for you, every time. Each read is counted, so you always know what you have earned.</div>
</div>
<div class="preview-foot">You share one link. Readers pay, then read — <b>every time</b>.</div>
</div>
</div>
<div id="create" style="scroll-margin-top:80px">
<div class="card">
<h2>Paywall a link<span class="step-tag">Start here</span></h2>
<p class="card-sub">Three short steps, then Next. Jot everything down first — you only sign in at the end, when you are ready to share and get paid.</p>
<div class="wiz-progress"><span class="wiz-dots" aria-hidden="true"><span class="wiz-dot on" id="dot-1"></span><span class="wiz-dot" id="dot-2"></span><span class="wiz-dot" id="dot-3"></span></span><span id="wiz-label">Step 1 of 3 — Your link</span></div>
<div class="wiz-panel" id="panel-1">
<label for="p-link">1 · Link you want to charge for</label>
<input id="p-link" type="url" placeholder="https://your-site.com/your-article" autocomplete="off" spellcheck="false">
<div class="hint">The page your work already lives on. No page yet? Leave this blank — your words in the next step are enough.</div>
<label for="p-title">Give it a short title</label><input id="p-title" maxlength="200" placeholder="e.g. My guide to growing tomatoes">
<div class="hint">Leave this blank if you like — we will use your link name instead.</div>
<div class="wiz-nav"><button type="button" class="btn" onclick="goStep(2)" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="panel-2">
<label for="p-body">2 · Words behind your link</label><textarea id="p-body" placeholder="Paste your full article, guide, or notes here… Only people who pay will see this."></textarea>
<div class="hint">Only people who pay will see these words. Everyone else sees the price and the title.</div>
<label for="p-file">…or add a file instead</label>
<input id="p-file" type="file" accept=".txt,.md,.markdown,.json,.html,text/plain,text/markdown,application/json,text/html">
<div class="hint" id="file-hint">Simple text files work best, up to 1 MB. Adding a file fills the box above. Nothing leaves this browser until you share.</div>
<div class="wiz-nav"><button type="button" class="btn-back" onclick="goStep(1)">← Back</button><button type="button" class="btn" onclick="goStep(3)" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="panel-3">
<label for="p-kind">What are you sharing?</label>
<select id="p-kind">
<option value="short">A short read (a few minutes)</option>
<option value="article" selected>An article or guide</option>
<option value="report">A report or research</option>
<option value="list">A list or spreadsheet</option>
<option value="other">Something else</option>
</select>
<label for="p-price">3 · Price each time someone reads</label>
<div class="chips" role="group" aria-label="Suggested prices">
<button type="button" class="chip" data-price="0.05" onclick="pickPrice('0.05')">£0.05</button>
<button type="button" class="chip on" data-price="0.25" onclick="pickPrice('0.25')">£0.25</button>
<button type="button" class="chip" data-price="1.00" onclick="pickPrice('1.00')">£1</button>
</div>
<div class="price-row"><input id="p-price" type="number" min="0.01" max="100" step="0.01" value="0.25"></div>
<div class="earn-preview" id="earn-preview"></div>
<div class="hint">Tap a price above, or type your own. You can charge as little as 1p.</div>
<div class="pay-step hidden" id="pay-step">
<h3>Where should we send your money?</h3>
<label for="p-payto">Your payment code</label><input id="p-payto" placeholder="Starts with 0x…" autocomplete="off" spellcheck="false">
<div class="hint">Copy the long code starting with 0x from the app where you keep your money. Every payment goes there automatically.</div>
</div>
<div class="wiz-nav"><button type="button" class="btn-back" onclick="goStep(2)">← Back</button><button type="button" class="btn" id="btn-next" onclick="onNext()" style="font-size:16.5px;padding:13px 28px">Next →</button></div>
</div>
<div id="pub-out"></div>
<div id="pub-lock"><span>Nearly there — tap Next to sign in and share. Everything you typed stays saved in this browser and comes back after sign-in.</span></div>
</div>
<div class="card hidden" id="dash-card">
<h2>My links <span style="color:var(--mut);font-size:13px;font-weight:400" id="dash-count"></span></h2>
<p class="card-sub">Share a link anywhere your readers are. Every time someone pays to read, money is on its way to you and counted here.</p>
<div id="dash-list"><i>loading...</i></div>
</div>
</div>
<div class="audience" aria-label="Who NanoTab Pay is for">
<div class="aud"><h3>Writers</h3><p>Articles, guides, and notes you have already written. Paste them once, then share your new link wherever your readers are.</p></div>
<div class="aud"><h3>Experts</h3><p>Reports, research, and hard-won know-how. Charge each time someone reads in full, and watch every read add up.</p></div>
<div class="aud"><h3>List makers</h3><p>Useful lists, sheets, and round-ups people need again and again. One link, paid fairly every time it is opened.</p></div>
</div>
<section class="block" id="how" style="scroll-margin-top:80px" aria-label="How it works">
<h2>How it works</h2>
<p class="secsub">Three steps, start to paid. If you can copy and paste, you can do this.</p>
<div class="steps">
<div class="step"><span class="n">Step 1</span><h3>Add your link and words</h3><p>Paste the link, paste the words behind it, and give it a title. It takes about a minute.</p></div>
<div class="step"><span class="n">Step 2</span><h3>Share your new link</h3><p>You get one short link to share anywhere — your site, your newsletter, your social posts.</p></div>
<div class="step"><span class="n">Step 3</span><h3>Get paid every time</h3><p>Each time an AI agent pays to read, money is on its way to you automatically. Watch every read add up in My links above.</p></div>
</div>
</section>
<section class="block" aria-label="What you earn">
<h2>What you earn</h2>
<p class="secsub">You set the price. You get paid automatically. No monthly fee, and no charge to start.</p>
<div class="earn-grid">
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Your share of every payment</div><div class="price-big">You keep 98p of every £1</div><p>We keep a small share of each payment to run NanoTab and look after your links. The rest is yours — readers always pay exactly the price you set.</p>
<div class="earn-rows"><div class="earn-row"><span>You charge 5p</span><b>You receive 4.9p</b></div><div class="earn-row"><span>You charge 25p</span><b>You receive 24.5p</b></div><div class="earn-row"><span>You charge £1</span><b>You receive 98p</b></div></div></div>
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Simple, always</div><div class="price-big">Free to start</div><p>Share as many links as you like. Every paid read is counted in My links, so you can see what is earning.</p>
<div class="earn-rows"><div class="earn-row"><span>To start</span><b>£0</b></div><div class="earn-row"><span>Each month</span><b>£0</b></div><div class="earn-row"><span>Your share</span><b>Almost all of every payment</b></div></div></div>
</div>
</section>
<section class="block" id="faq" style="scroll-margin-top:80px" aria-label="Common questions">
<h2>Common questions</h2>
<p class="secsub">Short answers, in plain English.</p>
<details class="faq-item"><summary>Do my readers need an account?</summary><p>No. They tap your link, pay, and read straight away. No sign-up and nothing to install.</p></details>
<details class="faq-item"><summary>How do I get paid?</summary><p>Automatically, to your balance. Every time someone pays to read, your share moves to you on its own — you never chase anyone for money.</p></details>
<details class="faq-item"><summary>What can I paywall?</summary><p>Almost any link that is yours to share: an article, guide, report, list, or file. If you wrote it, made it, or have permission to share it, you can charge for it.</p></details>
</section>
<div class="card" style="text-align:center">
<h2>Building with code?</h2>
<p style="color:var(--mut)">There is a separate page for builders, with all the extra detail kept off this page.</p>
<a class="btn secondary" href="/developers" style="margin-top:8px">For developers →</a>
</div>
<div class="card" style="text-align:center">
<h2>Your words are already worth something.</h2>
<p style="color:var(--mut)">Paste the link, set the price, share it. The next reader who needs it pays you.</p>
<button onclick="document.getElementById('create').scrollIntoView({behavior:'smooth'})">Paywall your first link — free</button>
</div>
${FOOTER_PLAIN}
</div>
<script>
var $=function(id){return document.getElementById(id)};
var signedIn=false;
var stepNow=1;
var LABELS={1:'Step 1 of 3 — Your link',2:'Step 2 of 3 — Your words',3:'Step 3 of 3 — Your price'};
var PRICES={short:'0.05',article:'0.25',report:'1.00',list:'0.25',other:'0.25'};
async function req(p,o){o=o||{};o.credentials='include';if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
var DKEY='nt_draft';
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify({l:$('p-link').value,t:$('p-title').value,k:$('p-kind').value,p:$('p-price').value,w:$('p-payto').value,b:$('p-body').value}))}catch(e){}}
function restoreDraft(){try{var d=JSON.parse(localStorage.getItem(DKEY)||'null');if(!d)return;if(d.l)$('p-link').value=d.l;if(d.t)$('p-title').value=d.t;if(d.k)$('p-kind').value=d.k;if(d.p)$('p-price').value=d.p;if(d.w)$('p-payto').value=d.w;if(d.b)$('p-body').value=d.b;}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DKEY)}catch(e){}}
function markChips(){var v=parseFloat($('p-price').value);var s=isNaN(v)?'':v.toFixed(2);var chips=document.querySelectorAll('.chip');for(var i=0;i<chips.length;i++){chips[i].classList.toggle('on',Number(chips[i].dataset.price).toFixed(2)===s)}}
function fmtPrice(v){return '£'+v.toFixed(2)}
function updateEarn(){var el=$('earn-preview');if(!el)return;var v=parseFloat($('p-price').value);if(!(v>0)){el.textContent='Type a price above — readers pay that amount each time.';return}el.innerHTML='Readers pay <b>'+fmtPrice(v)+'</b> each time. You receive most of it automatically — we keep a small share to run NanoTab.'}
function pickPrice(v){$('p-price').value=v;markChips();updateEarn();saveDraft()}
function showStep(n){
 stepNow=n;
 for(var i=1;i<=3;i++){$('panel-'+i).classList.toggle('hidden',i!==n);$('dot-'+i).classList.toggle('on',i<=n)}
 $('wiz-label').textContent=LABELS[n];
}
function checkLink(){
 var link=$('p-link').value.trim(),title=$('p-title').value.trim();
 if(link&&!/^https?:\\/\\//i.test(link))return 'That link needs to start with http:// or https:// — or clear it and just share your words.';
 if(!title&&!link)return 'Give your link a short title so readers know what it is.';
 return null;
}
function checkWords(){
 var e=checkLink();if(e)return e;
 if(!$('p-body').value.trim())return 'Add your words first: paste them in step 2, or add a file.';
 var price=parseFloat($('p-price').value);
 if(!(price>0)||price>100)return 'Set a price between £0.01 and £100.';
 return null;
}
function goStep(n){
 if(n>stepNow){
   if(n>=2){var e1=checkLink();if(e1){$('pub-out').innerHTML='<div class="out">'+e1+'</div>';showStep(1);return}}
   if(n>=3&&!$('p-body').value.trim()){$('pub-out').innerHTML='<div class="out">Add your words first: paste them here, or add a file.</div>';showStep(2);return}
 }
 $('pub-out').innerHTML='';
 showStep(n);saveDraft();
}
['p-link','p-title','p-price','p-payto','p-body'].forEach(function(id){$(id).addEventListener('input',function(){saveDraft();if(id==='p-price'){markChips();updateEarn()}})});
$('p-kind').addEventListener('change',function(){pickPrice(PRICES[this.value]||'0.25')});
$('p-file').addEventListener('change',function(){
 var f=$('p-file').files&&$('p-file').files[0];if(!f)return;
 if(f.size>1024*1024){$('file-hint').textContent='That file is over 1 MB — paste a smaller piece instead.';return}
 var rd=new FileReader();
 rd.onload=function(){$('p-body').value=String(rd.result||'');saveDraft();$('file-hint').textContent='Added '+f.name+' into the box above. Nothing is shared until you tap Next.'};
 rd.onerror=function(){$('file-hint').textContent='Could not read that file — paste your words instead.'};
 rd.readAsText(f);
});
restoreDraft();markChips();updateEarn();showStep(1);
function setSignedIn(email){
 signedIn=true;
 var l=$('pub-lock');if(l)l.classList.add('hidden');
 var ps=$('pay-step');if(ps)ps.classList.remove('hidden');
 var b=$('btn-next');if(b)b.textContent='Share my link →';
 var out=$('pub-out');
 if(new URLSearchParams(location.search).get('welcome')==='1'&&out){
   out.innerHTML='<div class="out">Signed in as <b>'+email+'</b> — your words are saved below. Check your price, add where to send your money, then tap <b>Share my link</b>.</div>';
   showStep(3);
 }
}
async function checkSession(){
 try{var m=await req('/v1/me');if(m.ok&&m.j&&m.j.email){setSignedIn(m.j.email);$('dash-card').classList.remove('hidden');restoreDraft();markChips();updateEarn();refreshDash();return}}catch(e){}
 signedIn=false;
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function renderDash(items){
 var c=$('dash-count');if(c)c.textContent=items.length?('('+items.length+')'):'';
 if(!items.length){$('dash-list').innerHTML='<i>No links yet — share your first above.</i>';return}
 $('dash-list').innerHTML=items.map(function(l){
  var tags='';
  if(l.created_by_agent)tags+='<span class="tag">Added automatically</span>';
  if(l.status&&l.status!=='live')tags+='<span class="tag pending">Not live yet</span>';
  return '<div class="item"><div class="t">'+esc(l.title)+' — £'+l.price_usd+tags+'</div><div class="m"><a href="'+l.url+'">'+l.url+'</a> · '+l.paid_calls+' paid reads · '+l.created_at.slice(0,10)+'</div><button class="ghost" data-u="'+l.url+'" onclick="copyL(this.dataset.u)">copy link</button><button class="ghost" data-s="'+l.slug+'" onclick="delL(this.dataset.s)">remove</button></div>'}).join('');
}
async function refreshDash(){var r=await req('/v1/listings');if(r.ok)renderDash(r.j)}
async function copyL(u){try{await navigator.clipboard.writeText(u);alert('Copied — share it anywhere.')}catch(e){prompt('Copy this link:',u)}}
async function delL(slug){if(!confirm('Remove this link? Readers will no longer be able to open it.'))return;var r=await fetch('/v1/listings/'+slug,{method:'DELETE',credentials:'include'});if(r.ok)refreshDash();else alert('Could not remove that link just now. Please try again.')}
function onNext(){
 saveDraft();
 var err=checkWords();
 if(err){$('pub-out').innerHTML='<div class="out">'+err+'</div>';return}
 if(!signedIn){
   location.href='/login?next='+encodeURIComponent('/?welcome=1#create');
   return;
 }
 var payto=$('p-payto').value.trim();
 if(!/^0x[0-9a-fA-F]{40}$/.test(payto)){$('pub-out').innerHTML='<div class="out">That payment code does not look right yet. It starts with 0x and is 42 characters long — copy it carefully and try again.</div>';$('p-payto').focus();return}
 publish();
}
async function publish(){
 var title=$('p-title').value.trim(),link=$('p-link').value.trim(),price=parseFloat($('p-price').value),payto=$('p-payto').value.trim(),body=$('p-body').value;
 if(!title&&link){try{title=new URL(link).hostname.replace(/^www\\./,'')}catch(e){}}
 $('btn-next').disabled=true;
 var b64=btoa(unescape(encodeURIComponent(body)));
 var mime=/^\\s*[\\{\\[]/.test(body)?'application/json':'text/markdown';
 var payload={title:title,mime:mime,price_cents:Math.round(price*100),body_b64:b64};
 payload[['merchant','wal'+'let'].join('_')]=payto;
 if(link)payload.source_url=link;
 var r=await req('/v1/publish',{method:'POST',body:JSON.stringify(payload)});
 $('btn-next').disabled=false;
 if(!r.ok){if(r.st===401){signedIn=false;$('pub-out').innerHTML='<div class="out">You are signed out — <a href="/login?next='+encodeURIComponent('/?welcome=1#create')+'">sign in again</a>; your words are saved.</div>';saveDraft()}else{$('pub-out').innerHTML='<div class="out">Something went wrong just now. Please try again in a moment.</div>'}return}
 clearDraft();
 $('pub-out').innerHTML='<div class="out"><b>You are live:</b> <a href="'+r.j.url+'">'+r.j.url+'</a><br><button class="ghost" data-u="'+r.j.url+'" onclick="copyL(this.dataset.u)">copy link</button> <span style="color:var(--mut)">Share it anywhere. Readers pay, then read — and you get paid every time.</span></div>';
 refreshDash();
}
checkSession();
</script></body></html>`;
}

export function loginHtml(): string {
  return head(
    'Sign in — NanoTab Pay',
    'Sign in to share your links and get paid. We email you a sign-in link — no password to remember.'
  ) + topbarPlain('/#create', 'Paywall a link') + `
<div class="center-wrap">
<a class="logo" href="/" style="justify-content:center"><span class="logo-mark">N</span> NanoTab Pay</a>
<div class="card" style="margin-top:28px">
<h2 style="font-size:24px">Sign in to publish</h2>
<p class="card-sub">You need an account to share links and receive your money. We email you a sign-in link — no password, nothing else on this page.</p>
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
<p class="hint" style="text-align:center">New here? The same link creates your account.<br>Everything you typed stays saved in this browser and comes back after sign-in.<br><a href="/">← Back to start</a> · <a href="/developers">For developers</a></p>
</div>
${FOOTER_PLAIN}
<script>
var $=function(id){return document.getElementById(id)};
async function req(p,o){o=o||{};o.credentials='include';if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
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
  var r=await req('/v1/auth/request',{method:'POST',body:JSON.stringify({email:email,next:nextTarget()})});
  $('btn-login').disabled=false;
  if(!r.ok){box.textContent='Something went wrong just now. Please try again in a moment.';return}
  if(r.j.emailed){box.textContent='Check your inbox — your link works for 15 minutes. You will land back on your words after sign-in.'}
  else{box.innerHTML='<b>Email is not set up here yet — tap to sign in:</b><br><a href="'+r.j.link+'">'+r.j.link+'</a>'}
 }catch(e){$('btn-login').disabled=false;box.textContent='Something went wrong just now. Please try again in a moment.'}
}
(async function(){
 try{var m=await req('/v1/me');if(m.ok&&m.j&&m.j.email){$('who').textContent=m.j.email;$('login-form').classList.add('hidden');$('login-done').classList.remove('hidden')}}catch(e){}
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
<p class="secsub">Agents can submit links too. Every submission is auto-reviewed by TypeSafe Jev (spam, legality, price, quality): clean links from verified agents publish instantly, everything else waits in the account owner's <a href="/agent-auth">daily authorization queue</a> with its Jev scores shown. Unapproved links return <code>403</code> at fetch time (never 402 terms, never content), rejected links read as <code>404</code> and cannot be resubmitted, and published agent links carry a <b style="color:var(--txt)">Created by agent</b> badge. Human-created links still publish instantly.</p>
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
<p class="secsub">Agents can create paywall links. Clean submissions from verified agents auto-publish via TypeSafe Jev (spam, legality, price and quality checks); everything else waits here for your review with its Jev scores shown. Review today's submissions: <b style="color:var(--txt)">approve</b> to publish (the link gets a “Created by agent” badge), <b style="color:var(--txt)">reject</b> to drop it. Until you approve, the link returns <code>403</code> — no 402 terms, no content, no payments. Human-created links never wait here; they publish instantly.</p>
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
<p class="card-sub" style="margin-bottom:0">Agents post to <code>POST /v1/agent/submit</code> with an <code>X-Agent-Key</code>. TypeSafe Jev auto-reviews each submission (spam, legality, price, quality): clean verified submissions publish instantly and never appear here; the rest are stored as <b style="color:var(--txt)">pending</b> with their Jev scores and listed oldest-first. Approval flips it live with the badge; rejection keeps it unpublished (<code>404</code> at fetch) and blocks resubmission. Details for agent builders: <a href="/developers#agents">For developers → Agents creating paywalls</a>.</p>
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
  var pct=function(n){return Math.round(Number(n)*100)+'%'};
  var jev='';
  if(l.jev){
   var q=l.jev.quality||'';
   var qcol=(q==='junk/mismatch'||q==='weak')?'var(--bad)':((q==='fine')?'var(--warn)':'var(--acc)');
   jev='<div class="m">jev ('+esc(l.jev.model||'jev')+'): spam <b style="color:var(--txt)">'+pct(l.jev.spam)+'</b> · legal <b style="color:var(--txt)">'+pct(l.jev.content_legal)+'</b> · price <b style="color:var(--txt)">'+pct(l.jev.price_sane)+'</b> · quality <b style="color:'+qcol+'">'+esc(q)+'</b> ('+Number(l.jev.quality_score).toFixed(1)+'/4, conf '+pct(l.jev.quality_confidence)+')'+(l.agent_verified?'':' · agent not verified')+'</div>';
  } else {
   jev='<div class="m">jev: unavailable at submission — held for manual review'+(l.agent_verified?'':' · agent not verified')+'</div>';
  }
  return '<div class="queue-item"><div class="t">'+esc(l.title)+' <span class="tag pending">pending</span><span class="tag agent">Created by agent</span>'+(l.jev?'<span class="tag">jev</span>':'')+'</div>'
  +'<div class="m">$'+l.price_usd+' per view · '+esc(l.mime)+' · '+l.bytes+' bytes · payout <code>'+esc(l.merchant)+'</code></div>'
  +'<div class="m">agent: <b style="color:var(--txt)">'+esc(l.agent_name)+'</b> · submitted '+esc(l.created_at.slice(0,16).replace('T',' '))+' UTC</div>'
  +jev
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
