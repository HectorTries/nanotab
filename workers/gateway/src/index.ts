// NanoTab gateway worker — paywalls ANY origin API with x402-style 402s.
// Zero code changes on merchant side: proxy + 402 challenge + mock verify.
//
// ⚠️ MVP: payment verification is MOCKED (same as @nanotab/merchant).
// Well-formed X-Payment header + matching to/amount passes. No chain lookup.

export interface Env {
  ORIGIN_URL: string;        // e.g. https://api.theirsite.com (no trailing slash)
  PRICE_USD_CENTS: string;   // e.g. "2" = $0.02/call
  MERCHANT_WALLET: string;   // 0x…
  NANOTAB_FEE_BPS?: string;  // e.g. "50" = 0.5% (default 50)
  NETWORK?: string;          // default base-sepolia
  ASSET?: string;            // default USDC
}

interface PaymentProof {
  amount: string;
  to: string;
  asset: string;
  network?: string;
  signature: string;
  from?: string;
}

function challenge(req: Request, env: Env): Response {
  const network = env.NETWORK ?? 'base-sepolia';
  const asset = env.ASSET ?? 'USDC';
  return Response.json(
    {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network,
          maxAmountRequired: env.PRICE_USD_CENTS,
          resource: req.url,
          payTo: env.MERCHANT_WALLET,
          asset,
          fee: '0.5%',
        },
      ],
    },
    { status: 402 }
  );
}

/** MOCK verify: well-formed base64 JSON + matching to + sufficient amount. */
function verifyMock(header: string, to: string, amountCents: string): PaymentProof {
  let proof: PaymentProof;
  try {
    proof = JSON.parse(atob(header));
  } catch {
    throw new Error('malformed X-Payment header');
  }
  if (!proof.amount || !proof.to || !proof.asset || !proof.signature) {
    throw new Error('malformed X-Payment proof (need amount, to, asset, signature)');
  }
  if (proof.to !== to) throw new Error('payment to wrong merchant');
  if (Number(proof.amount) < Number(amountCents)) throw new Error('payment amount too low');
  return proof;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!env.ORIGIN_URL || !env.PRICE_USD_CENTS || !env.MERCHANT_WALLET) {
      return Response.json(
        { error: 'gateway misconfigured: set ORIGIN_URL, PRICE_USD_CENTS, MERCHANT_WALLET' },
        { status: 500 }
      );
    }
    const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');

    // CORS preflight passthrough
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': '*, X-Payment',
        },
      });
    }

    const header = req.headers.get('X-Payment');
    if (!header) return challenge(req, env);

    try {
      verifyMock(header, env.MERCHANT_WALLET, env.PRICE_USD_CENTS);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 402 });
    }

    // MOCK settlement log: no on-chain transfer.
    const gross = Number(env.PRICE_USD_CENTS) / 100;
    const fee = (gross * feeBps) / 10_000;
    console.log(
      `[nanotab-gw] settled $${gross.toFixed(2)} → ${env.MERCHANT_WALLET} (fee ${(feeBps / 100).toFixed(2)}% $${fee.toFixed(4)}, net $${(gross - fee).toFixed(4)}) [MOCK, no chain]`
    );

    // Proxy to origin (strip X-Payment, preserve method/body/query).
    const origin = new URL(req.url);
    const target = new URL(env.ORIGIN_URL + origin.pathname + origin.search);
    const fwd = new Headers(req.headers);
    fwd.delete('X-Payment');
    fwd.set('host', target.host);
    const init: RequestInit & { duplex?: string } =
      req.method === 'GET' || req.method === 'HEAD'
        ? { method: req.method, headers: fwd }
        : { method: req.method, headers: fwd, body: await req.arrayBuffer(), redirect: 'manual' };
    const proxied = await fetch(target.toString(), init);
    const out = new Headers(proxied.headers);
    out.set('access-control-allow-origin', '*');
    out.set('x-nanotab', 'mock-settled');
    return new Response(proxied.body, { status: proxied.status, headers: out });
  },
};
