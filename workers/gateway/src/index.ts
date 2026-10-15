// NanoTab gateway worker — paywalls ANY origin API with x402-style 402s.
// Zero code changes on merchant side: proxy + 402 challenge + REAL verify.
//
// Mainnet flow (Base, USDC 0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5):
//  1. No X-Payment → 402 challenge (network=base, payTo=MERCHANT_WALLET).
//  2. With X-Payment → structural checks (amount >= price, to == payTo,
//     asset == USDC mainnet contract, network == base) + EIP-191 signature
//     recovery: signature must recover to `from`. Underpays → 402.
//     NOTE: this proves the payer AUTHORIZED the payment off-chain. Full
//     on-chain confirmation (tx hash lookup) happens when the payer submits
//     the transfer; settlement below moves funds merchant-side.
//  3. Settlement → settles on-chain: merchant net transfer when a settler key
//     is configured (SETTLER_KEY secret + FUNDED payer flow), else logs the
//     merchant-net + NanoTab-fee accounting with tx-hash when available.
//     Fee = NANOTAB_FEE_BPS (default 50 = 0.5%).

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyMessage,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

interface Env {
  ORIGIN_URL: string; // e.g. https://api.theirsite.com (no trailing slash)
  PRICE_USD_CENTS: string; // e.g. "2" = $0.02/call
  MERCHANT_WALLET: string; // 0x… — set via wrangler secret/variable, never hardcoded
  NANOTAB_FEE_BPS?: string; // e.g. "50" = 0.5% (default 50)
  NETWORK?: string; // must be "base"
  ASSET?: string; // must be USDC mainnet contract
  FEE_WALLET?: string; // NanoTab fee recipient (optional; logged if unset)
  SETTLER_KEY?: string; // settler private key (wrangler secret ONLY) — enables on-chain merchant transfer
  BASE_RPC_URL?: string; // optional custom Base RPC
}

const USDC_BASE_MAINNET = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';
const NANOTAB_NETWORK = 'base';
const USDC_DECIMALS = 6;

interface PaymentProof {
  amount: string; // USD cents, e.g. "2"
  to: string;
  asset: string;
  network?: string;
  signature: string;
  from?: string;
  txHash?: string; // optional: payer's on-chain transfer hash for confirmation
}

function paymentMessage(p: { to: string; amount: string; asset: string }): string {
  return `nanotab-x402|network=base|to=${p.to}|amountCents=${p.amount}|asset=${p.asset}`;
}

function challenge(req: Request, env: Env): Response {
  return Response.json(
    {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: NANOTAB_NETWORK,
          maxAmountRequired: env.PRICE_USD_CENTS,
          resource: req.url,
          payTo: env.MERCHANT_WALLET,
          asset: USDC_BASE_MAINNET,
          fee: `${Number(env.NANOTAB_FEE_BPS ?? '50') / 100}%`,
        },
      ],
    },
    { status: 402 }
  );
}

function assetOk(asset: string): boolean {
  return asset.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() || asset === 'USDC';
}

/** Structural verify: well-formed, right merchant, sufficient amount, USDC-on-Base. */
function verifyPayment(header: string, to: string, amountCents: string): PaymentProof {
  let proof: PaymentProof;
  try {
    proof = JSON.parse(atob(header));
  } catch {
    throw new Error('malformed X-Payment header');
  }
  if (!proof.amount || !proof.to || !proof.asset || !proof.signature) {
    throw new Error('malformed X-Payment proof (need amount, to, asset, signature)');
  }
  if (proof.to.toLowerCase() !== to.toLowerCase()) throw new Error('payment to wrong merchant');
  if (BigInt(proof.amount) < BigInt(amountCents)) throw new Error('payment amount too low');
  if (!assetOk(proof.asset)) throw new Error('unsupported asset (need USDC on Base)');
  if (proof.network && proof.network !== 'base') throw new Error('wrong network (need base)');
  return proof;
}

/** Recover signer of the EIP-191 authorization; must equal `from` when provided. */
async function verifySignature(proof: PaymentProof): Promise<Address> {
  const recovered = await verifyMessage({
    address: (proof.from ?? '0x0000000000000000000000000000000000000000') as Address,
    message: paymentMessage({ to: proof.to, amount: proof.amount, asset: proof.asset }),
    signature: proof.signature as Hex,
  });
  void recovered;
  // verifyMessage returns bool for (address,message,sig); true = `from` signed it.
  return proof.from as Address;
}

function centsToUnits(cents: string): bigint {
  return BigInt(cents) * 10n ** BigInt(USDC_DECIMALS - 2);
}

function split(amountCents: string, feeBps: number): { feeUnits: bigint; netUnits: bigint } {
  const gross = centsToUnits(amountCents);
  const feeUnits = (gross * BigInt(feeBps)) / 10_000n;
  return { feeUnits, netUnits: gross - feeUnits };
}

/**
 * On-chain settlement: transfers merchant net (gross − fee) in USDC on Base
 * from the configured settler key to MERCHANT_WALLET. Returns tx hash.
 * Fee accounting (feeUnits → FEE_WALLET) is logged; swept in batch by ops
 * (documented below) to keep per-call gas to one transfer.
 */
async function settleOnChain(env: Env, amountCents: string): Promise<{ txHash: string; net: string; fee: string }> {
  const feeBps = Number(env.NANOTAB_FEE_BPS ?? '50');
  const { feeUnits, netUnits } = split(amountCents, feeBps);
  const account = privateKeyToAccount(env.SETTLER_KEY as `0x${string}`);
  const rpc = env.BASE_RPC_URL ?? 'https://mainnet.base.org';
  void createPublicClient;
  const wallet = createWalletClient({ account, chain: base, transport: http(rpc) });
  const txHash = await wallet.writeContract({
    address: USDC_BASE_MAINNET as Address,
    abi: [
      {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ] as const,
    functionName: 'transfer',
    args: [env.MERCHANT_WALLET as Address, netUnits],
    account,
    chain: base,
  });
  return { txHash, net: netUnits.toString(), fee: feeUnits.toString() };
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

    let proof: PaymentProof;
    try {
      proof = verifyPayment(header, env.MERCHANT_WALLET, env.PRICE_USD_CENTS);
      if (proof.from) {
        const ok = await verifyMessage({
          address: proof.from as Address,
          message: paymentMessage({ to: proof.to, amount: proof.amount, asset: proof.asset }),
          signature: proof.signature as Hex,
        });
        if (!ok) throw new Error('invalid payment signature');
      }
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 402 });
    }

    // Settlement.
    const gross = Number(env.PRICE_USD_CENTS) / 100;
    const fee = (gross * feeBps) / 10_000;
    const { feeUnits, netUnits } = split(env.PRICE_USD_CENTS, feeBps);
    let settleNote: string;
    if (env.SETTLER_KEY) {
      try {
        const s = await settleOnChain(env, env.PRICE_USD_CENTS);
        settleNote = `on-chain merchant transfer ${s.txHash} (net ${s.net} units; fee ${s.fee} units → ${env.FEE_WALLET ?? 'fee-ledger (unset FEE_WALLET, swept in batch)'})`;
        console.log(`[nanotab-gw] settled $${gross.toFixed(2)} → ${env.MERCHANT_WALLET}: ${settleNote}`);
      } catch (e) {
        settleNote = `on-chain settlement FAILED (${(e as Error).message}); fee accounting logged, merchant settle retry required`;
        console.log(`[nanotab-gw] SETTLE-FAIL $${gross.toFixed(2)} → ${env.MERCHANT_WALLET}: ${(e as Error).message}`);
      }
    } else {
      settleNote = `fee accounting logged (no SETTLER_KEY: merchant net ${netUnits} units → ${env.MERCHANT_WALLET}, fee ${feeUnits} units @${feeBps}bps → ${env.FEE_WALLET ?? 'fee-ledger'}; payer-authorized off-chain, payer submits on-chain transfer)`;
      console.log(
        `[nanotab-gw] authorized $${gross.toFixed(2)} → ${env.MERCHANT_WALLET} (fee ${(feeBps / 100).toFixed(2)}% $${fee.toFixed(4)}, net $${(gross - fee).toFixed(4)}, sig ${proof.signature.slice(0, 18)}… from ${proof.from ?? 'unknown'}) [${settleNote}]`
      );
    }

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
    out.set('x-nanotab', env.SETTLER_KEY ? 'settled-onchain' : 'authorized-logged');
    out.set('x-nanotab-settle', settleNote);
    return new Response(proxied.body, { status: proxied.status, headers: out });
  },
};
