# My AI Agent Had a Credit Card Problem. So I Built Stripe for Agents.

Last Tuesday, my agent needed a $0.05 API call.

It had the URL. It had the parameters. It had the permission.

What it didn't have was a way to pay.

No login form to fill out. No "enter your email for an API key" it could complete. No Stripe checkout it could click through. It just... sat there. A brilliant, autonomous piece of software, blocked by a payment flow designed in 2011 for humans with browsers.

That's when it hit me: **the entire internet's payment infrastructure assumes a human with a credit card.** And we just built a generation of software that has neither.

---

## The problem nobody talks about

We've spent two years making agents smarter. They can reason, plan, use tools, browse the web. But ask one to *buy something* — a real API call, a dataset lookup, a GPU inference minute — and the whole thing falls apart.

Here's what "paying for an API" looks like today if you're an agent:

1. Stop what you're doing
2. Ask your human to go sign up for an account
3. Wait for them to paste in an API key
4. Hope the key has enough credits
5. Repeat for every single API you need

That's not autonomy. That's a toddler asking for lunch money.

Subscriptions are worse. Why would an agent that needs *one* weather lookup pay $20/month? Why would a research agent that makes 14 different API calls maintain 14 accounts, 14 keys, 14 billing relationships?

The unit of work for agents is **the single call**. The unit of billing should be too.

## The insight: payments already solved this — for machines

I kept coming back to one question: what would payments look like if they were designed for software, not people?

The answer turned out to be embarrassingly simple. Agents already have wallets. Blockchains already settle in seconds for fractions of a cent. Stablecoins already hold their value. The rails exist — nobody had just wrapped them in a developer experience that doesn't suck.

That's NanoTab. **[nanotab.dev](https://nanotab.dev)** — pay-per-call API payments in USDC on Base. Agents pay per call. No subscriptions. No API keys. No signup forms.

"Stripe for AI agents" sounds like a pitch-deck cliché. But it's literally what this is: sell your API to agents in one prompt, or buy API calls with a wallet and zero onboarding.

## How it works (the 60-second version)

There are two sides. Both are stupidly simple.

**If you sell an API:** you drop NanoTab's merchant middleware in front of your endpoint. One prompt, basically — "add pay-per-call at $0.05 to my Express route." Now every call to that endpoint requires a USDC micropayment on Base before it executes. You set the price. You get paid instantly. No accounts, no keys, no invoicing.

**If you build agents:** your agent uses the NanoTab SDK. When it hits a paid endpoint, the SDK handles payment automatically — signs, pays, retries with proof, gets the data back. Your agent never touches a signup page. It just... pays, like a grown-up.

Under the hood, a few things make this actually work instead of being another crypto demo:

- **0.1% self-host fee (2% via the managed gateway).** Not 2.9% + 30¢ (which would be hilarious on a 5-cent transaction — you'd pay more in fees than the call costs).
- **Atomic single-UserOp split.** Payment to you and fee to the protocol happen in one transaction. No escrow, no settlement delay, no trust-me-bro.
- **EIP-7702 + Circle paymaster.** Your agent needs exactly 0 ETH. Gas is sponsored. It just holds USDC and spends it.
- **Full stack, not a whitepaper.** Merchant middleware, agent SDK, an MCP server (so Claude Desktop and any MCP client can pay natively), a gateway paywall for putting any URL behind payments, and even a WordPress plugin — because half the internet's content still lives on WordPress.

No hype. Just plumbing that works.

## Receipts, not promises

I'm allergic to launch posts that say "revolutionary" twelve times and show zero evidence. So here's what actually happened in our first week — pre-marketing, no launch, just putting the repos public:

- **372 GitHub clones from 149 unique developers.** People found it, cloned it, poked at it. Without me asking.
- **~500 npm downloads.** `@nanotab/agent-sdk` at 468 downloads, `@nanotab/merchant` at 32. And `@nanotab/mcp-server` just shipped v0.1.1.
- **Real money moved on Base mainnet.** Not testnet. Not a mock. Actual $0.05 and $0.01 paid calls — merchant got paid, gateway returned 200s, settlement confirmed on-chain.

Five cents. That's the whole point. When a transaction costs a fraction of a cent to process, you can charge five cents for an API call and *everybody still wins*. Try that with Stripe.

Is this world-changing traction? No. It's week one. But it's *real* — real developers pulling real code and real USDC changing hands for real API calls. I'd rather show you a $0.05 mainnet receipt than a $50M vision deck.

## How to start selling in one prompt

This is the part I obsessed over. Selling your API to agents should be *easier* than signing up for Stripe. Here's the actual flow:

**1. Install the middleware.**

```bash
npm install @nanotab/merchant
```

**2. Wrap your route.**

```typescript
import { paywall } from '@nanotab/merchant';

app.get('/api/summary',
  paywall({ price: '0.05', asset: 'USDC' }),
  yourHandler
);
```

**3. That's it.** Your endpoint now charges $0.05 USDC per call on Base. Any agent with the SDK (or any MCP client with our server) can discover the price, pay, and get data — no emails, no keys, no dashboard you have to build.

Set any price you want. A penny for a lookup. A dollar for GPU inference. A tenth of a cent for high-volume data. The economics finally work at every scale because the fee is 0.1% self-host (2% managed gateway), not 30 cents flat.

If you run WordPress, there's a plugin. If you want to paywall an existing URL without touching code, there's a gateway. Full docs at **[nanotab.dev](https://nanotab.dev)**.

## How to buy (if your agent needs data)

Flip side. Your agent needs a paid API. Here's what that looks like:

```bash
npm install @nanotab/agent-sdk
```

```typescript
import { paidFetch } from '@nanotab/agent-sdk';

// Pays automatically. Returns the data.
const data = await paidFetch('https://api.example.com/summary');
```

No signup. No API key. No "contact sales for agent access" (kill me). The SDK sees the 402, pays from the agent's USDC balance, retries with proof, returns the response. Three lines and your agent can buy anything on the network.

Or if you're in MCP land — Claude Desktop, Cursor, any MCP-compatible client — install `@nanotab/mcp-server` and your assistant can pay for API calls mid-conversation. That's the one I'm most excited about, honestly. The moment your AI assistant can *spend fifty cents to get you a better answer* without asking you to go sign up somewhere, the whole game changes.

## Where this goes

Here's what I actually believe, stripped of pitch language:

Right now, every agent framework has a tools problem. You wire up a dozen APIs by hand, manage a dozen keys, and pray nothing rotates. It's fragile, manual, unscalable.

The end state is obvious: **agents discover and pay for capabilities the way browsers resolve DNS — automatically, invisibly, per-use.** You don't "integrate" an API. Your agent finds it, sees the price, pays, uses it, moves on. The best API for the job wins each individual call, not each annual contract.

That world needs three things: a payment rail (USDC on Base — done), a protocol both sides speak (x402-style pay-per-call — done), and a reason for API owners to bother (money with zero integration cost — that's the one-prompt sell).

We're early. The network is small. Most APIs aren't pay-per-call yet. But every developer who wraps an endpoint and every agent that pays for a call makes the next one easier. Marketplaces start this way — one seller, one buyer, one five-cent transaction at a time.

---

## The ask

If you run an API — any API, side project or production — try putting a price on one endpoint. It takes five minutes. If it works, you just opened a revenue channel from every agent on the internet, no sales calls required.

If you build agents, give your agent a wallet and let it buy something. Watch it pay $0.05 for data without human intervention. It's a small moment that feels like the future arriving early.

Everything's at **[nanotab.dev](https://nanotab.dev)**. Code's public. Docs are short. Prices start at a penny.

My agent doesn't ask for lunch money anymore. Yours shouldn't either.
