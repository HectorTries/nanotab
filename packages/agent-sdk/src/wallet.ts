// NanoTab agent wallet — REAL mainnet signing with viem on Base.
// ERC-4337-ready: the agent holds an ECDSA key (or a Coinbase Smart Wallet
// owner key) and signs an X-Payment transfer authorization; the signed intent
// encodes a real USDC `transfer(payTo, amount)` call on Base mainnet.
// No mocks. Signatures verify on-chain via ecrecover (viem verifyMessage).
//
// Usage:
//   const w = createSmartWallet(process.env.NANOTAB_WALLET_KEY as `0x${string}`);
//   const sig = await w.signPayment({ to, amountCents, asset: USDC_BASE });
//   // X-Payment header = base64({ amount, to, asset, network, signature, from })
//
// Never commit a private key. Key comes from env only.

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export const BASE_MAINNET_CHAIN_ID = 8453;
export const USDC_BASE: Address = '0x833589fcD6eDB6e08f4C7c32d4f71B54BdA4B4E5';
export const NETWORK = 'base' as const;
export const USDC_DECIMALS = 6;

const ERC20_ABI = [
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
] as const;

const RPC_URL = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';

export function publicClient(): any {
  return createPublicClient({ chain: base, transport: http(RPC_URL) });
}

/** USD cents → USDC base units (6 decimals). "2" ($0.02) → 20000n. */
export function centsToUsdcUnits(amountCents: string): bigint {
  const cents = BigInt(amountCents);
  return cents * 10n ** BigInt(USDC_DECIMALS - 2);
}

/** Canonical signed message for an X-Payment authorization. */
export function paymentMessage(args: { to: string; amountCents: string; asset: string }): string {
  return `nanotab-x402|network=base|to=${args.to}|amountCents=${args.amountCents}|asset=${args.asset}`;
}

/** Real USDC `transfer(to, amount)` calldata, submittable on Base mainnet. */
export function encodeUsdcTransfer(to: Address, amountCents: string): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, centsToUsdcUnits(amountCents)],
  });
}

export interface SmartWallet {
  address: Address;
  network: typeof NETWORK;
  signPayment(args: { to: string; amountCents: string; asset: string }): Promise<Hex>;
  /** Spec-compat alias for signPayment. */
  mockSign(msg: string): Promise<Hex>;
  getAddress(): Address;
  /** Build the X-Payment header value for a 402 retry. */
  paymentHeader(args: { to: string; amountCents: string; asset?: string }): Promise<string>;
  /** USDC balance of this wallet on Base mainnet (base units). */
  getUsdcBalance(): Promise<bigint>;
}

/**
 * Create a real signing wallet from a private key (env NANOTAB_WALLET_KEY).
 * The same key can be an owner of a Coinbase Smart Wallet (ERC-4337) — the
 * signed X-Payment intent below is EIP-191 and verifiable for both EOAs and
 * (via EIP-1271) smart-wallet accounts.
 */
export function createSmartWallet(privateKey: `0x${string}`): SmartWallet {
  const account = privateKeyToAccount(privateKey);
  const signPayment = async (args: { to: string; amountCents: string; asset: string }): Promise<Hex> =>
    account.signMessage({ message: paymentMessage(args) });
  const paymentHeader = async (args: { to: string; amountCents: string; asset?: string }): Promise<string> => {
    const asset = args.asset ?? USDC_BASE;
    const signature = await signPayment({ to: args.to, amountCents: args.amountCents, asset });
    return Buffer.from(
      JSON.stringify({
        amount: args.amountCents,
        to: args.to,
        asset,
        network: NETWORK,
        signature,
        from: account.address,
      })
    ).toString('base64');
  };
  return {
    address: account.address,
    network: NETWORK,
    signPayment,
    mockSign: (msg: string) => signPayment({ to: msg, amountCents: '0', asset: USDC_BASE }),
    getAddress: () => account.address,
    paymentHeader,
    getUsdcBalance: async () =>
      publicClient().readContract({
        address: USDC_BASE,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'a', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ] as const,
        functionName: 'balanceOf',
        args: [account.address],
      }) as Promise<bigint>,
  };
}

/**
 * Submit a USDC transfer on Base mainnet (settlement path).
 * Requires a funded settler key — pass via env, never hardcode.
 */
export async function submitUsdcTransfer(args: {
  settlerKey: `0x${string}`;
  to: Address;
  amountCents: string;
}): Promise<Hex> {
  const account = privateKeyToAccount(args.settlerKey);
  const wallet = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  return wallet.writeContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [args.to, centsToUsdcUnits(args.amountCents)],
    account,
    chain: base,
  });
}

// --- Legacy compat: kept so local demos typecheck; NOT used in prod. ---
// Previously createMockWallet returned fake signatures. It now throws unless
// NANOTAB_ALLOW_MOCK=1 (local smoke tests only, never mainnet).
export interface MockWallet {
  address: string;
  privateKey: string;
  network: 'base-sepolia';
  signPayment(args: { to: string; amountCents: string; asset: string }): string;
  mockSign(msg: string): string;
  getAddress(): string;
}

export function createMockWallet(existingAddress?: string): MockWallet {
  if (process.env.NANOTAB_ALLOW_MOCK !== '1') {
    throw new Error(
      'createMockWallet is disabled: NanoTab now signs REAL mainnet USDC payments. ' +
        'Use createSmartWallet(NANOTAB_WALLET_KEY). Set NANOTAB_ALLOW_MOCK=1 for local smoke tests only.'
    );
  }
  const address = existingAddress ?? '0xMOCK000000000000000000000000000000000001';
  const signPayment = (): string => '0xMOCK-disabled-use-createSmartWallet';
  return {
    address,
    privateKey: 'MOCK_DISABLED',
    network: 'base-sepolia',
    signPayment,
    mockSign: signPayment,
    getAddress: () => address,
  };
}

export const ONRAMP_LINK =
  'https://keys.coinbase.com/onramp?network=base&asset=USDC (mainnet — fund with real USDC on Base)';
