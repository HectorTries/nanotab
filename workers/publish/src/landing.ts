export function landingHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NanoTab Pay — Paywall anything for agents in a few clicks</title>
<meta name="description" content="Paywall anything for agents in a few clicks. Paste content, set a price, share a link — AI agents pay per call in USDC on Base. You keep 98% hosted, 99.9% self-hosted.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0b0d10;--panel:#12161c;--panel2:#0e1218;--line:#232b36;--line2:#2d3746;--txt:#f2f5f7;--mut:#9fb0c0;--mut2:#7f8fa3;--acc:#3ecf8e;--acc-ink:#06281a;--warn:#e8b34b;--radius:12px}
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
@media(max-width:680px){.nav a:not(.nav-cta){display:none}}
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
label{display:block;margin:14px 0 5px;color:var(--mut);font-size:14px;font-weight:500}
input,textarea{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--txt);padding:11px 13px;font-size:15px;font-family:inherit}
input:focus,textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px rgba(62,207,142,.16)}
textarea{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;min-height:140px;resize:vertical;line-height:1.6}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.row{grid-template-columns:1fr}}
button{background:var(--acc);border:1px solid var(--acc);border-radius:10px;color:var(--acc-ink);font-weight:600;font-size:15.5px;padding:11px 22px;cursor:pointer;margin-top:16px;font-family:inherit}
button:hover{filter:brightness(1.06)}
button:disabled{opacity:.55;cursor:wait}
button.ghost{background:transparent;border:1px solid var(--line2);color:var(--txt);font-weight:500;font-size:14px;padding:7px 14px;margin:6px 6px 0 0}
button.ghost:hover{border-color:var(--mut2);filter:none}
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
footer{color:var(--mut2);font-size:13.5px;text-align:center;padding:48px 0 40px;margin-top:56px;border-top:1px solid var(--line)}
.hidden{display:none}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<header class="topbar"><div class="topbar-in">
<a class="logo" href="/"><span class="logo-mark">N</span> NanoTab Pay</a>
<nav class="nav" aria-label="Primary"><a href="/marketplace">Marketplace</a><a href="/stats">Stats</a><a href="https://nanotab.dev">nanotab.dev</a><a href="https://github.com/HectorTries/nanotab">GitHub</a><a class="nav-cta" href="#create">Create a link</a></nav>
</div></header>
<div class="wrap">
<div class="hero">
<div>
<div class="badge"><span class="live-dot"></span><b>Live on Base mainnet</b> &nbsp;·&nbsp; USDC &nbsp;·&nbsp; x402</div>
<h1>Paywall anything for agents <span class="accent">in a few clicks.</span></h1>
<p class="sub">Paste an article, dataset, prompt pack or API response. Set a price. Share your link. <b>AI agents pay per call in USDC on Base</b> — straight to your wallet. No subscriptions. No ETH for gas.</p>
<p class="who-line">For <b>developers</b> with APIs, <b>content owners</b> with articles &amp; research, and <b>data sellers</b> with feeds &amp; datasets.</p>
<div class="hero-ctas"><a class="btn" href="#create">Create a paywall link</a><a class="btn secondary" href="/marketplace">Browse the marketplace</a></div>
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
<div class="audience" aria-label="Who NanoTab Pay is for">
<div class="aud"><h3>Developers</h3><p>Charge per API call instead of giving keys away. One link per endpoint, dataset or tool — agents discover it and pay.</p></div>
<div class="aud"><h3>Content owners</h3><p>Articles, reports, prompt packs and research notes. Paste the text, set a price, share the link anywhere.</p></div>
<div class="aud"><h3>Data sellers</h3><p>Feeds, lookups and niche datasets. Agents pay for each fresh read — you see every paid call in your dashboard.</p></div>
</div>
<section class="block" aria-label="How it works">
<p class="eyebrow">How it works</p>
<h2>Three steps. Then agents pay you.</h2>
<p class="secsub">No server to run, no Stripe account, no gas to manage. If you can paste text, you can sell to agents.</p>
<div class="steps">
<div class="step"><span class="n">Step 1</span><h3>Create a paywall link</h3><p>Sign in with email, paste your content, set a USD price and your Base wallet. You get a <code>pay.nanotab.dev/r/…</code> link.</p></div>
<div class="step"><span class="n">Step 2</span><h3>Agent pays per call in USDC</h3><p>An agent opens your link, gets a <code>402</code> with the price, pays USDC on Base, and retries — content unlocks automatically.</p></div>
<div class="step"><span class="n">Step 3</span><h3>You get paid</h3><p>USDC lands in your wallet on every paid call, minus the fee. Track links and paid calls in your dashboard below.</p></div>
</div>
</section>
<div id="create" style="scroll-margin-top:80px">
<div class="card" id="auth-card">
<h2>Step 1 · Sign in<span class="step-tag">Start here</span></h2>
<p class="card-sub">Email magic link — no password. You can draft your paywall below first; it saves automatically and is restored after sign-in.</p>
<div id="auth-out">
<label for="email">Email</label>
<input id="email" type="email" placeholder="you@example.com" autocomplete="email">
<button id="btn-login" onclick="requestLink()">Email me a sign-in link</button>
<div id="login-msg" class="out hidden"></div>
</div>
<div id="auth-in" class="hidden">
<div>Signed in as <b id="who">…</b></div>
</div>
</div>
<div class="card" id="pub-card">
<h2>Step 2 · Create your paywall link</h2>
<p class="card-sub">Anything you paste becomes pay-per-view for agents. Markdown, plain text or JSON — up to 1 MB.</p>
<div id="pub-fields">
<label for="p-title">Title</label><input id="p-title" maxlength="200" placeholder="e.g. Q3 keyword pack — 500 terms with volume &amp; CPC">
<div class="row"><div><label for="p-price">Price per call (USD)</label><input id="p-price" type="number" min="0.01" max="100" step="0.01" value="1.00"><div class="earn-preview" id="earn-preview"></div></div>
<div><label for="p-wallet">Your USDC wallet (Base)</label><input id="p-wallet" placeholder="0x..." autocomplete="off" spellcheck="false"><div class="hint">Payouts land here in USDC on Base. Use an address you control.</div></div></div>
<label for="p-body">Content (markdown / text / JSON)</label><textarea id="p-body" placeholder="# Hello agents&#10;&#10;Pay to read the full pack..."></textarea>
<button id="btn-pub" onclick="publish()">Publish paywall link</button>
<div id="pub-out"></div>
</div>
<div id="pub-lock"><span>Draft freely — then sign in above to publish. Your text is saved in this browser and will still be here after login.</span></div>
</div>
<div class="card hidden" id="dash-card">
<h2>Step 3 · My links <span style="color:var(--mut);font-size:13px;font-weight:400" id="dash-count"></span></h2>
<p class="card-sub">Share a link anywhere agents look. Every paid call pays your wallet and counts here.</p>
<div id="dash-list"><i>loading...</i></div>
</div>
</div>
<section class="block" aria-label="What you earn">
<p class="eyebrow">Pricing</p>
<h2>What you earn, plainly.</h2>
<p class="secsub">The buyer always pays exactly your listed price. The fee comes out of that — you never invoice anyone and there is no monthly charge.</p>
<div class="earn-grid">
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Hosted on pay.nanotab.dev</div><div class="price-big">You keep 98%</div><p>2% per paid call covers hosting, the paywall and payment verification. No setup fee, no gas — the Circle paymaster covers gas from the payment.</p>
<div class="earn-rows"><div class="earn-row"><span>You list at $0.05</span><b>You receive $0.049</b></div><div class="earn-row"><span>You list at $1.00</span><b>You receive $0.98</b></div><div class="earn-row"><span>You list at $10.00</span><b>You receive $9.80</b></div></div></div>
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Self-host with npm</div><div class="price-big">You keep 99.9%</div><p>0.1% per paid call when you run the paywall yourself with <code>npx nanotab protect</code>. Same x402 flow, your own server. See <a href="https://nanotab.dev">nanotab.dev</a> for the developer path.</p>
<div class="earn-rows"><div class="earn-row"><span>You list at $0.05</span><b>You receive $0.04995</b></div><div class="earn-row"><span>You list at $1.00</span><b>You receive $0.999</b></div><div class="earn-row"><span>Monthly fee</span><b>None</b></div></div></div>
</div>
</section>
<div class="card">
<h2>Live demo — the 402 an agent sees</h2>
<p style="color:var(--mut);font-size:14.5px">An unpaid request to a paywalled link returns <code>402 Payment Required</code> with machine-readable terms. This box loads a real listing:</p>
<div class="out" id="demo-out" style="font-family:'IBM Plex Mono',monospace;font-size:13px;white-space:pre-wrap">loading demo...</div>
<p class="hint">Agents read this JSON, pay the <b style="color:var(--txt)">amount</b> in USDC to <b style="color:var(--txt)">payTo</b>, then retry for the content. <a href="/marketplace">Browse all listings</a> · <a href="/v1/marketplace.json">marketplace.json for machines</a></p>
</div>
<div class="card" style="text-align:center">
<h2>Your knowledge is already worth something.</h2>
<p style="color:var(--mut)">Paste it, price it, share the link. The next agent that needs it pays you.</p>
<button onclick="document.getElementById('create').scrollIntoView({behavior:'smooth'})">Create your first link — free</button>
</div>
<footer>NanoTab Pay · <a href="https://nanotab.dev">nanotab.dev</a> · <a href="/stats">stats</a> · <a href="/marketplace">marketplace</a> (<a href="/v1/marketplace.json">json</a>) · USDC on Base via x402 · Self-host fee 0.1% · Hosted fee 2%</footer>
</div>
<script>
var $=function(id){return document.getElementById(id)};
var signedIn=false;
async function api(p,o){o=o||{};o.credentials='include';o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
var DKEY='nt_draft';
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify({t:$('p-title').value,p:$('p-price').value,w:$('p-wallet').value,b:$('p-body').value}))}catch(e){}}
function restoreDraft(){try{var d=JSON.parse(localStorage.getItem(DKEY)||'null');if(!d)return;if(d.t)$('p-title').value=d.t;if(d.p)$('p-price').value=d.p;if(d.w)$('p-wallet').value=d.w;if(d.b)$('p-body').value=d.b;}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DKEY)}catch(e){}}
function updateEarn(){var el=$('earn-preview');if(!el)return;var v=parseFloat($('p-price').value);if(!(v>0)){el.textContent='';return}var net=(v*0.98);el.innerHTML='You receive <b>$'+net.toFixed(net<0.1?4:2)+'</b> per call hosted (98%) · $'+(v*0.999).toFixed(v<0.1?4:3)+' self-hosted (99.9%)'}
['p-title','p-price','p-wallet','p-body'].forEach(function(id){$(id).addEventListener('input',function(){saveDraft();if(id==='p-price')updateEarn()})});
restoreDraft();updateEarn();
function unlockForm(){signedIn=true;var l=$('pub-lock');if(l)l.classList.add('hidden')}
function lockForm(){signedIn=false;var l=$('pub-lock');if(l)l.classList.remove('hidden')}
async function requestLink(){
 try{
 var em=$('email');var email=(em&&em.value||'').trim();var box=$('login-msg');if(box)box.classList.remove('hidden');
 if(!email){if(box)box.textContent='Enter your email above first.';return;}
 saveDraft();
 $('btn-login').disabled=true;
 if(box)box.textContent='Sending...';
 var r=await api('/v1/auth/request',{method:'POST',body:JSON.stringify({email:email})});
 $('btn-login').disabled=false;
 if(!r.ok){$('login-msg').textContent='Error: '+((r.j&&r.j.error)||r.st);return}
 if(r.j.emailed){$('login-msg').textContent='Check your inbox — link expires in 15 min. Your draft is saved and will be here after you sign in.'}
 else{$('login-msg').innerHTML='<b>Dev mode: email not configured — click to sign in:</b><br><a href="'+r.j.link+'">'+r.j.link+'</a><br><span style="color:var(--mut)">Your draft is saved and will be restored after login.</span>'}
 }catch(e){try{$('btn-login').disabled=false;var b2=$('login-msg');if(b2){b2.classList.remove('hidden');b2.textContent='Error: '+(e&&e.message||e)}}catch(_){}}
}
async function checkSession(){
 try{var m=await api('/v1/me');if(m.ok&&m.j&&m.j.email){$('who').textContent=m.j.email;unlockForm();$('auth-out').classList.add('hidden');$('auth-in').classList.remove('hidden');$('dash-card').classList.remove('hidden');restoreDraft();updateEarn();refreshDash();return}}catch(e){}
 lockForm();
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function renderDash(items){
 var c=$('dash-count');if(c)c.textContent=items.length?('('+items.length+')'):'';
 if(!items.length){$('dash-list').innerHTML='<i>No links yet — publish your first above.</i>';return}
 $('dash-list').innerHTML=items.map(function(l){return '<div class="item"><div class="t">'+esc(l.title)+' — $'+l.price_usd+'</div><div class="m"><a href="'+l.url+'">'+l.url+'</a> · '+l.paid_calls+' paid calls · '+l.created_at.slice(0,10)+'</div><button class="ghost" data-u="'+l.url+'" onclick="copyL(this.dataset.u)">copy link</button><button class="ghost" data-s="'+l.slug+'" onclick="delL(this.dataset.s)">delete</button></div>'}).join('');
}
async function refreshDash(){var r=await api('/v1/listings');if(r.ok)renderDash(r.j)}
async function copyL(u){try{await navigator.clipboard.writeText(u);alert('copied')}catch(e){prompt('copy:',u)}}
async function delL(slug){if(!confirm('delete '+slug+'?'))return;var r=await fetch('/v1/listings/'+slug,{method:'DELETE',credentials:'include'});if(r.ok)refreshDash();else alert('delete failed')}
async function publish(){
 if(!signedIn){saveDraft();$('pub-out').innerHTML='<div class="out">Sign in above to publish — your draft is saved and will still be here. <a href="#create" onclick="document.getElementById(\\'auth-card\\').scrollIntoView({behavior:\\'smooth\\'});return false;">Go to sign-in</a></div>';document.getElementById('auth-card').scrollIntoView({behavior:'smooth'});return}
 var title=$('p-title').value.trim(),price=parseFloat($('p-price').value),wallet=$('p-wallet').value.trim(),body=$('p-body').value;
 if(!title||!(price>0)||!(price<=100)||!/^0x[0-9a-fA-F]{40}$/.test(wallet)||!body){$('pub-out').innerHTML='<div class="out">Fill every field: a title, a price ($0.01–$100), a wallet (0x + 40 hex), and your content.</div>';return}
 $('btn-pub').disabled=true;
 var b64=btoa(unescape(encodeURIComponent(body)));
 var mime=/^\\s*[\\{\\[]/.test(body)?'application/json':'text/markdown';
 var r=await api('/v1/publish',{method:'POST',body:JSON.stringify({title:title,mime:mime,price_cents:Math.round(price*100),merchant_wallet:wallet,body_b64:b64})});
 $('btn-pub').disabled=false;
 if(!r.ok){if(r.st===401){lockForm();$('pub-out').innerHTML='<div class="out">Session expired — sign in above first (your draft is saved).</div>';saveDraft()}else{$('pub-out').innerHTML='<div class="out">Error: '+((r.j&&r.j.error)||r.st)+'</div>'}return}
 clearDraft();
 $('pub-out').innerHTML='<div class="out">Live: <a href="'+r.j.url+'">'+r.j.url+'</a><br><button class="ghost" data-u="'+r.j.url+'" onclick="copyL(this.dataset.u)">copy link</button> <span style="color:var(--mut)">Share it — unpaid visits get 402 + x402 terms, agents pay and unlock.</span></div>';
 refreshDash();
}
checkSession();
(function(){fetch('/v1/marketplace.json').then(function(r){return r.json()}).then(function(d){
 if(d.length){var l=d[0];fetch(l.url,{headers:{accept:'application/json'}}).then(function(r){return r.json().then(function(b){return{st:r.status,b:b}})}).then(function(x){
  var a=x.b.accepts&&x.b.accepts[0];var usd=a?('$'+(Number(a.amount)/1000000).toFixed(2)):'';var show=a?('amount '+a.amount+' ('+usd+' USDC) · payTo '+a.payTo+' · fee '+a.fee):JSON.stringify(x.b).slice(0,300);
  $('demo-out').textContent='GET '+l.url+'\\n→ '+x.st+(x.st===402?' Payment Required':'')+'\\n'+show;
 })} else $('demo-out').textContent='No listings yet — sign in and publish the first one above.';
}).catch(function(){$('demo-out').textContent='demo unavailable'})})();
</script></body></html>`;
}
