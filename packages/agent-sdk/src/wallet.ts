// MOCKED smart wallet — Base Sepolia. No chain interaction.
// Returns deterministic fake signatures so the 402 flow can be tested end-to-end.

export interface MockWallet {
  address: string;
  /** Spec-compat alias: fake private key material (MOCK, no chain). */
  privateKey: string;
  network: 'base-sepolia';
  signPayment(args: { to: string; amountCents: string; asset: string }): string;
  /** Spec-compat alias for signPayment. */
  mockSign(msg: string): string;
  getAddress(): string;
}

function randomHex(n: number): string {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

export function createMockWallet(existingAddress?: string): MockWallet {
  const address =
    existingAddress && existingAddress.startsWith('0xMOCK')
      ? `0x${randomHex(40)}`
      : existingAddress ?? `0x${randomHex(40)}`;
  const privateKey = `MOCK_${randomHex(32)}`;
  const signPayment = ({ to, amountCents, asset }: { to: string; amountCents: string; asset: string }): string => {
    // Fake ERC-4337 userOp-style signature. MOCK: no private key, no bundler.
    const payload = `${address}|${to}|${amountCents}|${asset}|base-sepolia`;
    return `0xsig-${Buffer.from(payload).toString('hex').slice(0, 32)}${randomHex(8)}`;
  };
  return {
    address,
    privateKey,
    network: 'base-sepolia',
    signPayment,
    mockSign: (msg: string): string => signPayment({ to: msg, amountCents: '0', asset: 'USDC' }),
    getAddress: (): string => address,
  };
}

export const ONRAMP_LINK =
  'https://keys.coinbase.com/onramp?network=base-sepolia&asset=USDC (testnet — use a Base Sepolia faucet for MVP)';
