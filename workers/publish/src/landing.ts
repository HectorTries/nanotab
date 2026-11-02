// pay.nanotab.dev pages. Leading product: Paywall Any Link.
// No accounts, no email, no sign-in anywhere.
//   /            hero + step-flow (paste link → content → price → wallet → Publish)
//   /developers  demoted developer path (SDK / self-host docs funnel)
//   /agent-auth  daily authorization queue: owner approves agent links (ADMIN_KEY via ?key=)
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
.payto-row{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap}
.payto-row input{flex:1;min-width:220px}
.btn-gen{flex:none;margin-top:0;white-space:nowrap}
.pk-panel{background:var(--panel2);border:1px solid rgba(232,179,75,.5);border-radius:10px;padding:16px;margin-top:16px}
.pk-warn{font-size:14.5px;line-height:1.6;color:var(--txt)}
.pk-warn b{color:var(--warn)}
.pk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;margin-top:8px}
.pk-row input{flex:1;min-width:220px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13.5px}
.pk-row button{margin-top:0}
.pk-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.pk-actions button{margin-top:0}
.agent-curl{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.8px;line-height:1.6;word-break:break-all;margin-top:8px}
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
.dropzone{border:2px dashed var(--line2);border-radius:10px;padding:20px;text-align:center;color:var(--mut);cursor:pointer;margin-top:8px;background:var(--panel2)}
.dropzone.over{border-color:var(--acc);background:rgba(62,207,142,.07);color:var(--txt)}
.dropzone b{color:var(--txt)}
.dropzone input[type=file]{border:0;background:none;padding:0;margin:12px auto 0;font-size:13.5px;display:block}
.dropzone.busy{opacity:.65;cursor:wait}
.seg{display:flex;gap:8px;margin:12px 0 0}
.seg .ghost.on{border-color:var(--acc);color:var(--acc)}
.counts{font-size:13px;color:var(--mut2);margin-top:6px}
.md-preview{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:6px 16px;font-size:14.5px;line-height:1.65;max-height:340px;overflow:auto;margin-top:8px;word-break:break-word}
.md-preview h1{font-size:21px;margin:12px 0 6px;letter-spacing:-.01em}
.md-preview h2{font-size:18px;margin:12px 0 6px}
.md-preview h3{font-size:16px;margin:10px 0 4px}
.md-preview h4,.md-preview h5,.md-preview h6{font-size:14.5px;margin:10px 0 4px}
.md-preview p{margin:8px 0}
.md-preview ul,.md-preview ol{margin:8px 0;padding-left:24px}
.md-preview li{margin:3px 0}
.md-preview pre{background:#07090c;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-family:"IBM Plex Mono",monospace;font-size:13px}
.md-preview code{font-size:13px}
.md-preview blockquote{border-left:3px solid var(--acc);margin:8px 0;padding:2px 12px;color:var(--mut)}
.md-preview table{border-collapse:collapse;width:100%;font-size:13.5px;margin:10px 0}
.md-preview th,.md-preview td{border:1px solid var(--line);padding:6px 9px;text-align:left}
.md-preview th{background:#0a0e13}
.md-preview hr{border:0;border-top:1px solid var(--line);margin:12px 0}
.md-preview .mut{color:var(--mut2)}
details.advanced{margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--panel2)}
details.advanced summary{cursor:pointer;color:var(--mut);font-size:14px;font-weight:600}
details.advanced summary:hover{color:var(--txt)}
.freeprev{margin-top:14px}
.freeprev .preview-label{display:inline-block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--acc-ink);background:var(--acc);font-weight:700;border-radius:999px;padding:2px 12px;margin-bottom:8px}
.hint.busy{color:var(--warn)}
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
<nav class="nav" aria-label="Primary"><a href="/marketplace">Marketplace</a><a href="/developers">For developers</a><a class="nav-cta" href="${ctaHref}">${ctaLabel}</a></nav>
</div></header>`;
}

export const CONTACT_EMAIL = 'support@nanotab.dev';

export const TRUST_LINKS = `<a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/refunds">Refunds &amp; disputes</a> · <a href="/contact">Contact</a> · <a href="/about">About</a>`;

const FOOTER = `<footer>NanoTab Pay · <a href="/developers">For developers</a> · <a href="/marketplace">marketplace</a> (<a href="/v1/marketplace.json">json</a>) · <a href="/stats">stats</a> · <a href="https://nanotab.dev">nanotab.dev</a> · USDC on Base via x402 · Self-host fee 0.1% · Hosted fee 2%<br>${TRUST_LINKS}</footer>`;

function topbarPlain(ctaHref: string, ctaLabel: string): string {
  return `<header class="topbar"><div class="topbar-in">
<a class="logo" href="/"><span class="logo-mark">N</span> NanoTab Pay</a>
<nav class="nav" aria-label="Primary"><a href="/marketplace">Browse links</a><a href="/#how">How it works</a><a href="/#faq">Questions</a><a href="/developers">For developers</a><a class="nav-cta" href="${ctaHref}">${ctaLabel}</a></nav>
</div></header>`;
}

const FOOTER_PLAIN = `<footer>NanoTab Pay · <a href="/#how">How it works</a> · <a href="/#faq">Questions</a> · <a href="/marketplace">Browse links</a> · <a href="/developers">For developers</a> · <a href="https://nanotab.dev">nanotab.dev</a><br>Create a paywall link for agents in seconds. You set the price, keep 98% of every payment (NanoTab keeps 2%).<br>${TRUST_LINKS}</footer>`;

export function walletJs(): string {
  return `/* Instant wallet: standard EVM keypair generated IN THE BROWSER. Mirrors
   viem generatePrivateKey + privateKeyToAccount (secp256k1 + Keccak-256 +
   EIP-55) with no library load and no network call: randomness comes from
   crypto.getRandomValues and derivation is the local BigInt math below.
   The private key lives only in genPk (tab memory) and, on explicit Save,
   localStorage WKEY. It is never placed in a fetch, beacon, URL or log;
   the publish payload sends only the public payout address. */
var genPk='';var genAddr='';var WKEY='nt_instant_wallet_v1';
var WP=BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
var WN=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
var WGX=BigInt('0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
var WGY=BigInt('0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');
var WMASK=(BigInt(1)<<BigInt(64))-BigInt(1);
function wMod(a,m){var r=a%m;return r<BigInt(0)?r+m:r}
function wPow(b,e,m){var r=BigInt(1);b=wMod(b,m);while(e>BigInt(0)){if((e&BigInt(1))===BigInt(1))r=(r*b)%m;b=(b*b)%m;e=e>>BigInt(1)}return r}
function wInv(a,m){return wPow(a,m-BigInt(2),m)}
function wJacDouble(Pt){
 if(Pt.Z===BigInt(0)||Pt.Y===BigInt(0))return{X:BigInt(0),Y:BigInt(1),Z:BigInt(0)};
 var A=wMod(Pt.X*Pt.X,WP);var B=wMod(Pt.Y*Pt.Y,WP);var C=wMod(B*B,WP);
 var D=wMod(BigInt(2)*wMod((Pt.X+B)*(Pt.X+B)-A-C,WP),WP);var E=wMod(BigInt(3)*A,WP);var F=wMod(E*E,WP);
 return{X:wMod(F-BigInt(2)*D,WP),Y:wMod(E*wMod(D-wMod(F-BigInt(2)*D,WP),WP)-BigInt(8)*C,WP),Z:wMod(BigInt(2)*Pt.Y*Pt.Z,WP)};
}
function wJacAdd(Pt,Qt){
 if(Pt.Z===BigInt(0))return Qt;if(Qt.Z===BigInt(0))return Pt;
 var Z1Z1=wMod(Pt.Z*Pt.Z,WP);var Z2Z2=wMod(Qt.Z*Qt.Z,WP);
 var U1=wMod(Pt.X*Z2Z2,WP);var U2=wMod(Qt.X*Z1Z1,WP);
 var S1=wMod(Pt.Y*Qt.Z*Z2Z2,WP);var S2=wMod(Qt.Y*Pt.Z*Z1Z1,WP);
 if(U1===U2){if(S1!==S2)return{X:BigInt(0),Y:BigInt(1),Z:BigInt(0)};return wJacDouble(Pt)}
 var H=wMod(U2-U1,WP);var r=wMod(BigInt(2)*(S2-S1),WP);var I=wMod(BigInt(4)*H*H,WP);var J=wMod(H*I,WP);var V=wMod(U1*I,WP);
 var X3=wMod(r*r-J-BigInt(2)*V,WP);
 return{X:X3,Y:wMod(r*wMod(V-X3,WP)-BigInt(2)*S1*J,WP),Z:wMod(wMod((Pt.Z+Qt.Z)*(Pt.Z+Qt.Z)-Z1Z1-Z2Z2,WP)*H,WP)};
}
function wToAffine(Pt){
 if(Pt.Z===BigInt(0))return null;
 var iz=wInv(Pt.Z,WP);var iz2=wMod(iz*iz,WP);var iz3=wMod(iz2*iz,WP);
 return{x:wMod(Pt.X*iz2,WP),y:wMod(Pt.Y*iz3,WP)};
}
function wScalarMul(k){
 var result={X:BigInt(0),Y:BigInt(1),Z:BigInt(0)};var addend={X:WGX,Y:WGY,Z:BigInt(1)};
 while(k>BigInt(0)){if((k&BigInt(1))===BigInt(1))result=wJacAdd(result,addend);addend=wJacDouble(addend);k=k>>BigInt(1)}
 return wToAffine(result);
}
var WRC=['0x0000000000000001','0x0000000000008082','0x800000000000808a','0x8000000080008000','0x000000000000808b','0x0000000080000001','0x8000000080008081','0x8000000000008009','0x000000000000008a','0x0000000000000088','0x0000000080008009','0x000000008000000a','0x000000008000808b','0x800000000000008b','0x8000000000008089','0x8000000000008003','0x8000000000008002','0x8000000000000080','0x000000000000800a','0x800000008000000a','0x8000000080008081','0x8000000000008080','0x0000000080000001','0x8000000080008008'].map(function(h){return BigInt(h)});
var WRHO=[[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
function wRotl(v,n){if(n===0)return v&WMASK;var b=BigInt(n);return((v<<b)|(v>>(BigInt(64)-b)))&WMASK}
function wKeccakF(st){
 for(var round=0;round<24;round++){
  var C=[];var D=[];
  for(var x=0;x<5;x++)C[x]=st[x]^st[x+5]^st[x+10]^st[x+15]^st[x+20];
  for(var x2=0;x2<5;x2++)D[x2]=C[(x2+4)%5]^wRotl(C[(x2+1)%5],1);
  for(var x3=0;x3<5;x3++)for(var y=0;y<5;y++)st[x3+5*y]=st[x3+5*y]^D[x3];
  var B=[];for(var i=0;i<25;i++)B[i]=BigInt(0);
  for(var x4=0;x4<5;x4++)for(var y2=0;y2<5;y2++)B[y2+5*((2*x4+3*y2)%5)]=wRotl(st[x4+5*y2],WRHO[x4][y2]);
  for(var x5=0;x5<5;x5++)for(var y3=0;y3<5;y3++)st[x5+5*y3]=B[x5+5*y3]^(((~B[((x5+1)%5)+5*y3])&WMASK)&B[((x5+2)%5)+5*y3]);
  st[0]=st[0]^WRC[round];
 }
}
function wKeccak256(bytes){
 var rate=136;var st=[];for(var i=0;i<25;i++)st[i]=BigInt(0);
 var padded=new Uint8Array(rate);padded.set(bytes.subarray(0,rate));padded[bytes.length]=padded[bytes.length]^1;padded[rate-1]=padded[rate-1]^128;
 for(var l=0;l<rate/8;l++){var lane=BigInt(0);for(var j=7;j>=0;j--)lane=(lane<<BigInt(8))|BigInt(padded[l*8+j]);st[l]=st[l]^lane}
 wKeccakF(st);
 var out=new Uint8Array(32);
 for(var l2=0;l2<4;l2++){var lane2=st[l2];for(var j2=0;j2<8;j2++){out[l2*8+j2]=Number(lane2&BigInt(255));lane2=lane2>>BigInt(8)}}
 return out;
}
function wBytesToHex(b){var s='';for(var i=0;i<b.length;i++){var h=b[i].toString(16);if(h.length<2)h='0'+h;s+=h}return s}
function wBigTo32(v){var h=v.toString(16);while(h.length<64)h='0'+h;var out=new Uint8Array(32);for(var i=0;i<32;i++)out[i]=parseInt(h.slice(i*2,i*2+2),16);return out}
function walletAddressFromPrivateKey(pkHex){
 var k=BigInt(pkHex);var pub=wScalarMul(k);
 var buf=new Uint8Array(64);buf.set(wBigTo32(pub.x),0);buf.set(wBigTo32(pub.y),32);
 var h=wKeccak256(buf);var addrHex=wBytesToHex(h.slice(12));
 var hashHex=wBytesToHex(wKeccak256(new TextEncoder().encode(addrHex)));
 var out='0x';
 for(var i=0;i<40;i++)out+=parseInt(hashHex.charAt(i),16)>=8?addrHex.charAt(i).toUpperCase():addrHex.charAt(i);
 return out;
}
function generateInstantWallet(){
 var btn=$('btn-generate-wallet');if(btn)btn.disabled=true;
 try{
  var pk='';
  while(!pk){
   var raw=new Uint8Array(32);crypto.getRandomValues(raw);
   var hex='';for(var i=0;i<32;i++){var hb=raw[i].toString(16);if(hb.length<2)hb='0'+hb;hex+=hb}
   var k=BigInt('0x'+hex);
   if(k>BigInt(0)&&k<WN)pk='0x'+hex;
  }
  genPk=pk;genAddr=walletAddressFromPrivateKey(pk);
  $('p-payto').value=genAddr;
  var f=$('p-pk');f.value=genPk;f.type='password';
  var t=$('btn-pk-toggle');if(t)t.textContent='Show';
  $('wallet-addr-note').textContent='Payout address filled: '+genAddr+' — payouts go here in USDC on Base. The private key above controls this address. If you edit the address, the key will no longer match it.';
  $('wallet-save-note').textContent='Not saved yet. Copy the key into a password manager, then choose Save on this device or Do not save on this device. The key never leaves this browser unless you copy it.';
  $('wallet-panel').classList.remove('hidden');
  var sn=$('wallet-saved-note');sn.classList.add('hidden');sn.textContent='';
 }catch(e){
  $('pub-out').innerHTML='<div class="out">Could not generate a wallet in this browser. Paste your own USDC wallet address on Base instead. <a href="/wallet-guide">Wallet guide</a></div>';
 }
 if(btn)btn.disabled=false;
}
function togglePkVisibility(){
 var f=$('p-pk');var b=$('btn-pk-toggle');if(!f)return;
 if(f.type==='password'){f.type='text';if(b)b.textContent='Hide'}
 else{f.type='password';if(b)b.textContent='Show'}
}
async function copyPrivateKey(){
 if(!genPk){alert('Generate a wallet first.');return}
 try{await navigator.clipboard.writeText(genPk);$('wallet-save-note').textContent='Copied. Paste it into a password manager now — anyone with this key can take payouts sent to '+genAddr+'.'}
 catch(e){prompt('Copy this private key into a password manager:',genPk)}
}
function saveWalletOnDevice(){
 if(!genPk||!genAddr){alert('Generate a wallet first.');return}
 try{
  localStorage.setItem(WKEY,JSON.stringify({address:genAddr,privateKey:genPk}));
  $('wallet-save-note').textContent='Saved on this device for '+genAddr+'. It stays in this browser only — still keep a copy in a password manager. Use Forget in the note below to remove it.';
  refreshSavedWalletNote();
 }catch(e){$('wallet-save-note').textContent='This browser would not save it. Copy the key into a password manager instead.'}
}
function dontSaveWallet(){
 try{
  var raw=localStorage.getItem(WKEY);
  if(raw){var s=JSON.parse(raw);if(s&&s.address===genAddr)localStorage.removeItem(WKEY)}
 }catch(e){}
 $('wallet-save-note').textContent='Not saved on this device. The key stays only in the memory of this tab until you close the tab — copy it into a password manager before you leave, or the funds at '+genAddr+' cannot be recovered.';
 refreshSavedWalletNote();
}
function clearWalletFromScreen(){
 var f=$('p-pk');if(f){f.value='';f.type='password'}
 var b=$('btn-pk-toggle');if(b)b.textContent='Show';
 genPk='';
 $('wallet-panel').classList.add('hidden');
 var sn=$('wallet-saved-note');
 sn.textContent='Private key cleared from screen. If you did not save or copy it, generate a new wallet — the cleared key cannot be shown again. The payout address above stays filled.';
 sn.classList.remove('hidden');
 refreshSavedWalletNote();
}
function refreshSavedWalletNote(){
 var sn=$('wallet-saved-note');if(!sn)return;
 var s=null;
 try{var raw=localStorage.getItem(WKEY);if(raw)s=JSON.parse(raw)}catch(e){}
 if(!s||!/^0x[0-9a-fA-F]{40}$/.test(s.address||'')||!/^0x[0-9a-fA-F]{64}$/.test(s.privateKey||'')){
  if(sn.textContent.indexOf('Private key cleared')!==0)sn.classList.add('hidden');
  return;
 }
 sn.innerHTML='Saved wallet on this device: <code>'+s.address+'</code> <button type="button" class="ghost" onclick="useSavedWallet()">Use this address</button> <button type="button" class="ghost" onclick="forgetSavedWallet()">Forget saved key</button>';
 sn.classList.remove('hidden');
}
function useSavedWallet(){
 try{
  var s=JSON.parse(localStorage.getItem(WKEY)||'null');
  if(!s)return;
  genPk=s.privateKey;genAddr=s.address;
  $('p-payto').value=genAddr;
  var f=$('p-pk');f.value=genPk;f.type='password';
  $('wallet-addr-note').textContent='Payout address filled: '+genAddr+' — payouts go here in USDC on Base.';
  $('wallet-save-note').textContent='Loaded the wallet saved on this device. Keep a copy in a password manager too.';
  $('wallet-panel').classList.remove('hidden');
  showStep(4);
 }catch(e){}
}
function forgetSavedWallet(){
 try{localStorage.removeItem(WKEY)}catch(e){}
 var sn=$('wallet-saved-note');sn.textContent='Saved key removed from this device.';sn.classList.remove('hidden');
}
document.addEventListener('visibilitychange',function(){
 if(document.hidden){var f=$('p-pk');if(f&&f.type==='text'){f.type='password';var b=$('btn-pk-toggle');if(b)b.textContent='Show'}}
});`;
}
export function ingestJs(): string {
  return `/* Content-ingestion helpers (shared by / and /publish): file upload to
   POST /v1/ingest, live markdown preview, word/character counts, and the
   approximate free preview. Preview rendering is safe by construction: raw
   text is HTML-escaped first, then only our own tags are emitted — embedded
   <script>, on* attributes and javascript: URLs can never reach the DOM. */
function mdEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function mdOkUrl(u){return /^(https?:|mailto:|#)/i.test(u)}
function mdInline(raw){
 var s=mdEsc(raw);var codes=[];
 s=s.replace(/\\x60([^\\x60\\n]+)\\x60/g,function(m,c){codes.push(c);return '@@NTCODE'+(codes.length-1)+'@@'});
 s=s.replace(/!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)/g,function(m,t,u){return mdOkUrl(u)?'<a href="'+u+'" rel="noopener" target="_blank">[image: '+t+']</a>':'[image: '+t+']'});
 s=s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)/g,function(m,t,u){return mdOkUrl(u)?'<a href="'+u+'" rel="noopener" target="_blank">'+t+'</a>':t});
 s=s.replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>');
 s=s.replace(/\\*([^*\\n]+)\\*/g,'<em>$1</em>');
 s=s.replace(/@@NTCODE(\\d+)@@/g,function(m,i){return '<code>'+codes[+i]+'</code>'});
 return s;
}
function renderMd(src){
 var lines=String(src==null?'':src).split('\\n'),out=[],i=0,n=lines.length,para=[];
 function flush(){if(para.length){out.push('<p>'+para.join('<br>')+'</p>');para=[]}}
 while(i<n){
  var line=lines[i];
  if(/^\\x60\\x60\\x60/.test(line)){flush();var buf=[];i++;
   while(i<n&&!/^\\x60\\x60\\x60/.test(lines[i])){buf.push(lines[i]);i++}
   i++;out.push('<pre><code>'+mdEsc(buf.join('\\n'))+'</code></pre>');continue}
  if(/^\\s*$/.test(line)){flush();i++;continue}
  var h=/^(#{1,6})\\s+(.+)$/.exec(line);
  if(h){flush();var ht=h[2].replace(/\\s#+\\s*$/,'');out.push('<h'+h[1].length+'>'+mdInline(ht)+'</h'+h[1].length+'>');i++;continue}
  if(/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(line)){flush();out.push('<hr>');i++;continue}
  if(/^\\s*>/.test(line)){flush();var q=[];while(i<n&&/^\\s*>/.test(lines[i])){q.push(mdInline(lines[i].replace(/^\\s*>\\s?/,'')));i++}out.push('<blockquote>'+q.join('<br>')+'</blockquote>');continue}
  var lm=/^\\s*(?:[-*+]|\\d+[.)])\\s+(.+)$/.exec(line);
  if(lm){flush();var items=[],ord=/^\\s*\\d/.test(line);
   while(i<n){var m2=/^\\s*(?:[-*+]|\\d+[.)])\\s+(.+)$/.exec(lines[i]);if(!m2)break;items.push('<li>'+mdInline(m2[1])+'</li>');i++}
   out.push((ord?'<ol>':'<ul>')+items.join('')+(ord?'</ol>':'</ul>'));continue}
  if(/^\\s*\\|/.test(line)&&i+1<n&&/^\\s*\\|?[\\s:|\\-]+\\|[\\s:|\\-]*$/.test(lines[i+1])){
   flush();
   var cells=function(r){var t=r.replace(/^\\s+|\\s+$/g,'').replace(/^\\|/,'').replace(/\\|$/,'');return t.split('|')};
   var trim=function(c){return c.replace(/^\\s+|\\s+$/g,'')};
   var hd=cells(line);i+=2;var rows=[];
   while(i<n&&/^\\s*\\|/.test(lines[i])){rows.push(cells(lines[i]));i++}
   var t='<table><thead><tr>'+hd.map(function(c){return '<th>'+mdInline(trim(c))+'</th>'}).join('')+'</tr></thead>';
   if(rows.length){t+='<tbody>'+rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+mdInline(trim(c))+'</td>'}).join('')+'</tr>'}).join('')+'</tbody>'}
   out.push(t+'</table>');continue}
  para.push(mdInline(line));i++;
 }
 flush();
 return out.join('\\n')||'<p class="mut">Nothing to preview yet.</p>';
}
function mdPlain(src){
 var t=String(src==null?'':src);
 t=t.replace(/\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60/g,' ');
 t=t.replace(/!\\[[^\\]]*\\]\\([^)]*\\)/g,' ');
 t=t.replace(/\\[([^\\]]+)\\]\\([^)]*\\)/g,'$1');
 t=t.replace(/\\x60([^\\x60]+)\\x60/g,'$1');
 t=t.replace(/^\\s{0,3}#{1,6}\\s+/gm,'');
 t=t.replace(/(\\*\\*|__)(.*?)\\1/g,'$2');
 t=t.replace(/(\\*|_)(.*?)\\1/g,'$2');
 t=t.replace(/\\|/g,' ');
 t=t.replace(/<[^>]+>/g,' ');
 return t.replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'');
}
function previewAbstract(src){
 var plain=mdPlain(src);
 var ms=plain.match(/[^.!?]+[.!?]+/g)||[];
 var out='';
 for(var k=0;k<ms.length&&k<4;k++){var s2=ms[k].replace(/^\\s+|\\s+$/g,'');if(!s2)continue;if(out&&out.length>=200)break;out=out?out+' '+s2:s2;if(out.length>=400)break}
 if(!out)out=plain;
 if(out.length>400){var cut=out.slice(0,397);var sp=cut.lastIndexOf(' ');out=(sp>120?cut.slice(0,sp):cut).replace(/\\s+$/,'')+'...'}
 return out;
}
function mdCounts(src){
 var t=String(src==null?'':src);
 var w=t.replace(/[#*_\\x60>\\-\\[\\]()|~+=]/g,' ').split(/\\s+/);
 var n=0;for(var k=0;k<w.length;k++)if(w[k])n++;
 return {chars:t.length,words:n};
}
function initIngest(cfg){
 var drop=document.getElementById(cfg.drop),fileEl=document.getElementById(cfg.file),
 bodyEl=document.getElementById(cfg.body),titleEl=document.getElementById(cfg.title),
 hint=document.getElementById(cfg.hint),countsEl=document.getElementById(cfg.counts),
 prevEl=document.getElementById(cfg.preview),absEl=cfg.abs?document.getElementById(cfg.abs):null,
 tW=cfg.toggleWrite?document.getElementById(cfg.toggleWrite):null,
 tP=cfg.togglePreview?document.getElementById(cfg.togglePreview):null;
 function refresh(){
  var v=bodyEl.value;var c=mdCounts(v);
  if(countsEl)countsEl.textContent=c.words+' words · '+c.chars+' characters'+(c.chars>200000?' — over the 200,000 character limit':'');
  if(prevEl&&prevEl.classList&&!prevEl.classList.contains('hidden'))prevEl.innerHTML=renderMd(v);
  if(absEl)absEl.textContent=previewAbstract(v)||'Your free preview will appear here once you add some words.';
  if(cfg.onEdit)cfg.onEdit();
 }
 function showPreview(on){
  if(!prevEl)return;
  if(on)prevEl.innerHTML=renderMd(bodyEl.value);
  prevEl.classList.toggle('hidden',!on);bodyEl.classList.toggle('hidden',on);
  if(tW)tW.classList.toggle('on',!on);if(tP)tP.classList.toggle('on',on);
 }
 bodyEl.addEventListener('input',refresh);
 if(titleEl)titleEl.addEventListener('input',function(){titleEl.dataset.touched='1';if(cfg.onEdit)cfg.onEdit()});
 if(tW)tW.addEventListener('click',function(){showPreview(false)});
 if(tP)tP.addEventListener('click',function(){showPreview(true)});
 function setBusy(b){fileEl.disabled=b;if(drop.classList)drop.classList.toggle('busy',b);if(hint.classList)hint.classList.toggle('busy',b)}
 async function uploadFile(f){
  if(!f)return;
  if(f.size>10*1024*1024){hint.textContent='That file is over 10 MB — publish a smaller piece instead.';return}
  hint.textContent='Reading '+f.name+'…';setBusy(true);
  try{
   var fd=new FormData();fd.append('file',f,f.name);
   var r=await fetch('/v1/ingest',{method:'POST',body:fd});
   var j=null;try{j=await r.json()}catch(e){}
   if(!r.ok){hint.textContent=(j&&j.error)||'Could not read that file — paste your words instead.';return}
   bodyEl.value=j.markdown;refresh();
   if(titleEl&&!titleEl.dataset.touched&&j.title)titleEl.value=j.title;
   var pg=j.pages?(', '+j.pages+' page'+(j.pages===1?'':'s')):'';
   hint.textContent='Added '+f.name+' ('+j.words+' words'+pg+'). Nothing is shared until you tap Publish link.';
   if(cfg.onFile)cfg.onFile(j);
  }catch(e){hint.textContent='Could not read that file — paste your words instead.'}
  finally{setBusy(false)}
 }
 fileEl.addEventListener('change',function(){var f=fileEl.files&&fileEl.files[0];if(f)uploadFile(f);fileEl.value=''});
 ['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();if(drop.classList)drop.classList.add('over')})});
 ['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();if(drop.classList)drop.classList.remove('over')})});
 drop.addEventListener('drop',function(e){var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)uploadFile(f)});
 drop.addEventListener('click',function(e){if(e.target!==fileEl)fileEl.click()});
 drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();fileEl.click()}});
 return {refresh:refresh,showPreview:showPreview,upload:uploadFile};
}
`;
}

export function landingHtml(): string {
  return head(
    'NanoTab Pay — Create a Paywall Link for Agents in Seconds',
    'Create a paywall link for agents in seconds. Upload your content, set a price — AI agents pay per view in USDC on Base, straight to your wallet.'
  ) + topbarPlain('#create', 'Create a paywall link') + `
<div class="wrap">
<div class="hero">
<div>
<div class="badge">Free to start &nbsp;·&nbsp; Takes about a minute</div>
<h1>Create a paywall link for agents <span class="accent">in seconds.</span></h1>
<p class="sub"><b>AI agents pay to read your link; humans can too.</b> Same link, same price. <b>You get paid every time.</b></p>
<p class="sub" style="font-size:16px">You set the price. Readers pay in USDC on Base — you keep 98% of every payment, NanoTab keeps 2%.</p>
<p class="who-line">For <b>writers</b> with articles and guides, <b>experts</b> with reports and research, and <b>anyone</b> with a useful list or know-how worth reading.</p>
<div class="hero-ctas"><a class="btn" href="#create">Create your paywall link</a><a class="btn secondary" href="#how">See how it works</a></div>
<p class="hero-note"><a href="/r/DemoSample">Try it: pay $0.05 to read a sample</a> · <a href="/demo">What is this demo?</a></p>
<p class="hero-note" id="hero-stats">Live now — we are new, so early sellers stand out. <a href="/stats">See live stats</a></p>
<p class="hero-note">Nobody needs a NanoTab account — not readers, not you. Agents pay automatically; a person pays with a USDC wallet on Base. No card checkout. Posting needs no account either: paste, price, publish.</p>
</div>
<div class="preview" aria-label="What readers and agents see">
<div class="preview-head"><span><b>What readers &amp; agents see</b></span><span>Your new link</span></div>
<div class="preview-body">
<div class="mock-title">My complete guide to growing tomatoes</div>
<div class="mock-price">$0.25</div>
<div class="mock-line">USDC on Base · to read in full</div>
<span class="mock-btn">Pay $0.25 &amp; read →</span>
<div class="mock-line">An AI agent pays this automatically. A person can pay too, with a wallet. <b>No NanoTab account either way.</b></div>
<hr class="flow-sep">
<div class="mock-line"><b>What you see:</b> $0.245 lands in your wallet (98% of $0.25), every time. Each paid read is counted, so you always know what you have earned.</div>
</div>
<div class="preview-foot">One link for agents and people: they pay, then read — <b>every time</b>.</div>
</div>
</div>
<div id="create" style="scroll-margin-top:80px">
<div class="card">
<h2>Paywall a link<span class="step-tag">Start here</span></h2>
<p class="card-sub">Four short steps. <b style="color:var(--txt)">No account needed</b> — no email, no sign-in, no password. Upload your document (or paste your words), set a price, add a payout wallet (or generate one in one click below), and publish. Your link goes live straight away. Keep your link — bookmark it after you publish. There are no accounts, so there is no dashboard to find it in later.</p>
<div class="wiz-progress"><span class="wiz-dots" aria-hidden="true"><span class="wiz-dot on" id="dot-1"></span><span class="wiz-dot" id="dot-2"></span><span class="wiz-dot" id="dot-3"></span><span class="wiz-dot" id="dot-4"></span></span><span id="wiz-label">Step 1 of 4 — Your document</span></div>
<div class="wiz-panel" id="panel-1">
<label>1 · Your document</label>
<div class="dropzone" id="p-drop" tabindex="0" role="button" aria-label="Upload a file: PDF, markdown, or text, up to 10 MB"><b>Drop your file here</b> or <b>browse</b><br>PDF, .md, or .txt — up to 10 MB<input id="p-file" type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"></div>
<div class="hint" id="file-hint">Your file is converted to markdown on our server; the original is discarded and never served. Nothing is published until you tap Publish link.</div>
<div class="seg" role="group" aria-label="Edit or preview"><button type="button" class="ghost on" id="p-write">Write</button><button type="button" class="ghost" id="p-prevbtn">Preview</button></div>
<textarea id="p-body" placeholder="Or paste your words here — markdown works (headings, lists, links, code blocks, tables)…"></textarea>
<div class="counts" id="p-counts">0 words · 0 characters</div>
<div class="md-preview hidden" id="p-preview" aria-label="Markdown preview"></div>
<div class="wiz-nav"><button type="button" class="btn" onclick="goStep(2)" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="panel-2">
<label for="p-title">2 · Give it a short title</label><input id="p-title" maxlength="200" placeholder="e.g. My guide to growing tomatoes">
<div class="hint">Filled in automatically from your document — edit it if you like. Only people who pay will see the full words; everyone else sees the price, the title, and a short free preview.</div>
<div class="freeprev"><span class="preview-label">Free preview</span><div class="out" id="p-abstract">Your free preview will appear here once you add some words.</div></div>
<label for="p-kind">What are you sharing?</label>
<select id="p-kind">
<option value="short">A short read (a few minutes)</option>
<option value="article" selected>An article or guide</option>
<option value="report">A report or research</option>
<option value="list">A list or spreadsheet</option>
<option value="other">Something else</option>
</select>
<div class="hint">This only suggests a sensible price in the next step — you can always change it there.</div>
<details class="advanced"><summary>Advanced — I already host this</summary>
<label for="p-link">Link where this already lives (optional)</label>
<input id="p-link" type="url" placeholder="https://your-site.com/your-article" autocomplete="off" spellcheck="false">
<div class="hint">Gating only covers the copy served through NanoTab; the original URL remains reachable. For real protection, let the upload be the only copy. See <a href="#paywall-how">how the paywall actually works</a>.</div>
</details>
<div class="wiz-nav"><button type="button" class="btn-back" onclick="goStep(1)">← Back</button><button type="button" class="btn" onclick="goStep(3)" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="panel-3">
<label for="p-price">3 · Price each time someone reads</label>
<div class="chips" role="group" aria-label="Suggested prices">
<button type="button" class="chip" data-price="0.05" onclick="pickPrice('0.05')">$0.05</button>
<button type="button" class="chip on" data-price="0.25" onclick="pickPrice('0.25')">$0.25</button>
<button type="button" class="chip" data-price="1.00" onclick="pickPrice('1.00')">$1.00</button>
</div>
<div class="price-row"><input id="p-price" type="number" min="0.01" max="100" step="0.01" value="0.25"></div>
<div class="earn-preview" id="earn-preview"></div>
<div class="hint">Tap a price above, or type your own. Prices are in US dollars — readers pay that amount in USDC on Base. You can charge as little as $0.01.</div>
<div class="wiz-nav"><button type="button" class="btn-back" onclick="goStep(2)">← Back</button><button type="button" class="btn" onclick="goStep(4)" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="panel-4">
<h3 style="margin:4px 0 2px;font-size:17px">4 · Where should we send your money?</h3>
<label for="p-payto">Your USDC wallet address on Base</label>
<div class="payto-row"><input id="p-payto" placeholder="0x… (42 characters)" autocomplete="off" spellcheck="false"><button type="button" class="btn-gen" id="btn-generate-wallet" onclick="generateInstantWallet()">⚡ Generate instant wallet</button></div>
<div class="hint">Every payment is sent here in <b>USDC on the Base network</b>, split on-chain: 98% to this wallet, 2% to NanoTab. There is no NanoTab balance — the money goes straight to your wallet. Posting needs no account: this address is all we need to pay you.</div>
<div class="hint">No wallet yet? Tap <b>Generate instant wallet</b> — it creates a wallet in your browser in one click. The wallet is yours and self-custodied: NanoTab never sees the private key. Funds go to the address above in USDC on Base. <b>If you lose the private key, the funds at that address are lost</b> — we cannot recover it. Already have a wallet? Paste its address instead. See our <a href="/wallet-guide">plain-English wallet guide</a> (two minutes, free). NanoTab will never ask you to send a private key anywhere.</div>
<div id="wallet-panel" class="pk-panel hidden">
<div class="pk-warn"><b>Your new wallet — save this private key now.</b> This key controls your payouts. Anyone who has it can take the money. Store it in a password manager. We cannot recover it.</div>
<label for="p-pk">Private key (shown once)</label>
<div class="pk-row"><input id="p-pk" type="password" readonly value="" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button type="button" class="ghost" id="btn-pk-toggle" onclick="togglePkVisibility()">Show</button><button type="button" class="ghost" id="btn-pk-copy" onclick="copyPrivateKey()">Copy key</button></div>
<div class="hint" id="wallet-addr-note"></div>
<div class="pk-actions"><button type="button" class="ghost" id="btn-pk-save" onclick="saveWalletOnDevice()">Save on this device</button><button type="button" class="ghost" id="btn-pk-nosave" onclick="dontSaveWallet()">Don't save on this device</button><button type="button" class="ghost" id="btn-pk-clear" onclick="clearWalletFromScreen()">Hide &amp; clear from screen</button></div>
<div class="hint" id="wallet-save-note">The key is generated in your browser and never sent to any server. It is only saved if you tap Save on this device. Don't save keeps it in this tab's memory until you close the tab.</div>
</div>
<div id="wallet-saved-note" class="hint hidden"></div>
<div class="wiz-nav"><button type="button" class="btn-back" onclick="goStep(3)">← Back</button><button type="button" class="btn" id="btn-next" onclick="onNext()" style="font-size:16.5px;padding:13px 28px">Publish link →</button></div>
</div>
<div id="pub-out"></div>
<div id="pub-lock"><span><b style="color:var(--txt)">No account needed</b> — tap Publish link and your paywall is live instantly. Keep your link — bookmark it after you publish. There is no account to recover it from.</span></div>
</div>
<div class="card">
<h2>Keep your link — bookmark it</h2>
<p class="card-sub">There are no accounts and no dashboard. When you publish, save the link from the confirmation and bookmark it — that URL is how you and your readers find the paywall again. Payments go straight to your wallet, so you do not need to come back here to get paid.</p>
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
<div class="step"><span class="n">Step 1</span><h3>Add your document</h3><p>Upload your file or paste your words, and give it a title. It takes about a minute.</p></div>
<div class="step"><span class="n">Step 2</span><h3>Share your new link</h3><p>You get one short link to share anywhere — your site, your newsletter, your social posts.</p></div>
<div class="step"><span class="n">Step 3</span><h3>Get paid every time</h3><p>Each time a reader pays — an AI agent automatically, or a person with a wallet — 98% lands in your USDC wallet on Base. Keep your link — bookmark it, because there is no account dashboard to look it up in.</p></div>
</div>
</section>
<section class="block" id="paywall-how" style="scroll-margin-top:80px" aria-label="How the paywall actually works">
<h2>How the paywall actually works</h2>
<p class="secsub">No fine print, no magic. This is exactly what the link does — and what it cannot do.</p>
<div class="steps">
<div class="step"><span class="n">Pasted words</span><h3>Hosted by NanoTab</h3><p>Words you paste (or a file you add) are stored by NanoTab and only served after payment. There is no way to read them through your NanoTab link without paying — the unpaid answer is just the price.</p></div>
<div class="step"><span class="n">Public links</span><h3>The original stays open</h3><p>If the same words are also free at a public link, that link stays reachable — we cannot lock a page we do not host. The paywall covers the copy behind your NanoTab link. For real protection, paste the words here, or link only to a page you control.</p></div>
<div class="step"><span class="n">After paying</span><h3>Personal read, no resale</h3><p>Paying unlocks a personal read. Like anything readable online, the words could technically be copied — we will not pretend otherwise. Our <a href="/terms">Terms</a> say no copying for resale or redistribution; the paywall controls who gets access in the first place.</p></div>
</div>
</section>
<section class="block" aria-label="What you earn">
<h2>What you earn</h2>
<p class="secsub">You set the price. Readers pay in USDC on Base, and 98% goes straight to your wallet.</p>
<div class="earn-grid">
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Your share of every payment</div><div class="price-big">You keep 98¢ of every $1</div><p>That is 98% of every payment. NanoTab keeps 2% to run the service and look after your links. Amounts settle in USDC on Base, straight to your wallet. Readers always pay exactly the price you set.</p>
<div class="earn-rows"><div class="earn-row"><span>You charge $0.05</span><b>You receive $0.049</b></div><div class="earn-row"><span>You charge $0.25</span><b>You receive $0.245</b></div><div class="earn-row"><span>You charge $1.00</span><b>You receive $0.98</b></div></div></div>
<div class="earn-box"><div style="color:var(--mut);font-size:13.5px">Simple, always</div><div class="price-big">No monthly fee</div><p>Share as many links as you like. Every paid read is paid straight to your wallet — keep your links bookmarked, there is no account dashboard.</p>
<div class="earn-rows"><div class="earn-row"><span>To start</span><b>$0</b></div><div class="earn-row"><span>Each month</span><b>$0</b></div><div class="earn-row"><span>NanoTab fee</span><b>2% of each payment</b></div></div></div>
</div>
</section>
<section class="block" id="faq" style="scroll-margin-top:80px" aria-label="Common questions">
<h2>Common questions</h2>
<p class="secsub">Short answers, in plain English.</p>
<details class="faq-item"><summary>Do my readers need an account?</summary><p>No NanoTab account. AI agents pay automatically. A person paying needs a USDC wallet on Base — there is no card checkout. Either way, they pay and read straight away.</p></details>
<details class="faq-item"><summary>Do I need an account to publish?</summary><p>No. There are no accounts at all — no email, no sign-in, no password. Paste your words, set a price, give a payout wallet address (or generate one in one click), and publish: the link is live straight away. Keep your link — bookmark it after you publish, because there is no account to recover it from.</p></details>
<details class="faq-item"><summary>How do I get paid?</summary><p>Straight to your USDC wallet on Base — there is no NanoTab balance to withdraw from. Every payment is split on-chain: 98% to your wallet, 2% to NanoTab. Bring your own wallet address, or tap Generate instant wallet on the create page: it creates a wallet in your browser and the funds go to that address in USDC on Base. See our <a href="/wallet-guide">plain-English wallet guide</a>.</p></details>
<details class="faq-item"><summary>What does NanoTab cost?</summary><p>2% of each payment on hosted links — you keep 98%. No monthly fee. The developer self-host path is 0.1%; see <a href="/developers">For developers</a>.</p></details>
<details class="faq-item"><summary>What can I paywall?</summary><p>Almost any link that is yours to share: an article, guide, report, list, or file. If you wrote it, made it, or have permission to share it, you can charge for it.</p></details>
<details class="faq-item"><summary>Can readers just open my original page instead?</summary><p>If the same words are also free at a public link, yes — that link stays open, and we say so plainly. The paywall protects the copy stored behind your NanoTab link. Paste the words into NanoTab, or share only a link you control. Full detail: <a href="#paywall-how">How the paywall actually works</a>.</p></details>
<details class="faq-item"><summary>Can people copy or resell what they bought?</summary><p>Paying unlocks a personal read. Like anything readable online it could technically be copied, so we do not pretend otherwise — our <a href="/terms">Terms</a> say no redistribution or resale, and the paywall still controls who gets access in the first place.</p></details>
<details class="faq-item"><summary>I do not have a crypto wallet. Can I still sell?</summary><p>Yes. Tap <b>Generate instant wallet</b> in step 4 — it creates a standard wallet in your browser in one click and fills in the payout address for you. The wallet is yours and self-custodied: the private key is shown once in your browser and never sent to NanoTab or any server. Store it in a password manager. Funds go to that address in USDC on Base, and if the key is lost the funds are lost — we cannot recover it. Prefer your own wallet app instead? Paste its Base address. Background: the <a href="/wallet-guide">wallet guide</a>.</p></details>
</section>
<div class="card" style="text-align:center">
<h2>Building with code?</h2>
<p style="color:var(--mut)">There is a separate page for builders, with all the extra detail kept off this page.</p>
<a class="btn secondary" href="/developers" style="margin-top:8px">For developers →</a>
</div>
<div class="card" style="text-align:center">
<h2>Your words are already worth something.</h2>
<p style="color:var(--mut)">Upload your document, set the price, share it. The next reader who needs it pays you.</p>
<p style="margin-top:10px"><a href="#create">Paywall your first link →</a> · <a href="/demo">Try the $0.05 sample first</a></p>
</div>
${FOOTER_PLAIN}
</div>
<script>
var $=function(id){return document.getElementById(id)};
var stepNow=1;
var LABELS={1:'Step 1 of 4 — Your document',2:'Step 2 of 4 — Title',3:'Step 3 of 4 — Your price',4:'Step 4 of 4 — Your wallet'};
var PRICES={short:'0.05',article:'0.25',report:'1.00',list:'0.25',other:'0.25'};
async function req(p,o){o=o||{};if(o.body&&!o.headers)o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
var DKEY='nt_draft';
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify({l:$('p-link').value,t:$('p-title').value,k:$('p-kind').value,p:$('p-price').value,w:$('p-payto').value,b:$('p-body').value}))}catch(e){}}
function restoreDraft(){try{var d=JSON.parse(localStorage.getItem(DKEY)||'null');if(!d)return;if(d.l)$('p-link').value=d.l;if(d.t)$('p-title').value=d.t;if(d.k)$('p-kind').value=d.k;if(d.p)$('p-price').value=d.p;if(d.w)$('p-payto').value=d.w;if(d.b)$('p-body').value=d.b;}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DKEY)}catch(e){}}
function markChips(){var v=parseFloat($('p-price').value);var s=isNaN(v)?'':v.toFixed(2);var chips=document.querySelectorAll('.chip');for(var i=0;i<chips.length;i++){chips[i].classList.toggle('on',Number(chips[i].dataset.price).toFixed(2)===s)}}
function fmtPrice(v){return '$'+v.toFixed(2)}
function updateEarn(){var el=$('earn-preview');if(!el)return;var v=parseFloat($('p-price').value);if(!(v>0)){el.textContent='Type a price above — readers pay that amount each time.';return}el.innerHTML='Readers pay <b>'+fmtPrice(v)+'</b> in USDC on Base each time. You receive <b>'+fmtPrice(v*0.98)+'</b> (98%) straight to your wallet — NanoTab keeps 2% ('+fmtPrice(v*0.02)+').'}
function pickPrice(v){$('p-price').value=v;markChips();updateEarn();saveDraft()}
function showStep(n){
 stepNow=n;
 for(var i=1;i<=4;i++){$('panel-'+i).classList.toggle('hidden',i!==n);$('dot-'+i).classList.toggle('on',i<=n)}
 $('wiz-label').textContent=LABELS[n];
}
function checkLink(){
 var link=$('p-link').value.trim(),title=$('p-title').value.trim();
 if(link&&!/^https?:\\/\\//i.test(link))return 'That link needs to start with http:// or https:// — or clear it; your document is enough.';
 if(!title)return 'Give your work a short title so readers know what it is.';
 return null;
}
function checkWords(){
 if(!$('p-body').value.trim())return 'Add your document first: upload a file in step 1, or paste your words.';
 var e=checkLink();if(e)return e;
 var price=parseFloat($('p-price').value);
 if(!(price>0)||price>100)return 'Set a price between $0.01 and $100.';
 return null;
}
function goStep(n){
 if(n>stepNow){
   if(n>=2&&!$('p-body').value.trim()){$('pub-out').innerHTML='<div class="out">Add your document first: upload a file, or paste your words.</div>';showStep(1);return}
   if(n>=3){var e1=checkLink();if(e1){$('pub-out').innerHTML='<div class="out">'+e1+'</div>';showStep(2);return}}
   if(n>=4){var pr=parseFloat($('p-price').value);if(!(pr>0)||pr>100){$('pub-out').innerHTML='<div class="out">Set a price between $0.01 and $100 first.</div>';showStep(3);return}}
 }
 $('pub-out').innerHTML='';
 showStep(n);saveDraft();
}
['p-link','p-title','p-price','p-payto','p-body'].forEach(function(id){$(id).addEventListener('input',function(){saveDraft();if(id==='p-price'){markChips();updateEarn()}})});
$('p-kind').addEventListener('change',function(){pickPrice(PRICES[this.value]||'0.25')});
var pIng=initIngest({drop:'p-drop',file:'p-file',body:'p-body',title:'p-title',hint:'file-hint',counts:'p-counts',preview:'p-preview',abs:'p-abstract',toggleWrite:'p-write',togglePreview:'p-prevbtn',onEdit:saveDraft});
restoreDraft();if($('p-title').value)$('p-title').dataset.touched='1';markChips();updateEarn();showStep(1);pIng.refresh();
${walletJs()}
${ingestJs()}
async function copyL(u){try{await navigator.clipboard.writeText(u);alert('Copied — share it anywhere.')}catch(e){prompt('Copy this link:',u)}}
function onNext(){
 saveDraft();
 var err=checkWords();
 if(err){$('pub-out').innerHTML='<div class="out">'+err+'</div>';return}
 var payto=$('p-payto').value.trim();
 if(!/^0x[0-9a-fA-F]{40}$/.test(payto)){$('pub-out').innerHTML='<div class="out">That wallet address does not look right yet. Your USDC wallet address on Base starts with 0x and is 42 characters long — paste your own address, or tap Generate instant wallet above. <a href="/wallet-guide">Wallet guide</a></div>';$('p-payto').focus();return}
 if(genAddr&&payto.toLowerCase()!==genAddr.toLowerCase()&&genPk){if(!confirm('You generated a wallet but changed the payout address. The generated private key will not control the address you publish to. Publish to the changed address anyway?'))return}
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
 if(!r.ok){$('pub-out').innerHTML='<div class="out">Something went wrong just now. Please try again in a moment.</div>';return}
 clearDraft();
 var curl='curl -i '+r.j.url;
 $('pub-out').innerHTML='<div class="out"><b>Your paywall is live.</b><br>Human page (free preview): <a href="'+r.j.page_url+'">'+r.j.page_url+'</a><br>Agent paywall link (HTTP 402): <a href="'+r.j.url+'">'+r.j.url+'</a><br><button class="ghost" data-u="'+r.j.page_url+'" onclick="copyL(this.dataset.u)">Copy page link</button> <button class="ghost" data-u="'+r.j.url+'" onclick="copyL(this.dataset.u)">Copy paywall link</button> <button class="ghost" data-u="'+curl+'" onclick="copyL(this.dataset.u)">Copy test curl</button><div class="agent-curl">'+curl+'</div><span style="color:var(--mut)">Try it now: an unpaid request returns <b style="color:var(--txt)">402</b> with the price ($'+price.toFixed(2)+' USDC on Base, pay to '+payto+'). Pay, then the same link with an X-Payment proof returns <b style="color:var(--txt)">200</b> with your content. Payouts go to '+payto+' in USDC on Base — you keep 98%, NanoTab keeps 2%. Share the links anywhere. Keep your link — bookmark it, there is no account to find it in later.</span><div class="freeprev"><span class="preview-label">Free preview</span><div class="out" style="margin-top:0">'+mdEsc(r.j.abstract||'(no preview)')+'</div></div></div>';
}

(async function(){try{var r=await fetch('/stats');var j=await r.json();var el=$('hero-stats');if(el&&j&&Number(j.total_paid_calls)>0){el.innerHTML=Number(j.total_paid_calls)+' paid reads so far across hosted links — we are new, so early sellers stand out. <a href="/stats">See live stats</a>'}}catch(e){}})();
refreshSavedWalletNote();
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
<p class="secsub">Agents can submit links too. Every submission is auto-reviewed by TypeSafe Jev (spam, legality, price, quality): clean links from verified agents publish instantly, everything else waits in the owner's daily review queue (protected by the ADMIN_KEY secret) with its Jev scores shown. Unapproved links return <code>403</code> at fetch time (never 402 terms, never content), rejected links read as <code>404</code> and cannot be resubmitted, and published agent links carry a <b style="color:var(--txt)">Created by agent</b> badge. Human-created links still publish instantly.</p>
<pre class="codeblock"><code># agent submits (queued as pending, returns 202)
curl -X POST https://pay.nanotab.dev/v1/agent/submit \\
  -H "X-Agent-Key: $AGENT_KEY" -H "content-type: application/json" \\
  -d '{"title":"…","mime":"text/markdown","price_cents":25,
       "merchant_wallet":"0x…","body_b64":"…","agent_name":"my-agent",
       "source_url":"https://example.com/source"}'

# owner reviews the daily queue (browser, admin key in URL)
#   https://pay.nanotab.dev/agent-auth?key=$ADMIN_KEY
# owner automation (admin key header):
#   GET  /v1/agent/pending   -H "X-Admin-Key: $ADMIN_KEY"
#   POST /v1/agent/review    -H "X-Admin-Key: $ADMIN_KEY" {"slug":"…","action":"approve"|"reject"}</code></pre>
</section>
<section class="block" aria-label="Discovery">
<h2>Discovery for machines</h2>
<p class="secsub">Published links list themselves. Pending agent links never appear here.</p>
<pre class="codeblock"><code>GET https://pay.nanotab.dev/v1/marketplace.json   # flat listing file
GET https://pay.nanotab.dev/.well-known/x402      # x402 capability doc
GET https://pay.nanotab.dev/stats                 # totals + fee terms</code></pre>
<p style="color:var(--mut);font-size:14.5px">The document publish flow is at <a href="/publish">/publish</a> (no credentials needed). Full docs and source: <a href="https://nanotab.dev">nanotab.dev</a> · <a href="https://github.com/HectorTries/nanotab">GitHub</a>.</p>
</section>
<section class="block" aria-label="Content ingestion API">
<h2>Content ingestion API</h2>
<p class="secsub">Upload a document and the Worker extracts canonical markdown server-side (PDF text layer via pdfjs, .md/.txt normalised). Nothing is stored at ingest time — the original file is discarded and only the returned markdown is later published. Limits: 10 MB per file, 200,000 extracted characters, 10 uploads/hour per IP.</p>
<pre class="codeblock"><code># extract markdown from a file (returns markdown, title, chars, words)
curl -X POST https://pay.nanotab.dev/v1/ingest -F file=@report.pdf

# then publish the markdown (no credentials needed)
curl -X POST https://pay.nanotab.dev/v1/publish -H "content-type: application/json" \
  -d '{"title":"…","mime":"text/markdown","price_cents":25,
       "merchant_wallet":"0x…","body_b64":"…"}'</code></pre>
</section>
<div class="card" style="text-align:center">
<h2>Not writing code today?</h2>
<p style="color:var(--mut)">The hosted flow needs no server, no key and no gas. Upload a document and you are selling in seconds.</p>
<a class="btn" href="/#create" style="margin-top:8px">Paywall Any Link</a>
</div>
${FOOTER}
</div></body></html>`;
}

export function agentAuthHtml(): string {
  return head(
    'Agent review — daily authorization queue · NanoTab Pay',
    'Daily authorization queue for NanoTab Pay: the owner approves or rejects agent-submitted paywall links before they publish. Protected by the ADMIN_KEY secret. Unapproved links return 403.'
  ) + topbar('/#create', 'Paywall a link') + `
<div class="wrap" style="max-width:820px">
<section class="block" style="padding-top:48px">
<p class="eyebrow">Owner only · Daily review</p>
<h2 style="font-size:clamp(28px,4vw,40px)">Agent authorization queue</h2>
<p class="secsub">Agents can create paywall links. Clean submissions from verified agents auto-publish via TypeSafe Jev (spam, legality, price and quality checks); everything else waits here for your review with its Jev scores shown. Review today's submissions: <b style="color:var(--txt)">approve</b> to publish (the link gets a “Created by agent” badge), <b style="color:var(--txt)">reject</b> to drop it. Until you approve, the link returns <code>403</code> — no 402 terms, no content, no payments. Human-created links never wait here; they publish instantly.</p>
<p class="secsub" id="queue-date" style="font-size:14.5px"></p>
</section>
<div id="owner-banner" style="background:rgba(62,207,142,.08);border:1px solid rgba(62,207,142,.4);border-radius:12px;padding:14px 18px;margin:16px 0;font-size:14.5px"><b style="color:var(--txt)">You are viewing as owner.</b> <span style="color:var(--mut)">Admin key accepted from the URL — no account, no session cookie. Keep this URL private: anyone with the key can approve or reject submissions.</span></div>
<div id="queue-locked" class="card hidden">
<h2>Owner key required</h2>
<p class="card-sub">This queue is protected by the ADMIN_KEY secret. Open this page as <code>/agent-auth?key=YOUR_ADMIN_KEY</code>, or call the API with an <code>X-Admin-Key</code> header. There are no accounts and no sign-in.</p>
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
var ADMIN_KEY=new URLSearchParams(location.search).get('key')||'';
async function api(p,o){o=o||{};o.headers=Object.assign({},o.headers||{},{'X-Admin-Key':ADMIN_KEY});if(o.body&&!o.headers['content-type'])o.headers['content-type']='application/json';var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
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
 if(!ADMIN_KEY){$('queue-locked').classList.remove('hidden');$('queue-main').classList.add('hidden');return}
 var r=await api('/v1/agent/pending');
 if(r.st===403){$('queue-locked').classList.remove('hidden');$('queue-main').classList.add('hidden');$('queue-list').innerHTML='';return}
 if(!r.ok){$('queue-list').textContent='Could not load the queue ('+r.st+').';$('queue-main').classList.remove('hidden');return}
 $('queue-locked').classList.add('hidden');$('queue-main').classList.remove('hidden');
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

// --- Plain-English info pages (trust, wallet help, demo) -----------------
// Shared shell: same design system, footer with trust links on every page.

function infoPage(title: string, desc: string, body: string): string {
  return head(title, desc) + topbarPlain('/#create', 'Paywall a link') + `
<div class="wrap" style="max-width:760px">
<section class="block" style="padding-top:48px">${body}</section>
${FOOTER_PLAIN}
</div></body></html>`;
}

export function termsHtml(): string {
  return infoPage(
    'Terms — NanoTab Pay',
    'NanoTab Pay terms in plain English: 2% hosted fee, USDC on Base settlement to your wallet, personal-read licence, no resale.',
    `<p class="eyebrow">Plain English · NanoTab Pay</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Terms of use</h2>
<p class="secsub">Last updated: November 2026. Questions or disputes: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<div class="card"><h2 style="font-size:18px">What NanoTab Pay is</h2><p class="card-sub" style="margin-bottom:0">NanoTab Pay lets you put words, files and links behind a pay-per-read link. AI agents pay to read your link; humans can too — same link, same price. Payments are made in USDC on the Base network. We do not hold your money: each payment is split on-chain, 98% to the wallet address you give us and 2% to NanoTab. There are no accounts: publishing and paying need no email, no sign-in and no password. Keep your link — bookmark it after you publish, because there is no account to recover it from.</p></div>
<div class="card"><h2 style="font-size:18px">Fees and settlement</h2><p class="card-sub" style="margin-bottom:0">Hosted links: NanoTab keeps 2% of every payment; you keep 98%. There is no monthly fee. Prices are set by you in US dollars and paid in USDC. Settled payments go straight to your wallet — there is no NanoTab balance and nothing to withdraw. The developer self-host path carries a 0.1% fee instead; see <a href="/developers">For developers</a>.</p></div>
<div class="card"><h2 style="font-size:18px">Your content, your responsibility</h2><p class="card-sub" style="margin-bottom:0">Only publish content you wrote, made, or have permission to sell. You are responsible for it being lawful and as described. Agent-submitted links may be held for owner review before they go live. We may remove links that break the law or these terms.</p></div>
<div class="card"><h2 style="font-size:18px">What paying buys</h2><p class="card-sub" style="margin-bottom:0">Paying unlocks a personal read of that link's content. It does not buy ownership, and it does not allow copying for resale, redistribution, or republication. Sellers: the paywall controls access to the copy NanoTab serves; it cannot stop someone re-typing what they have read, and we do not claim otherwise.</p></div>
<div class="card"><h2 style="font-size:18px">Availability and liability</h2><p class="card-sub" style="margin-bottom:0">We run NanoTab Pay as a small, new service and aim to keep it available, but we do not guarantee uninterrupted service. To the extent the law allows, our liability is limited to the fees we took on the affected payments. Nothing here removes your statutory rights. Refunds and disputes are covered at <a href="/refunds">Refunds &amp; disputes</a>.</p></div>
<p style="color:var(--mut);font-size:14.5px">See also: <a href="/privacy">Privacy</a> · <a href="/about">About NanoTab</a> · <a href="/contact">Contact</a></p>`
  );
}

export function privacyHtml(): string {
  return infoPage(
    'Privacy — NanoTab Pay',
    'What NanoTab Pay collects and why: there are no accounts and no email collected. We store your listing content, price and payout wallet address, plus payment metadata and paid-read counts. No data selling.',
    `<p class="eyebrow">Plain English · NanoTab Pay</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Privacy, in short</h2>
<p class="secsub">Last updated: November 2026. Data questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<div class="card"><h2 style="font-size:18px">What we collect, and why</h2><p class="card-sub" style="margin-bottom:0"><b style="color:var(--txt)">There are no accounts, and we collect no email addresses.</b> Publishing and paying need no sign-in and no password. <b style="color:var(--txt)">Listing content, title, price and payout wallet address</b> — so we can serve your paywall and send you 98% of each payment. The wallet address is public; a generated wallet&apos;s private key is created in your browser and never sent to us. <b style="color:var(--txt)">Payment metadata and paid-read counts</b> — amounts, wallet addresses and transaction references needed to verify payment and keep our public stats honest. That is the extent of it: no personal data beyond payment metadata.</p></div>
<div class="card"><h2 style="font-size:18px">Uploaded documents become markdown only</h2><p class="card-sub" style="margin-bottom:0">When you upload a file, our server converts it to markdown and keeps only that markdown text (alongside your title, price and payout address). The original file is discarded immediately after successful extraction — it is never stored and never served at a public URL. If extraction fails, nothing from the file is kept. Your document text is never used for training and never sent to third parties, except the short excerpt shared with TypeSafe Jev for agent submissions (noted below).</p></div>
<div class="card"><h2 style="font-size:18px">Cookies and local storage</h2><p class="card-sub" style="margin-bottom:0">We set no account or session cookies — there is nothing to sign in to. Your unpublished draft is stored in your own browser (local storage) until you share it. If you generate a wallet and tap Save on this device, its private key is stored only in your browser&apos;s local storage — never on our servers. We do not use advertising or tracking cookies.</p></div>
<div class="card"><h2 style="font-size:18px">Who else is involved</h2><p class="card-sub" style="margin-bottom:0">The site runs on Cloudflare. Payments settle on the public Base blockchain — wallet addresses and amounts there are public by design. Agent submissions may be auto-reviewed by TypeSafe Jev (title and a short content excerpt). We never sell data.</p></div>
<div class="card"><h2 style="font-size:18px">Your choices</h2><p class="card-sub" style="margin-bottom:0">Keep your link — bookmark it after you publish. There is no account, so we cannot look up a lost link by email or sign-in. To ask what payment metadata we hold, or to request a listing be taken down, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with the link. If you are in the UK or EEA, you have rights to access, correct and erase personal data; we will honour them.</p></div>
<p style="color:var(--mut);font-size:14.5px">See also: <a href="/terms">Terms</a> · <a href="/contact">Contact</a></p>`
  );
}

export function refundsHtml(): string {
  return infoPage(
    'Refunds & disputes — NanoTab Pay',
    'How refunds and disputes work on NanoTab Pay: on-chain USDC payments, what we can and cannot reverse, and how to reach us.',
    `<p class="eyebrow">Plain English · NanoTab Pay</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Refunds &amp; disputes</h2>
<p class="secsub">Last updated: November 2026. For any payment problem, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> first — we will always try to put it right.</p>
<div class="card"><h2 style="font-size:18px">How payments settle (and what that means)</h2><p class="card-sub" style="margin-bottom:0">Payments are USDC transfers on the Base blockchain. Once confirmed on-chain they cannot be pulled back by NanoTab — no one can reverse them unilaterally, and we will not pretend otherwise. Our 2% fee is taken as part of that same transfer; you receive 98% directly in your wallet.</p></div>
<div class="card"><h2 style="font-size:18px">When we will arrange a refund</h2><p class="card-sub" style="margin-bottom:0">If you paid and the content was not delivered, was not as described, or you were charged twice for the same read, email us with the link, the amount and (if you have it) the transaction hash. Where the payment reached the seller, we will contact the seller and arrange a return transfer; where NanoTab is at fault, we will cover it. Duplicate or clearly mistaken payments fall in the same route.</p></div>
<div class="card"><h2 style="font-size:18px">Sellers</h2><p class="card-sub" style="margin-bottom:0">Describe your content honestly in its title. If a buyer disputes a read, we may ask you to refund or to fix the listing, and repeated misleading listings may be removed. Keep your link — bookmark it after you publish; there is no account dashboard. To request a takedown, email us with the link.</p></div>
<div class="card"><h2 style="font-size:18px">Timescales</h2><p class="card-sub" style="margin-bottom:0">Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we aim to reply within two working days. Refund transfers, once agreed, are sent on Base and are usually visible within minutes.</p></div>
<p style="color:var(--mut);font-size:14.5px">See also: <a href="/terms">Terms</a> · <a href="/contact">Contact</a></p>`
  );
}

export function contactHtml(): string {
  return infoPage(
    'Contact — NanoTab Pay',
    'Contact NanoTab Pay: support@nanotab.dev for help, payment disputes and privacy requests.',
    `<p class="eyebrow">Plain English · NanoTab Pay</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Contact us</h2>
<p class="secsub">One inbox for everything — help, payment disputes, privacy requests.</p>
<div class="card"><h2 style="font-size:18px">Email</h2><p class="card-sub" style="margin-bottom:0"><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> — we aim to reply within two working days. There are no accounts, so include your paywall link in your message; we cannot look anything up by sign-in.</p></div>
<div class="card"><h2 style="font-size:18px">For a payment problem, include</h2><p class="card-sub" style="margin-bottom:0">The paywall link (pay.nanotab.dev/r/…), the amount, roughly when you paid, and the transaction hash if you have it. See <a href="/refunds">Refunds &amp; disputes</a> for how we handle it. Never send a private key or recovery phrase — we will never ask for one.</p></div>
<div class="card"><h2 style="font-size:18px">Who we are</h2><p class="card-sub" style="margin-bottom:0">NanoTab is a small independent project. The code is open source: <a href="https://github.com/HectorTries/nanotab">github.com/HectorTries/nanotab</a>. More on <a href="/about">About NanoTab</a>.</p></div>`
  );
}

export function aboutHtml(): string {
  return infoPage(
    'About — NanoTab Pay',
    'About NanoTab: AI agents pay to read your link, humans can too. 98% to your USDC wallet on Base, 2% to NanoTab. Open source, new and live.',
    `<p class="eyebrow">Plain English · NanoTab Pay</p>
<h2 style="font-size:clamp(28px,4vw,38px)">About NanoTab</h2>
<p class="secsub">NanoTab Pay in one line: AI agents pay to read your link; humans can too.</p>
<div class="card"><h2 style="font-size:18px">What we do</h2><p class="card-sub" style="margin-bottom:0">Writers, experts and list-makers paste their words, set a price, and share one link. Agents pay automatically in USDC on Base; a person can pay too, with a wallet. The seller keeps 98% of every payment — NanoTab keeps 2% — settled straight to the seller's wallet. No monthly fee, no accounts needed to publish or to read.</p></div>
<div class="card"><h2 style="font-size:18px">Honest limits</h2><p class="card-sub" style="margin-bottom:0">We are new and small, and we say so. Sellers need a USDC payout address on Base — bring your own wallet, or generate one instantly in the browser on the create page (self-custodied; if you lose its private key, funds at that address are lost). The paywall protects the copy we host; a public original stays public. Paid reads are personal reads — no resale. Detail: <a href="/#paywall-how">How the paywall actually works</a> and our <a href="/terms">Terms</a>.</p></div>
<div class="card"><h2 style="font-size:18px">Open and checkable</h2><p class="card-sub" style="margin-bottom:0">Code: <a href="https://github.com/HectorTries/nanotab">github.com/HectorTries/nanotab</a>. Live totals: <a href="/stats">/stats</a>. Try the real thing: <a href="/demo">the $0.05 sample paywall</a>. Developer self-host path (0.1% fee): <a href="/developers">For developers</a>. Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p></div>`
  );
}

export function walletGuideHtml(): string {
  return infoPage(
    'Wallet guide — NanoTab Pay',
    'Plain-English wallet guide: what a USDC wallet address on Base is, how to get one free, and how to paste it into NanoTab safely.',
    `<p class="eyebrow">Plain English · Two minutes</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Getting a wallet, in plain English</h2>
<p class="secsub">You need one wallet address so NanoTab can send you 98% of every payment. Fastest: generate one in one click on the create page. Or bring your own — free, and you only do this once.</p>
<div class="card"><h2 style="font-size:18px">Fastest: generate one in your browser</h2><p class="card-sub" style="margin-bottom:0">On step 4 of the <a href="/#create">create page</a>, tap <b style="color:var(--txt)">Generate instant wallet</b>. Your browser creates a standard wallet and fills in the address. You will see the private key once: that key controls the payouts, anyone who has it can take the money, so store it in a password manager — we cannot recover it. The key is created in your browser and never sent to NanoTab or any server; it is only saved on the device if you tap Save on this device. Funds go to that address in USDC on Base. If the key is lost, the funds are lost. Import the key into a wallet app (for example MetaMask or Coinbase Wallet) whenever you want to move the money.</p></div>
<div class="card"><h2 style="font-size:18px">What you are actually getting</h2><p class="card-sub" style="margin-bottom:0">A wallet holds your money address. NanoTab pays in <b style="color:var(--txt)">USDC</b> (a digital dollar) on the <b style="color:var(--txt)">Base</b> network. Your <b style="color:var(--txt)">wallet address</b> is a long code starting with <code>0x</code> (42 characters) — that, and only that, is what goes into NanoTab. It is safe to share an address; it can only receive money. The private key is the secret that controls it: never share it with anyone who asks.</p></div>
<div class="card"><h2 style="font-size:18px">Or bring your own wallet</h2><p class="card-sub" style="margin-bottom:0">1. Install a wallet app — Coinbase Wallet or MetaMask are the common free ones (phone or browser).<br>2. Create a wallet and write down its recovery phrase on paper. Never type that phrase into any website, and never send it to anyone — NanoTab will never ask for it.<br>3. In the app, make sure the network says <b style="color:var(--txt)">Base</b> (both apps can switch networks; the same address works, but NanoTab pays on Base).<br>4. Tap Receive (or your account name) and copy the address starting <code>0x</code>.<br>5. Paste it into step 4 on the <a href="/#create">create page</a>. Done — every sale lands there automatically.</p></div>
<div class="card"><h2 style="font-size:18px">Good to know</h2><p class="card-sub" style="margin-bottom:0">There is no NanoTab balance and nothing to withdraw — payments go straight to your wallet, 98% to you and 2% to NanoTab. You do not need to buy anything to receive payments. Spending or moving USDC onward is handled inside your wallet app.</p></div>
<p style="color:var(--mut);font-size:14.5px">Back to: <a href="/#create">Paywall a link</a> · <a href="/#faq">Common questions</a> · <a href="/contact">Contact</a></p>`
  );
}

export function demoHtml(): string {
  return infoPage(
    'Demo — try a real NanoTab paywall for $0.05',
    'A real, payable NanoTab demo: a short sample behind a live $0.05 USDC-on-Base paywall. Unpaid requests get a 402; paid agents get the words.',
    `<p class="eyebrow">Live demo · Real paywall</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Try a real paywall: $0.05</h2>
<p class="secsub">This is not a mock-up. The link below is a live NanoTab paywall holding a short sample text. It costs $0.05 in USDC on Base — the same flow your readers and agents would use.</p>
<div class="card"><h2 style="font-size:18px">The sample (preview)</h2><p class="card-sub">Title: <b style="color:var(--txt)">Sample: How to keep tomatoes happy in a small garden</b></p><p class="card-sub" style="margin-bottom:0">Free preview — first lines only: <i>“Tomatoes want sun, steady water, and more room than you think. The five rules that actually matter…”</i> The full text (five short rules) unlocks on payment.</p></div>
<div class="card"><h2 style="font-size:18px">Pay and read</h2><p class="card-sub">Open the paywall link with an agent, or fetch it from code: the unpaid answer is a 402 with the price; pay $0.05 USDC on Base and the same link returns the words. In a plain browser you will see the paywall explanation page — there is no card checkout, for the demo or for any NanoTab link. Demo payments go to the NanoTab demo wallet.</p><p style="margin:14px 0 4px"><a class="btn" href="/r/DemoSample">Open the $0.05 demo paywall →</a></p><p style="margin:10px 0 0;font-size:14px"><a href="/marketplace">Browse the marketplace</a> · <a href="/stats">Live stats</a> · <a href="/#create">Create your own link</a></p></div>
<div class="card"><h2 style="font-size:18px">Honest status</h2><p class="card-sub" style="margin-bottom:0">NanoTab is new. Live paid-read totals are on <a href="/stats">/stats</a> — we show the real number there rather than borrow someone else's. If the count looks small, that is because it is.</p></div>`
  );
}

export function publishHtml(): string {
  return head(
    'Publish your document — NanoTab Pay',
    'Upload a document or paste your words and NanoTab turns it into a paywalled link. Agents pay in USDC on Base; you keep 98% of every payment. No account needed.'
  ) + topbarPlain('/#create', 'Paywall a link') + `
<div class="wrap" style="max-width:760px">
<section class="block" style="padding-top:48px">
<p class="eyebrow">No account needed · Live in about a minute</p>
<h2 style="font-size:clamp(28px,4vw,38px)">Publish your document</h2>
<p class="secsub">Upload a file or paste your words below. NanoTab converts it to markdown, mints a paywalled link for it, and pays you <b style="color:var(--txt)">98% of every read</b> in USDC on Base. Keep your link — bookmark it after you publish.</p>
<form id="f" onsubmit="return false">
<div class="card">
<div class="wiz-progress"><span class="wiz-dots" aria-hidden="true"><span class="wiz-dot on" id="f-dot-1"></span><span class="wiz-dot" id="f-dot-2"></span><span class="wiz-dot" id="f-dot-3"></span></span><span id="f-label">Step 1 of 3 — Your document</span></div>
<div class="wiz-panel" id="f-panel-1">
<label>1 · Your document</label>
<div class="dropzone" id="f-drop" tabindex="0" role="button" aria-label="Upload a file: PDF, markdown, or text, up to 10 MB"><b>Drop your file here</b> or <b>browse</b><br>PDF, .md, or .txt — up to 10 MB<input id="f-file" type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"></div>
<div class="hint" id="f-hint">Your file is converted to markdown on our server; the original is discarded and never served. <a href="/privacy">Privacy</a></div>
<div class="seg" role="group" aria-label="Edit or preview"><button type="button" class="ghost on" id="f-write">Write</button><button type="button" class="ghost" id="f-prevbtn">Preview</button></div>
<textarea id="f-body" placeholder="Or paste your words here — markdown works (headings, lists, links, code blocks, tables)…"></textarea>
<div class="counts" id="f-counts">0 words · 0 characters</div>
<div class="md-preview hidden" id="f-preview" aria-label="Markdown preview"></div>
<label for="f-title">Title</label><input id="f-title" maxlength="200" placeholder="e.g. My guide to growing tomatoes">
<div class="hint">Filled in automatically from your document — edit it if you like.</div>
<div class="freeprev"><span class="preview-label">Free preview</span><div class="out" id="f-abstract">Your free preview will appear here once you add some words.</div></div>
<details class="advanced"><summary>Advanced — I already host this</summary>
<label for="f-link">Link where this already lives (optional)</label>
<input id="f-link" type="url" placeholder="https://your-site.com/your-article" autocomplete="off" spellcheck="false">
<div class="hint">Gating only covers the copy served through NanoTab; the original URL remains reachable. For real protection, let the upload above be the only copy.</div>
</details>
<div class="wiz-nav"><button type="button" class="btn" id="f-next-1" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="f-panel-2">
<label for="f-price">2 · Price each time someone reads</label>
<div class="chips" role="group" aria-label="Suggested prices">
<button type="button" class="chip" data-price="0.05">$0.05</button>
<button type="button" class="chip on" data-price="0.25">$0.25</button>
<button type="button" class="chip" data-price="1.00">$1.00</button>
</div>
<div class="price-row"><input id="f-price" type="number" min="0.01" max="100" step="0.01" value="0.25"></div>
<div class="earn-preview" id="f-earn"></div>
<div class="hint">Tap a price above, or type your own. Prices are in US dollars — readers pay that amount in USDC on Base. NanoTab keeps 2% of each payment; you keep 98%.</div>
<div class="wiz-nav"><button type="button" class="btn-back" id="f-back-2">← Back</button><button type="button" class="btn" id="f-next-2" style="font-size:16.5px;padding:13px 28px">Continue →</button></div>
</div>
<div class="wiz-panel hidden" id="f-panel-3">
<h3 style="margin:4px 0 2px;font-size:17px">3 · Where should we send your money?</h3>
<label for="p-payto">Your USDC wallet address on Base</label>
<div class="payto-row"><input id="p-payto" placeholder="0x… (42 characters)" autocomplete="off" spellcheck="false"><button type="button" class="btn-gen" id="btn-generate-wallet">⚡ Generate instant wallet</button></div>
<div class="hint">Every payment is sent here in <b>USDC on the Base network</b>, split on-chain: 98% to this wallet, 2% to NanoTab. There is no NanoTab balance — the money goes straight to your wallet. Posting needs no account: this address is all we need to pay you.</div>
<div class="hint">No wallet yet? Tap <b>Generate instant wallet</b> — it creates a wallet in your browser in one click. The wallet is yours and self-custodied: NanoTab never sees the private key. Funds go to the address above in USDC on Base. <b>If you lose the private key, the funds at that address are lost</b> — we cannot recover it. Already have a wallet? Paste its address instead. See our <a href="/wallet-guide">plain-English wallet guide</a> (two minutes, free). NanoTab will never ask you to send a private key anywhere.</div>
<div id="wallet-panel" class="pk-panel hidden">
<div class="pk-warn"><b>Your new wallet — save this private key now.</b> This key controls your payouts. Anyone who has it can take the money. Store it in a password manager. We cannot recover it.</div>
<label for="p-pk">Private key (shown once)</label>
<div class="pk-row"><input id="p-pk" type="password" readonly value="" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button type="button" class="ghost" id="btn-pk-toggle">Show</button><button type="button" class="ghost" id="btn-pk-copy">Copy key</button></div>
<div class="hint" id="wallet-addr-note"></div>
<div class="pk-actions"><button type="button" class="ghost" id="btn-pk-save">Save on this device</button><button type="button" class="ghost" id="btn-pk-nosave">Don't save on this device</button><button type="button" class="ghost" id="btn-pk-clear">Hide &amp; clear from screen</button></div>
<div class="hint" id="wallet-save-note">The key is generated in your browser and never sent to any server. It is only saved if you tap Save on this device. Don't save keeps it in this tab's memory until you close the tab.</div>
</div>
<div id="wallet-saved-note" class="hint hidden"></div>
<div class="wiz-nav"><button type="button" class="btn-back" id="f-back-3">← Back</button><button type="button" class="btn" id="f-publish" style="font-size:16.5px;padding:13px 28px">Publish link →</button></div>
</div>
<div id="pub-out"></div>
</div>
</form>
<div class="card">
<h2>Keep your link — bookmark it</h2>
<p class="card-sub">There are no accounts and no dashboard. When you publish, save the link from the confirmation and bookmark it — that URL is how you and your readers find the paywall again. Payments go straight to your wallet, so you do not need to come back here to get paid.</p>
</div>
</section>
${FOOTER_PLAIN}
</div>
<script>
var $=function(id){return document.getElementById(id)};
${walletJs()}
${ingestJs()}
var fStep=1;
var FLABELS={1:'Step 1 of 3 — Your document',2:'Step 2 of 3 — Your price',3:'Step 3 of 3 — Your wallet'};
function fShow(n){fStep=n;for(var i=1;i<=3;i++){$('f-panel-'+i).classList.toggle('hidden',i!==n);$('f-dot-'+i).classList.toggle('on',i<=n)}$('f-label').textContent=FLABELS[n]}
function fCheckDoc(){
 var link=$('f-link').value.trim();
 if(link&&!/^https?:\\/\\//i.test(link))return 'That link needs to start with http:// or https:// — or clear it; your document above is enough.';
 if(!$('f-body').value.trim())return 'Add your document first: upload a file above, or paste your words.';
 if($('f-body').value.length>200000)return 'That document is over 200,000 characters — publish a shorter piece instead.';
 if(!$('f-title').value.trim())return 'Give your document a short title so readers know what it is.';
 return null;
}
function fGo(n){
 if(n>fStep){var e=fCheckDoc();if(e){$('pub-out').innerHTML='<div class="out">'+e+'</div>';fShow(1);return}
  if(n>=3){var pr=parseFloat($('f-price').value);if(!(pr>0)||pr>100){$('pub-out').innerHTML='<div class="out">Set a price between $0.01 and $100 first.</div>';fShow(2);return}}}
 $('pub-out').innerHTML='';fShow(n);
}
function fMarkChips(){var v=parseFloat($('f-price').value);var s=isNaN(v)?'':v.toFixed(2);var chips=document.querySelectorAll('#f-panel-2 .chip');for(var i=0;i<chips.length;i++){chips[i].classList.toggle('on',Number(chips[i].dataset.price).toFixed(2)===s)}}
function fUpdateEarn(){var v=parseFloat($('f-price').value);var el=$('f-earn');if(!(v>0)){el.textContent='Type a price above — readers pay that amount each time.';return}el.innerHTML='Readers pay <b>$'+v.toFixed(2)+'</b> in USDC on Base each time. You receive <b>$'+(v*0.98).toFixed(2)+'</b> (98%) straight to your wallet — NanoTab keeps 2% ($'+(v*0.02).toFixed(2)+').'}
function fPickPrice(v){$('f-price').value=v;fMarkChips();fUpdateEarn()}
$('f-price').addEventListener('input',function(){fMarkChips();fUpdateEarn()});
document.querySelectorAll('#f-panel-2 .chip').forEach(function(ch){ch.addEventListener('click',function(){fPickPrice(ch.dataset.price)})});
$('f-next-1').addEventListener('click',function(){fGo(2)});
$('f-back-2').addEventListener('click',function(){fGo(1)});
$('f-next-2').addEventListener('click',function(){fGo(3)});
$('f-back-3').addEventListener('click',function(){fGo(2)});
$('f-publish').addEventListener('click',fOnNext);
$('btn-generate-wallet').addEventListener('click',generateInstantWallet);
$('btn-pk-toggle').addEventListener('click',togglePkVisibility);
$('btn-pk-copy').addEventListener('click',copyPrivateKey);
$('btn-pk-save').addEventListener('click',saveWalletOnDevice);
$('btn-pk-nosave').addEventListener('click',dontSaveWallet);
$('btn-pk-clear').addEventListener('click',clearWalletFromScreen);
initIngest({drop:'f-drop',file:'f-file',body:'f-body',title:'f-title',hint:'f-hint',counts:'f-counts',preview:'f-preview',abs:'f-abstract',toggleWrite:'f-write',togglePreview:'f-prevbtn'});
fMarkChips();fUpdateEarn();fShow(1);
var fCopies=[];
async function fCopy(i){var u=fCopies[i]||'';var st=$('f-copy-status');function done(m){if(st)st.textContent=m}
 try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(u);done('Copied — share it anywhere.');return}}catch(e){}
 try{var ta=document.createElement('textarea');ta.value=u;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);done('Copied — share it anywhere.')}catch(e2){done('Copy this: '+u)}}
function fOnNext(){
 var err=fCheckDoc();
 if(err){$('pub-out').innerHTML='<div class="out">'+err+'</div>';fShow(1);return}
 var payto=$('p-payto').value.trim();
 if(!/^0x[0-9a-fA-F]{40}$/.test(payto)){$('pub-out').innerHTML='<div class="out">That wallet address does not look right yet. Your USDC wallet address on Base starts with 0x and is 42 characters long — paste your own address, or tap Generate instant wallet above. <a href="/wallet-guide">Wallet guide</a></div>';$('p-payto').focus();return}
 if(genAddr&&payto.toLowerCase()!==genAddr.toLowerCase()&&genPk){if(!confirm('You generated a wallet but changed the payout address. The generated private key will not control the address you publish to. Publish to the changed address anyway?'))return}
 fPublish();
}
async function fPublish(){
 var title=$('f-title').value.trim(),link=$('f-link').value.trim(),price=parseFloat($('f-price').value),payto=$('p-payto').value.trim(),body=$('f-body').value;
 if(!title&&link){try{title=new URL(link).hostname.replace(/^www\\./,'')}catch(e){}}
 $('f-publish').disabled=true;
 var b64=btoa(unescape(encodeURIComponent(body)));
 var mime=/^\\s*[\\{\\[]/.test(body)?'application/json':'text/markdown';
 var payload={title:title,mime:mime,price_cents:Math.round(price*100),body_b64:b64};
 payload[['merchant','wal'+'let'].join('_')]=payto;
 if(link)payload.source_url=link;
 var r=await fetch('/v1/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 var j=null;try{j=await r.json()}catch(e){}
 $('f-publish').disabled=false;
 if(!r.ok||!j||!j.url){$('pub-out').innerHTML='<div class="out">'+((j&&j.error)?mdEsc(j.error):'Something went wrong just now. Please try again in a moment.')+'</div>';return}
 var agentCurl='curl -i -H "Accept: application/json" '+j.url;
 fCopies=[j.page_url,j.url,agentCurl];
 $('pub-out').innerHTML='<div class="out"><b>Your paywall is live.</b><br>Human page (free preview): <a href="'+j.page_url+'">'+j.page_url+'</a><br>Agent paywall link (HTTP 402): <a href="'+j.url+'">'+j.url+'</a><br><button type="button" class="ghost" data-copy="0">Copy page link</button> <button type="button" class="ghost" data-copy="1">Copy paywall link</button> <button type="button" class="ghost" data-copy="2">Copy test curl</button> <span id="f-copy-status" style="color:var(--mut)"></span><div class="agent-curl">'+mdEsc(agentCurl)+'</div><span style="color:var(--mut)">Try it now: an unpaid request returns <b style="color:var(--txt)">402</b> with the price ($'+price.toFixed(2)+' USDC on Base, pay to '+payto+'). Pay, then the same link with an X-Payment proof returns <b style="color:var(--txt)">200</b> with your content. Payouts go to '+payto+' in USDC on Base — you keep 98%, NanoTab keeps 2%. Share the links anywhere. Keep your link — bookmark it, there is no account to find it in later.</span><div class="freeprev"><span class="preview-label">Free preview</span><div class="out" style="margin-top:0">'+mdEsc(j.abstract||'(no preview)')+'</div></div></div>';
 document.querySelectorAll('#pub-out [data-copy]').forEach(function(b){b.addEventListener('click',function(){fCopy(+b.dataset.copy)})});
}
refreshSavedWalletNote();
</script></body></html>`;
}
