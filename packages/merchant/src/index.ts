import type { Request, Response, NextFunction } from 'express';

export const NANOTAB_FEE_BPS = 50; // 0.5%

export interface ChargeOptions {
  /** Price in USD, e.g. 0.02 = $0.02/call. */
  price: number;
  /** Merchant wallet receiving settlement (minus fee). */
  wallet: string;
  network?: string;
  asset?: string;
}

export interface PaymentProof {
  amount: string;
  to: string;
  asset: string;
  network?: string;
  signature: string;
  from?: string;
}

export function usdToCents(usd: number): string {
  return String(Math.round(usd * 100));
}

/** MOCK verification: accepts any well-formed X-Payment header. No chain lookup. */
export function verifyMockPayment(header: string, expected: { to: string; amountCents: string }): PaymentProof {
  let proof: PaymentProof;
  try {
    proof = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    throw new Error('malformed X-Payment header');
  }
  if (!proof.amount || !proof.to || !proof.asset || !proof.signature) {
    throw new Error('malformed X-Payment proof (need amount, to, asset, signature)');
  }
  if (proof.to !== expected.to) throw new Error('payment to wrong merchant');
  if (Number(proof.amount) < Number(expected.amountCents)) throw new Error('payment amount too low');
  return proof;
}

/**
 * nanotabCharge({ price, wallet }) — Express middleware.
 * No X-Payment header → 402 with x402 payment spec.
 * With header → mock-verify, log gross/fee/net settlement, call next().
 */
export function nanotabCharge(opts: ChargeOptions) {
  const network = opts.network ?? 'base-sepolia';
  const asset = opts.asset ?? 'USDC';
  const amountCents = usdToCents(opts.price);

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('X-Payment');
    const resource = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (!header) {
      res.status(402).json({
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network,
            maxAmountRequired: amountCents,
            resource,
            payTo: opts.wallet,
            asset,
            fee: '0.5%',
          },
        ],
      });
      return;
    }

    try {
      verifyMockPayment(header, { to: opts.wallet, amountCents });
    } catch (e) {
      res.status(402).json({ error: (e as Error).message });
      return;
    }

    // MOCK settlement: no on-chain transfer. Log the 0.5% split.
    const gross = Number(amountCents) / 100;
    const fee = (gross * NANOTAB_FEE_BPS) / 10_000;
    console.log(
      `[nanotab] settled $${gross.toFixed(2)} → ${opts.wallet} (fee 0.5% $${fee.toFixed(4)}, net $${(gross - fee).toFixed(4)}) [MOCK, no chain]`
    );
    next();
  };
}
