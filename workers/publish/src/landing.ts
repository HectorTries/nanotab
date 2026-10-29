export function landingHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NanoTab Pay \u2014 sign in, paste content, get a paywall link</title>
<style>
:root{--bg:#0a0e14;--panel:#111722;--line:#1f2a3d;--txt:#e8eef7;--mut:#8fa0b8;--acc:#4ade80;--acc2:#22d3ee}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--acc2)}
.wrap{max-width:860px;margin:0 auto;padding:0 20px}
.hero{padding:72px 0 40px;text-align:center}
.badge{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:4px 14px;font-size:13px;color:var(--mut);margin-bottom:18px}
.hero h1{font-size:clamp(32px,6vw,54px);line-height:1.1;margin:0 0 14px}
.hero h1 .g{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--mut);max-width:600px;margin:0 auto 26px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;margin:18px 0;position:relative}
.card h2{margin:0 0 12px;font-size:20px}
.card.step1{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 32px rgba(74,222,128,.15)}
.step1-tag{display:inline-block;background:linear-gradient(90deg,var(--acc),var(--acc2));color:#04120a;font-weight:700;font-size:12px;border-radius:6px;padding:2px 10px;margin-left:8px;vertical-align:middle}
label{display:block;margin:10px 0 4px;color:var(--mut);font-size:14px}
input,textarea{width:100%;background:#0b111c;border:1px solid var(--line);border-radius:8px;color:var(--txt);padding:10px 12px;font-size:15px}
textarea{font-family:ui-monospace,monospace;min-height:140px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.row{grid-template-columns:1fr}}
button{background:linear-gradient(90deg,var(--acc),var(--acc2));border:0;border-radius:10px;color:#04120a;font-weight:700;font-size:16px;padding:12px 22px;cursor:pointer;margin-top:14px}
button:disabled{opacity:.5;cursor:wait}
button.ghost{background:none;border:1px solid var(--line);color:var(--txt);font-weight:400;font-size:14px;padding:8px 14px;margin:4px 6px 0 0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
@media(max-width:560px){.steps{grid-template-columns:1fr}}
.step{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;font-size:14px}
.step .n{display:block;font-size:24px;margin-bottom:6px}
.out{background:#0b111c;border:1px solid var(--line);border-radius:8px;padding:12px;margin-top:12px;word-break:break-all;font-size:14px}
.devlink{border:1px solid var(--acc);background:rgba(74,222,128,.08);border-radius:8px;padding:12px;margin-top:12px;font-size:14px}
.item{border-top:1px solid var(--line);padding:12px 0;font-size:14px}
.item .t{font-weight:600}
.item .m{color:var(--mut)}
footer{color:var(--mut);font-size:13px;text-align:center;padding:36px 0}
code{background:#0b111c;padding:2px 6px;border-radius:6px;font-size:13px}
.demo{font-family:ui-monospace,monospace;font-size:13px;text-align:left;white-space:pre-wrap}
.hidden{display:none}
/* locked publish form */
#pub-fields{transition:opacity .2s}
#pub-fields.locked{opacity:.45;pointer-events:none;filter:grayscale(.6)}
#pub-lock{display:flex;align-items:center;gap:10px;background:rgba(11,17,28,.92);border:1px dashed var(--acc);border-radius:10px;padding:14px 16px;margin-top:12px;font-size:15px}
#pub-lock.hidden{display:none}
</style></head><body>
<div class="wrap">
<div class="hero">
<div class="badge">\u26a1 USDC on Base \u00b7 x402 \u00b7 live</div>
<h1>Sign in. Paste content.<br><span class="g">Get a paywall link.</span></h1>
<p>Turn any markdown, data or prompt into a pay-per-view link in one click. Buyers pay USDC on Base \u2014 straight to your wallet. You keep <b>98%</b> (2% NanoTab fee). Sign in with email first \u2014 your draft is saved automatically.</p>
</div>
<div class="card step1" id="auth-card">
<h2>Step 1 \u00b7 Sign in<span class="step1-tag">START HERE</span></h2>
<div id="auth-out">
<label>email</label>
<input id="email" type="email" placeholder="you@example.com" autocomplete="email">
<button id="btn-login" onclick="requestLink()">Email me a sign-in link</button>
<div id="login-msg" class="out hidden"></div>
</div>
<div id="auth-in" class="hidden">
<div>\u2705 Signed in as <b id="who"></b> \u2014 <button class="ghost" onclick="refreshDash()">refresh dashboard</button></div>
</div>
</div>
<div class="card" id="pub-card">
<h2>Step 2 \u00b7 Publish a paywall</h2>
<div id="pub-fields" class="locked">
<label>title</label><input id="p-title" maxlength="200" placeholder="My premium prompt pack">
<div class="row"><div><label>price (USD)</label><input id="p-price" type="number" min="0.01" max="100" step="0.01" value="1.00"></div>
<div><label>your USDC wallet (Base)</label><input id="p-wallet" placeholder="0x..."></div></div>
<label>content (markdown / text / JSON)</label><textarea id="p-body" placeholder="# Hello agents&#10;&#10;Pay $1 to read this..."></textarea>
<button id="btn-pub" onclick="publish()">Publish paywall link</button>
<div id="pub-out"></div>
</div>
<div id="pub-lock">🔒 <span><b>Sign in to create a paywall link</b> \u2014 anything you paste is auto-saved and restored after login.</span></div>
</div>
<div class="card hidden" id="dash-card">
<h2>Step 3 \u00b7 My links</h2>
<div id="dash-list"><i>loading...</i></div>
</div>
<div class="card">
<h2>How it works</h2>
<div class="steps">
<div class="step"><span class="n">1\uFE0F\u20E3</span><b>Sign in.</b> Email magic link, no password. Your draft is preserved across login.</div>
<div class="step"><span class="n">2\uFE0F\u20E3</span><b>Paste &amp; price.</b> Set a USD price and your Base wallet, get a <code>pay.nanotab.dev/r/...</code> link. Unpaid visits get HTTP 402 with x402 payment terms.</div>
<div class="step"><span class="n">3\uFE0F\u20E3</span><b>Get paid.</b> Agents pay USDC on Base \u2014 funds go straight to your wallet minus the 2% fee. Track paid calls below.</div>
</div>
</div>
<div class="card">
<h2>Live demo</h2>
<p style="color:var(--mut);font-size:14px">Unpaid request to a paywalled link returns <code>402 Payment Required</code> with machine-readable x402 terms \u2014 try it:</p>
<div class="out demo" id="demo-out">loading demo...</div>
</div>
<div class="card">
<h2>Pricing</h2>
<p>Flat <b>2%</b> per paid call. No monthly fee, no setup fee, no gas (Circle paymaster covers it). Buyer pays exactly the listed price in USDC on Base; you receive 98% instantly on-chain.</p>
</div>
<div class="card" style="text-align:center">
<h2>Ready?</h2>
<p style="color:var(--mut)">Sign in above, paste your content, share your link.</p>
<button onclick="document.getElementById('auth-card').scrollIntoView({behavior:'smooth'})">Start now \u2014 free</button>
</div>
<footer>NanoTab Pay \u00b7 <a href="https://nanotab.dev">nanotab.dev</a> \u00b7 <a href="/stats">stats</a> \u00b7 <a href="/v1/marketplace.json">marketplace</a> \u00b7 USDC on Base via x402</footer>
</div>
<script>
var $=function(id){return document.getElementById(id)};
async function api(p,o){o=o||{};o.credentials='include';o.headers={'content-type':'application/json'};var r=await fetch(p,o);var j=null;try{j=await r.json()}catch(e){}return{ok:r.ok,st:r.status,j:j}}
// --- draft persistence (survives login redirect) ---
var DKEY='nt_draft';
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify({t:$('p-title').value,p:$('p-price').value,w:$('p-wallet').value,b:$('p-body').value}))}catch(e){}}
function restoreDraft(){try{var d=JSON.parse(localStorage.getItem(DKEY)||'null');if(!d)return;if(d.t)$('p-title').value=d.t;if(d.p)$('p-price').value=d.p;if(d.w)$('p-wallet').value=d.w;if(d.b)$('p-body').value=d.b;}catch(e){}}
function clearDraft(){try{localStorage.removeItem(DKEY)}catch(e){}}
['p-title','p-price','p-wallet','p-body'].forEach(function(id){$(id).addEventListener('input',saveDraft)});
restoreDraft();
function unlockForm(){$('pub-fields').classList.remove('locked');$('pub-lock').classList.add('hidden')}
function lockForm(){$('pub-fields').classList.add('locked');$('pub-lock').classList.remove('hidden')}
async function requestLink(){
 var email=$('email').value.trim();if(!email)return;
 saveDraft();
 $('btn-login').disabled=true;$('login-msg').classList.remove('hidden');
 $('login-msg').textContent='sending...';
 var r=await api('/v1/auth/request',{method:'POST',body:JSON.stringify({email:email})});
 $('btn-login').disabled=false;
 if(!r.ok){$('login-msg').textContent='error: '+((r.j&&r.j.error)||r.st);return}
 if(r.j.emailed){$('login-msg').textContent='\u2709\uFE0F check your inbox \u2014 link expires in 15 min. Your draft is saved and will be here after you sign in.'}
 else{$('login-msg').innerHTML='<b>\u26a0\uFE0F dev mode: email not configured \u2014 click to sign in:</b><br><a href="'+r.j.link+'">'+r.j.link+'</a><br><span style="color:var(--mut)">Your draft is saved and will be restored after login.</span>'}
}
async function checkSession(){
 var r=await api('/v1/listings');
 if(r.ok){unlockForm();$('auth-out').classList.add('hidden');$('auth-in').classList.remove('hidden');$('dash-card').classList.remove('hidden');restoreDraft();renderDash(r.j)}
 else{lockForm()}
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function renderDash(items){
 if(!items.length){$('dash-list').innerHTML='<i>No links yet \u2014 publish your first above.</i>';return}
 $('dash-list').innerHTML=items.map(function(l){return '<div class="item"><div class="t">'+esc(l.title)+' \u2014 $'+l.price_usd+'</div><div class="m"><a href="'+l.url+'">'+l.url+'</a> \u00b7 '+l.paid_calls+' paid calls \u00b7 '+l.created_at.slice(0,10)+'</div><button class="ghost" onclick="copyL(\''+l.url+'\')">copy link</button><button class="ghost" onclick="delL(\''+l.slug+'\')">delete</button></div>'}).join('');
}
async function refreshDash(){var r=await api('/v1/listings');if(r.ok)renderDash(r.j)}
async function copyL(u){try{await navigator.clipboard.writeText(u);alert('copied')}catch(e){prompt('copy:',u)}}
async function delL(slug){if(!confirm('delete '+slug+'?'))return;var r=await fetch('/v1/listings/'+slug,{method:'DELETE',credentials:'include'});if(r.ok)refreshDash();else alert('delete failed')}
async function publish(){
 var title=$('p-title').value.trim(),price=parseFloat($('p-price').value),wallet=$('p-wallet').value.trim(),body=$('p-body').value;
 if(!title||!(price>0)||!/^0x[0-9a-fA-F]{40}$/.test(wallet)||!body){$('pub-out').innerHTML='<div class="out">fill every field (wallet = 0x + 40 hex).</div>';return}
 $('btn-pub').disabled=true;
 var b64=btoa(unescape(encodeURIComponent(body)));
 var mime=/^\\s*\\{/.test(body)?'application/json':'text/markdown';
 var r=await api('/v1/publish',{method:'POST',body:JSON.stringify({title:title,mime:mime,price_cents:Math.round(price*100),merchant_wallet:wallet,body_b64:b64})});
 $('btn-pub').disabled=false;
 if(!r.ok){if(r.st===401){lockForm();$('pub-out').innerHTML='<div class="out">session expired \u2014 sign in above first (your draft is saved).</div>';saveDraft()}else{$('pub-out').innerHTML='<div class="out">error '+((r.j&&r.j.error)||r.st)+'</div>'}return}
 clearDraft();
 $('pub-out').innerHTML='<div class="out">\u2705 live: <a href="'+r.j.url+'">'+r.j.url+'</a><br><button class="ghost" onclick="copyL(\''+r.j.url+'\')">copy link</button> <span style="color:var(--mut)">unpaid visits get 402 + x402 terms</span></div>';
 refreshDash();
}
checkSession();
(function(){fetch('/v1/marketplace.json').then(function(r){return r.json()}).then(function(d){
 if(d.length){var l=d[0];fetch(l.url).then(function(r){return r.json().then(function(b){return{st:r.status,b:b}})}).then(function(x){
  var a=x.b.accepts&&x.b.accepts[0];var show=a?{amount:a.amount,asset:'USDC',payTo:a.payTo,fee:a.fee}:x.b;
  $('demo-out').textContent='GET '+l.url+'\\n\\u2192 '+x.st+(x.st===402?' Payment Required':'')+'\\n'+JSON.stringify(show,null,1).slice(0,600);
 })} else $('demo-out').textContent='No listings yet \u2014 sign in and publish the first one above.';
}).catch(function(){$('demo-out').textContent='demo unavailable'})})();
</script></body></html>`;
}
