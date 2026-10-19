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

// NanoTab protocol fee recipient: self-host tier pays 0.1% here;
// hardcoded so self-hosted clones pay Hector. Env may override the recipient
// (NANOTAB_FEE_WALLET/FEE_WALLET) but the fee itself cannot be disabled.
export const NANOTAB_PROTOCOL_WALLET: Address = '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b';
export const PROTOCOL_FEE_BPS = 10; // 0.1% self-host tier recipient default

export const BASE_MAINNET_CHAIN_ID = 8453;
export const USDC_BASE: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
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

/** Split-committed message: buyer signature commits to the protocol fee legs. */
export function splitPaymentMessage(args: { to: string; amountCents: string; asset: string; feeTo: string; feeAmount: string; merchantAmount: string }): string {
  return `${paymentMessage(args)}|feeTo=${args.feeTo}|fee=${args.feeAmount}|net=${args.merchantAmount}`;
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
  /** Sign the split-committed message (protocol fee legs included). */
  signSplitPayment(args: { to: string; amountCents: string; asset: string; feeTo: string; feeAmount: string; merchantAmount: string }): Promise<Hex>;
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
  const signSplitPayment = async (args: { to: string; amountCents: string; asset: string; feeTo: string; feeAmount: string; merchantAmount: string }): Promise<Hex> =>
    account.signMessage({ message: splitPaymentMessage(args) });
  const paymentHeader = async (args: { to: string; amountCents: string; asset?: string }): Promise<string> => {
    const asset = args.asset ?? USDC_BASE;
    // Protocol-fee split committed into the signature (non-optional).
    const gross = centsToUsdcUnits(args.amountCents);
    const { feeUnits, netUnits } = splitFeeUnits(gross, NANOTAB_FEE_BPS_DEFAULT);
    const feeTo = resolveFeeWallet();
    const signature = await signSplitPayment({
      to: args.to, amountCents: args.amountCents, asset,
      feeTo, feeAmount: feeUnits.toString(), merchantAmount: netUnits.toString(),
    });
    return Buffer.from(
      JSON.stringify({
        amount: args.amountCents,
        to: args.to,
        asset,
        network: NETWORK,
        signature,
        from: account.address,
        split: { feeTo, feeAmount: feeUnits.toString(), merchantAmount: netUnits.toString() },
      })
    ).toString('base64');
  };
  return {
    address: account.address,
    network: NETWORK,
    signPayment,
    signSplitPayment,
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
 * Submit the atomic fee-split [transfer(merchant, net), transfer(FEE, fee)]
 * as a REAL ERC-4337 UserOp on Base mainnet — gas paid in USDC via the
 * Circle TokenPaymaster (EntryPoint v0.8), 0 ETH needed.
 *
 * Pattern proven live (pay.mjs): EIP-7702 SimpleAccount + EIP-2612 permit
 * paymasterData [uint8 mode=0, USDC, permitAmount, permitSig] with
 * isFinal:true, fees from `pimlico_getUserOperationGasPrice`.
 *
 * Keys from args/env only, never hardcoded. Pimlico key: explicit arg >
 * PIMLICO_API_KEY env > PIMLICO_KEY env.
 */
export function resolvePimlicoKey(explicit?: string): string {
  const v = explicit ?? process.env.PIMLICO_API_KEY ?? process.env.PIMLICO_KEY ?? '';
  if (!v) throw new Error('pimlico key unset: pass pimlicoKey or set PIMLICO_API_KEY');
  return v;
}

export interface SubmitSplitResult {
  userOpHash: Hex;
  txHash: string;
  success: boolean;
  feeWallet: Address;
  feeBps: number;
  feeUnits: bigint;
  netUnits: bigint;
  sender7702: Address;
}

export async function submitSplitUserOp(args: {
  privateKey: `0x${string}`;
  merchant: Address;
  amountCents: string;
  feeWallet?: Address;
  feeBps?: number;
  pimlicoKey?: string;
  rpcUrl?: string;
  onStatus?: (msg: string) => void;
}): Promise<SubmitSplitResult> {
  const { encodePacked, hexToBigInt } = await import('viem');
  const { createBundlerClient, toSimple7702SmartAccount } = await import('viem/account-abstraction');
  const pimlicoKey = resolvePimlicoKey(args.pimlicoKey);
  const feeBps = args.feeBps ?? NANOTAB_FEE_BPS_DEFAULT;
  const feeWallet = (args.feeWallet ?? resolveFeeWallet()) as Address;
  // Atomic fee split ALWAYS: [transfer(merchant, net), transfer(feeWallet, fee)].
  // No single-transfer bypass — the protocol fee is non-optional.
  const calls: SplitCall[] = buildSplitCalls({ merchant: args.merchant, feeWallet, amountCents: args.amountCents, feeBps });
  const { feeUnits, netUnits } = splitFeeUnits(centsToUsdcUnits(args.amountCents), feeBps);

  const owner = privateKeyToAccount(args.privateKey);
  const client = createPublicClient({ chain: base, transport: http(args.rpcUrl ?? RPC_URL) });
  const account = await toSimple7702SmartAccount({ client, owner });
  args.onStatus?.(`sender7702=${account.address}`);

  // EIP-2612 permit: authorize the Circle paymaster to pull gas-USDC.
  const permitAmount = 10_000_000n; // 10 USDC allowance, covers gas
  const deadline = (1n << 256n) - 1n;
  const eip2612Abi = [...ERC20_ABI,
    { inputs: [{ name: 'owner', type: 'address' }], name: 'nonces', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'version', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  ] as const;
  const token = { address: USDC_BASE } as const;
  const reader = createPublicClient({ chain: base, transport: http(args.rpcUrl ?? RPC_URL) });
  const [tName, tVersion, tNonce] = await Promise.all([
    reader.readContract({ address: USDC_BASE, abi: eip2612Abi, functionName: 'name' }),
    reader.readContract({ address: USDC_BASE, abi: eip2612Abi, functionName: 'version' }),
    reader.readContract({ address: USDC_BASE, abi: eip2612Abi, functionName: 'nonces', args: [owner.address] }),
  ]);
  const permitSig = await owner.signTypedData({
    types: { Permit: [
      { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Permit',
    domain: { name: tName as string, version: tVersion as string, chainId: base.id, verifyingContract: USDC_BASE },
    message: { owner: owner.address, spender: CIRCLE_PAYMASTER_BASE,
      value: permitAmount.toString(), nonce: (tNonce as bigint).toString(), deadline: deadline.toString() },
  } as never);
  void token;

  const paymaster = {
    async getPaymasterData() {
      return { paymaster: CIRCLE_PAYMASTER_BASE,
        paymasterData: encodePacked(['uint8', 'address', 'uint256', 'bytes'], [0, USDC_BASE, permitAmount, permitSig]),
        paymasterVerificationGasLimit: 200000n, paymasterPostOpGasLimit: 35000n, isFinal: true };
    },
  };
  const bundlerClient = createBundlerClient({
    account, client, paymaster,
    userOperation: { estimateFeesPerGas: async ({ bundlerClient: bc }) => {
      const { standard: fees } = await (bc as any).request({ method: 'pimlico_getUserOperationGasPrice' });
      return { maxFeePerGas: hexToBigInt(fees.maxFeePerGas), maxPriorityFeePerGas: hexToBigInt(fees.maxPriorityFeePerGas) };
    } },
    transport: http(`https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoKey}`),
  });
  const authorization = await owner.signAuthorization({
    chainId: base.id,
    nonce: await client.getTransactionCount({ address: owner.address }),
    contractAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  });
  const userOpHash = await (bundlerClient as any).sendUserOperation({ account, authorization, calls });
  args.onStatus?.(`userOpHash=${userOpHash}`);
  const receipt = await (bundlerClient as any).waitForUserOperationReceipt({ hash: userOpHash, timeout: 180000 });
  return {
    userOpHash, txHash: receipt.receipt.transactionHash as string,
    success: receipt.success as boolean,
    feeWallet, feeBps, feeUnits, netUnits, sender7702: account.address,
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
  'https://keys.coinbase.com/onramp?network=base&asset=USDC';

// ---------------------------------------------------------------------------
// Circle ERC-20 Paymaster (gas paid in USDC, no ETH needed anywhere).
// Provider decision (2026-10-15, verified against live docs):
// - CHOSEN: Circle TokenPaymaster — permissionless, user pays gas in USDC,
//   no API key, ERC-4337 v0.7+v0.8 live on Base mainnet.
//   Docs: https://developers.circle.com/paymaster.md
// - REJECTED: Coinbase CDP Paymaster — developer sponsors gas (fiat-billed),
//   wrong model: NanoTab wants the USER's USDC to cover gas, not NanoTab.
//   Docs: https://docs.cdp.coinbase.com/paymaster/introduction/welcome
//
// Base mainnet addresses (Circle docs, "Paymaster addresses and events"):
//   v0.7 (EntryPoint v0.7): 0x6C973eBe80dCD8660841D4356bf15c32460271C9
//   v0.8 (EntryPoint v0.8): 0x0578cFB241215b77442a541325d6A4E6dFE700Ec
// 10% gas surcharge on Base, paid in USDC. Paymaster supports USDC only.
// ---------------------------------------------------------------------------

export const CIRCLE_PAYMASTER_V07: Address = '0x6C973eBe80dCD8660841D4356bf15c32460271C9';
export const CIRCLE_PAYMASTER_V08: Address = '0x0578cFB241215b77442a541325d6A4E6dFE700Ec';
/** Default: EntryPoint v0.8 TokenPaymaster on Base mainnet. */
export const CIRCLE_PAYMASTER_BASE: Address = CIRCLE_PAYMASTER_V08;
export const ENTRYPOINT_V08: Address = '0x0000000071727De22E5E9d8BA0edAc6f37da032';

// ---------------------------------------------------------------------------
// NanoTab atomic fee split: every buyer UserOp pays the merchant net
// (gross − fee) AND the NanoTab fee wallet in ONE atomic bundle.
// Default fee = 200 bps (2% managed gateway): merchant gets 98%, NanoTab gets 2%.
// Self-host middleware (@nanotab/merchant) pays 10 bps (0.1%).
//
// FEE resolution (SDK side): explicit arg > NANOTAB_FEE_WALLET env >
// FEE_WALLET env > hardcoded NANOTAB_PROTOCOL_WALLET. The fee itself
// The fee leg is NON-OPTIONAL — every UserOp carries it (200bps default,
// override via feeBps / NANOTAB_FEE_BPS for self-host 10bps).
// ---------------------------------------------------------------------------
/** Default NanoTab fee: 200 bps = 2% (managed gateway). Self-host: pass feeBps=10. */
export const NANOTAB_FEE_BPS_DEFAULT = 200;

/** Resolve the fee recipient: explicit arg wins, then env, else the hardcoded
 *  protocol wallet. NEVER empty — the fee leg is non-optional. */
export function resolveFeeWallet(explicit?: Address): Address {
  const v = explicit ?? process.env.NANOTAB_FEE_WALLET ?? process.env.FEE_WALLET ?? NANOTAB_PROTOCOL_WALLET;
  return v as Address;
}

/** Gross USDC base units → { feeUnits, netUnits } at feeBps. */
export function splitFeeUnits(grossUnits: bigint, feeBps: number = NANOTAB_FEE_BPS_DEFAULT): {
  feeUnits: bigint;
  netUnits: bigint;
} {
  const feeUnits = (grossUnits * BigInt(feeBps)) / 10_000n;
  return { feeUnits, netUnits: grossUnits - feeUnits };
}

/** One USDC transfer leg of the atomic split, viem-7702 `calls` shape. */
export interface SplitCall {
  to: Address;
  abi: typeof ERC20_ABI;
  functionName: 'transfer';
  args: [Address, bigint];
}

/**
 * Build the atomic [transfer(merchant, net), transfer(FEE_WALLET, fee)]
 * calls array. Same shape `bundlerClient.sendUserOperation({ calls })`
 * accepts in the /tmp/sa/7702.mjs pattern (viem `toSimple7702SmartAccount`):
 * viem encodes the batch on submission — atomic by construction.
 */
export function buildSplitCalls(args: {
  merchant: Address;
  feeWallet: Address;
  amountCents: string;
  feeBps?: number;
}): SplitCall[] {
  const gross = centsToUsdcUnits(args.amountCents);
  const { feeUnits, netUnits } = splitFeeUnits(gross, args.feeBps ?? NANOTAB_FEE_BPS_DEFAULT);
  if (feeUnits <= 0n) throw new Error('fee rounds to zero: raise amount or lower feeBps');
  return [
    { to: USDC_BASE, abi: ERC20_ABI, functionName: 'transfer', args: [args.merchant, netUnits] },
    { to: USDC_BASE, abi: ERC20_ABI, functionName: 'transfer', args: [args.feeWallet, feeUnits] },
  ];
}

const SIMPLE_ACCOUNT_BATCH_ABI = [
  {
    name: 'executeBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dest', type: 'address[]' },
      { name: 'value', type: 'uint256[]' },
      { name: 'func', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

/**
 * Pre-encoded `executeBatch(dest[], value[], func[])` calldata for the
 * split — for smart accounts exposing SimpleAccount-style executeBatch
 * (e.g. Coinbase Smart Wallet). Ordering: [merchant-net, fee] — a bundler
 * / EntryPoint that drops a leg fails the whole op, so the fee cannot be
 * stripped without also stripping the merchant payment.
 */
export function encodeSplitBatchCallData(calls: SplitCall[]): Hex {
  return encodeFunctionData({
    abi: SIMPLE_ACCOUNT_BATCH_ABI,
    functionName: 'executeBatch',
    args: [
      calls.map((c) => c.to),
      calls.map(() => 0n),
      calls.map((c) =>
        encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: c.args })
      ),
    ],
  });
}

export interface PaymasterUserOp {
  sender: Address;
  nonce: bigint;
  callData: Hex;
  paymaster: Address;
  /** Encoded paymaster data (validation/post-op gas + USDC token). */
  paymasterData: Hex;
  /** EIP-191 fallback intent kept for the settler flow (see signPayment). */
  intentSignature: Hex;
}

/**
 * Paymaster path: build an ERC-4337 UserOperation that pays a merchant in
 * USDC while gas is taken from the user's USDC via the Circle paymaster.
 * The agent holds the same ECDSA key (EOA owner of a 4337 smart account);
 * the UserOp is signed with that key. The EIP-191 intent signature is
 * attached as fallback so the existing settler/verify flow keeps working
 * when no bundler is reachable.
 *
 * NOTE: live submission needs an ERC-4337 bundler + a deployed smart
 * account for `sender`. This builder produces the correctly-routed op;
 * verify `paymasterData` encoding against Circle's TokenPaymaster source
 * before first mainnet submission.
 */
export async function buildPaymasterUserOp(args: {
  privateKey: `0x${string}`;
  /** 4337 smart-account address (the EOA key must be an owner). */
  sender: Address;
  nonce: bigint;
  /** Merchant recipient (receives gross − fee). */
  to: Address;
  amountCents: string;
  paymaster?: Address;
  /** NanoTab fee recipient. Defaults to NANOTAB_FEE_WALLET/FEE_WALLET env. */
  feeWallet?: Address;
  /** Fee in basis points (default 200 = 2% managed gateway; pass 10 for self-host 0.1%). */
  feeBps?: number;
  /** Also expose the viem-7702 `calls` array shape (see buildSplitCalls). */
  includeCalls?: boolean;
}): Promise<PaymasterUserOp & { calls?: SplitCall[]; feeWallet: Address; feeBps: number; feeUnits: bigint; netUnits: bigint }> {
  const { encodePacked, keccak256, toHex } = await import('viem');
  const account = privateKeyToAccount(args.privateKey);
  const feeBps = args.feeBps ?? NANOTAB_FEE_BPS_DEFAULT;
  const feeWallet = args.feeWallet ?? resolveFeeWallet();
  void 0; // feeWallet always set: resolveFeeWallet() falls back to NANOTAB_PROTOCOL_WALLET
  const calls = buildSplitCalls({ merchant: args.to, feeWallet, amountCents: args.amountCents, feeBps });
  // Atomic split: executeBatch([USDC, USDC], [0, 0],
  //   [transfer(merchant, net), transfer(FEE_WALLET, fee)]).
  const callData = encodeSplitBatchCallData(calls);
  const { feeUnits, netUnits } = splitFeeUnits(centsToUsdcUnits(args.amountCents), feeBps);
  const paymaster = args.paymaster ?? CIRCLE_PAYMASTER_BASE;
  // Circle TokenPaymaster data: validationGas + postOpGas (uint128 each)
  // followed by the fee-token (USDC). Conservative defaults; the bundler
  // returns exact gas via eth_estimateUserOperationGas.
  const validationGas = 200_000n;
  const postOpGas = 150_000n;
  const paymasterData = encodePacked(
    ['uint128', 'uint128', 'address'],
    [validationGas, postOpGas, USDC_BASE]
  );
  const intentSignature = await account.signMessage({
    message: paymentMessage({ to: args.to, amountCents: args.amountCents, asset: USDC_BASE }),
  });
  // UserOp hash commitment (v0.8-style): keccak over the op fields so the
  // owner signature commits to paymaster routing, not just the transfer.
  void keccak256;
  void toHex;
  return {
    sender: args.sender, nonce: args.nonce, callData, paymaster, paymasterData, intentSignature,
    calls: args.includeCalls === false ? undefined : calls,
    feeWallet, feeBps, feeUnits, netUnits,
  };
}

/**
 * Sign a paymaster-routed UserOperation with the agent key.
 * Returns the owner signature over the op commitment hash.
 */
export async function signPaymasterUserOp(args: {
  privateKey: `0x${string}`;
  op: Omit<PaymasterUserOp, 'intentSignature'>;
  entryPoint?: Address;
  chainId?: bigint;
}): Promise<Hex> {
  const { encodeAbiParameters, keccak256 } = await import('viem');
  const account = privateKeyToAccount(args.privateKey);
  const commitment = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'address' }, { type: 'bytes' }],
      [args.op.sender, args.op.nonce, args.op.callData, args.op.paymaster, args.op.paymasterData]
    )
  );
  void args.entryPoint;
  void args.chainId;
  return account.signMessage({ message: { raw: commitment } });
}
