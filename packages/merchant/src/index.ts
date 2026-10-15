import type { Request, Response, NextFunction } from 'express';

export const NANOTAB_FEE_BPS = 50; // 0.5%
export const USDC_BASE = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';
export const NETWORK = 'base';

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

/** Structural verification: well-formed X-Payment, right merchant, sufficient amount,
 *  USDC-on-Base asset. Signature recovery (EIP-191) is enforced at the gateway;
 *  use this middleware behind the gateway or add async sig check in your own stack. */
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
  if (proof.to.toLowerCase() !== expected.to.toLowerCase()) throw new Error('payment to wrong merchant');
  if (BigInt(proof.amount) < BigInt(expected.amountCents)) throw new Error('payment amount too low');
  if (proof.asset.toLowerCase() !== USDC_BASE.toLowerCase() && proof.asset !== 'USDC')
    throw new Error('unsupported asset (need USDC on Base)');
  if (proof.network && proof.network !== 'base') throw new Error('wrong network (need base)');
  return proof;
}

/**
 * nanotabCharge({ price, wallet }) — Express middleware.
 * No X-Payment header → 402 with x402 payment spec.
 * With header → structural verify, log gross/fee/net settlement, call next().
 */
export function nanotabCharge(opts: ChargeOptions) {
  const network = opts.network ?? NETWORK;
  const asset = opts.asset ?? USDC_BASE;
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

    // Settlement accounting: payer authorized off-chain (sig verified at gateway);
    // on-chain USDC transfer is settled by the gateway settler. Log the split.
    const gross = Number(amountCents) / 100;
    const fee = (gross * NANOTAB_FEE_BPS) / 10_000;
    console.log(
      `[nanotab] authorized $${gross.toFixed(2)} → ${opts.wallet} (fee 0.5% $${fee.toFixed(4)}, net $${(gross - fee).toFixed(4)}) [base mainnet USDC; on-chain settle via gateway]`
    );
    next();
  };
}
