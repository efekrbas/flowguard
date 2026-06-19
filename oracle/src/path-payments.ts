import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  Horizon,
} from "@stellar/stellar-sdk";

// ────────────────────────────────────────────────────────────────────────────────
// Path Payments — Cross-Stablecoin Escrow Funding
// ────────────────────────────────────────────────────────────────────────────────
//
// Problem:  The client holds EURC but the escrow contract requires USDC.
// Solution: Use Stellar's PathPayment operations to atomically convert
//           EURC → USDC in a single transaction on the SDEX/AMM.
//
// Two strategies:
//   • StrictReceive — "I need the escrow to receive exactly X USDC"  (recommended)
//   • StrictSend    — "I want to spend exactly Y EURC"
// ────────────────────────────────────────────────────────────────────────────────

// ─── Well-Known Asset Issuers (Stellar Mainnet) ─────────────────────────────
// Replace with testnet issuers when testing.
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const EURC_ISSUER = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y36DAVIZA67LHKWSZRC7IFGK";

export const USDC = new Asset("USDC", USDC_ISSUER);
export const EURC = new Asset("EURC", EURC_ISSUER);

// ─── Configuration ──────────────────────────────────────────────────────────

interface PathPaymentConfig {
  /** Horizon server URL (e.g. https://horizon.stellar.org) */
  horizonUrl: string;
  /** Network passphrase */
  networkPassphrase: string;
  /** Client's secret key (the party paying into escrow) */
  clientSecret: string;
}

// ────────────────────────────────────────────────────────────────────────────────
// Strategy 1: PathPaymentStrictReceive
// ────────────────────────────────────────────────────────────────────────────────
//
// USE CASE: "The escrow must receive exactly 10,000 USDC.
//            I'll pay in EURC, spending at most my slippage limit."
//
// This is the RECOMMENDED approach for escrow funding because the contract
// expects an exact budget amount.
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Find the best path for a strict-receive payment.
 *
 * Queries Horizon's `/paths/strict-receive` endpoint to discover routes
 * from the source asset to the exact destination amount.
 *
 * @param config    - Horizon URL and network configuration
 * @param source    - Source account public key
 * @param sendAsset - Asset the client holds (e.g. EURC)
 * @param destAsset - Asset the escrow requires (e.g. USDC)
 * @param destAmount - Exact amount the escrow must receive
 * @returns Array of available paths with estimated source amounts
 */
export async function findStrictReceivePaths(
  config: PathPaymentConfig,
  sendAsset: Asset,
  destAsset: Asset,
  destAmount: string
) {
  const horizon = new Horizon.Server(config.horizonUrl);
  const clientKeypair = Keypair.fromSecret(config.clientSecret);

  const pathsResponse = await horizon
    .strictReceivePaths(
      clientKeypair.publicKey(), // source account
      destAsset,                 // destination asset
      destAmount                 // exact destination amount
    )
    .call();

  // Filter to paths starting from our desired send asset.
  const matchingPaths = pathsResponse.records.filter(
    (p) =>
      p.source_asset_code === sendAsset.getCode() &&
      p.source_asset_issuer === sendAsset.getIssuer()
  );

  if (matchingPaths.length === 0) {
    throw new Error(
      `No path found from ${sendAsset.getCode()} to ${destAmount} ${destAsset.getCode()}. ` +
        `Ensure the SDEX has sufficient liquidity.`
    );
  }

  return matchingPaths;
}

/**
 * Execute a PathPaymentStrictReceive — the escrow receives an exact USDC amount,
 * the client pays in EURC with an auto-discovered conversion path.
 *
 * @param config         - Server and account configuration
 * @param escrowAddress  - The FlowGuard contract address (or intermediate account)
 * @param sendAsset      - The client's asset (e.g. EURC)
 * @param destAsset      - The escrow's asset (e.g. USDC)
 * @param destAmount     - Exact amount the escrow must receive (e.g. "10000")
 * @param slippagePct    - Max slippage tolerance as a percentage (default 1%)
 * @returns Transaction hash on success
 *
 * @example
 * ```ts
 * const txHash = await pathPaymentStrictReceive(
 *   config,
 *   "CABC...ESCROW_CONTRACT",
 *   EURC,
 *   USDC,
 *   "10000",   // escrow receives exactly 10,000 USDC
 *   1.0        // allow up to 1% slippage on EURC side
 * );
 * ```
 */
export async function pathPaymentStrictReceive(
  config: PathPaymentConfig,
  escrowAddress: string,
  sendAsset: Asset,
  destAsset: Asset,
  destAmount: string,
  slippagePct: number = 1.0
): Promise<string> {
  const horizon = new Horizon.Server(config.horizonUrl);
  const clientKeypair = Keypair.fromSecret(config.clientSecret);

  // ── Step 1: Discover the best path ──────────────────────────────────────

  const paths = await findStrictReceivePaths(
    config,
    sendAsset,
    destAsset,
    destAmount
  );

  // Use the first (best) path returned by Horizon.
  const bestPath = paths[0];
  const estimatedSourceAmount = parseFloat(bestPath.source_amount);

  // Apply slippage buffer to sendMax.
  const sendMax = (estimatedSourceAmount * (1 + slippagePct / 100)).toFixed(7);

  // Extract the intermediary assets in the path.
  const intermediaryAssets: Asset[] = bestPath.path.map((p) =>
    p.asset_type === "native"
      ? Asset.native()
      : new Asset(p.asset_code!, p.asset_issuer!)
  );

  console.log(`[PathPayment] Best path found:`);
  console.log(`  Send:     ≤ ${sendMax} ${sendAsset.getCode()}`);
  console.log(`  Receive:  = ${destAmount} ${destAsset.getCode()}`);
  console.log(`  Hops:     ${intermediaryAssets.length}`);
  console.log(`  Estimate: ${bestPath.source_amount} ${sendAsset.getCode()}`);

  // ── Step 2: Build the transaction ───────────────────────────────────────

  const sourceAccount = await horizon.loadAccount(clientKeypair.publicKey());

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100000", // 0.01 XLM — generous, network adjusts
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: sendAsset,
        sendMax: sendMax,
        destination: escrowAddress,
        destAsset: destAsset,
        destAmount: destAmount,
        path: intermediaryAssets,
      })
    )
    .setTimeout(30)
    .build();

  // ── Step 3: Sign and submit ─────────────────────────────────────────────

  transaction.sign(clientKeypair);

  const response = await horizon.submitTransaction(transaction);
  const txHash = response.hash;

  console.log(`[PathPayment] ✅ StrictReceive successful. Hash: ${txHash}`);
  return txHash;
}

// ────────────────────────────────────────────────────────────────────────────────
// Strategy 2: PathPaymentStrictSend
// ────────────────────────────────────────────────────────────────────────────────
//
// USE CASE: "I want to spend exactly 9,500 EURC.
//            The escrow should receive at least 9,400 USDC (with slippage)."
//
// Less common for escrow because the received amount isn't guaranteed to match
// the exact contract budget. Useful when the client has a fixed EURC budget.
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Find the best path for a strict-send payment.
 */
export async function findStrictSendPaths(
  config: PathPaymentConfig,
  sendAsset: Asset,
  sendAmount: string,
  destAsset: Asset
) {
  const horizon = new Horizon.Server(config.horizonUrl);

  const pathsResponse = await horizon
    .strictSendPaths(
      sendAsset,     // source asset
      sendAmount,    // exact amount to send
      [destAsset]    // destination asset(s) — SDK expects Asset[]
    )
    .call();

  if (pathsResponse.records.length === 0) {
    throw new Error(
      `No path found from ${sendAmount} ${sendAsset.getCode()} to ${destAsset.getCode()}`
    );
  }

  return pathsResponse.records;
}

/**
 * Execute a PathPaymentStrictSend — the client sends an exact EURC amount,
 * the escrow receives at least `destMin` USDC.
 *
 * @param config         - Server and account configuration
 * @param escrowAddress  - The FlowGuard contract address
 * @param sendAsset      - The client's asset (e.g. EURC)
 * @param sendAmount     - Exact amount to send (e.g. "9500")
 * @param destAsset      - The escrow's asset (e.g. USDC)
 * @param slippagePct    - Min receive tolerance as a percentage (default 1%)
 * @returns Transaction hash on success
 *
 * @example
 * ```ts
 * const txHash = await pathPaymentStrictSend(
 *   config,
 *   "CABC...ESCROW_CONTRACT",
 *   EURC,
 *   "9500",   // send exactly 9,500 EURC
 *   USDC,
 *   1.0       // accept up to 1% less USDC than estimated
 * );
 * ```
 */
export async function pathPaymentStrictSend(
  config: PathPaymentConfig,
  escrowAddress: string,
  sendAsset: Asset,
  sendAmount: string,
  destAsset: Asset,
  slippagePct: number = 1.0
): Promise<string> {
  const horizon = new Horizon.Server(config.horizonUrl);
  const clientKeypair = Keypair.fromSecret(config.clientSecret);

  // ── Step 1: Discover the best path ──────────────────────────────────────

  const paths = await findStrictSendPaths(config, sendAsset, sendAmount, destAsset);

  const bestPath = paths[0];
  const estimatedDestAmount = parseFloat(bestPath.destination_amount);

  // Apply slippage — the minimum the escrow should receive.
  const destMin = (estimatedDestAmount * (1 - slippagePct / 100)).toFixed(7);

  const intermediaryAssets: Asset[] = bestPath.path.map((p: any) =>
    p.asset_type === "native"
      ? Asset.native()
      : new Asset(p.asset_code!, p.asset_issuer!)
  );

  console.log(`[PathPayment] Best path found:`);
  console.log(`  Send:     = ${sendAmount} ${sendAsset.getCode()}`);
  console.log(`  Receive:  ≥ ${destMin} ${destAsset.getCode()}`);
  console.log(`  Estimate: ${bestPath.destination_amount} ${destAsset.getCode()}`);

  // ── Step 2: Build the transaction ───────────────────────────────────────

  const sourceAccount = await horizon.loadAccount(clientKeypair.publicKey());

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: sendAsset,
        sendAmount: sendAmount,
        destination: escrowAddress,
        destAsset: destAsset,
        destMin: destMin,
        path: intermediaryAssets,
      })
    )
    .setTimeout(30)
    .build();

  // ── Step 3: Sign and submit ─────────────────────────────────────────────

  transaction.sign(clientKeypair);

  const response = await horizon.submitTransaction(transaction);
  const txHash = response.hash;

  console.log(`[PathPayment] ✅ StrictSend successful. Hash: ${txHash}`);
  return txHash;
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility: Get a Quote
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Get a price quote without executing: "How much EURC would I need to
 * deposit exactly 10,000 USDC into the escrow?"
 *
 * Useful for showing the client a preview before they authorize the payment.
 */
export async function getQuoteStrictReceive(
  config: PathPaymentConfig,
  sendAsset: Asset,
  destAsset: Asset,
  destAmount: string
): Promise<{
  estimatedSendAmount: string;
  sendAssetCode: string;
  destAssetCode: string;
  destAmount: string;
  numberOfPaths: number;
}> {
  const paths = await findStrictReceivePaths(
    config,
    sendAsset,
    destAsset,
    destAmount
  );

  return {
    estimatedSendAmount: paths[0].source_amount,
    sendAssetCode: sendAsset.getCode(),
    destAssetCode: destAsset.getCode(),
    destAmount,
    numberOfPaths: paths.length,
  };
}
