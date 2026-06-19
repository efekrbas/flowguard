import {
  Keypair,
  TransactionBuilder,
  Networks,
  Horizon,
} from "@stellar/stellar-sdk";

// ────────────────────────────────────────────────────────────────────────────────
// Fiat Off-Ramp via SEP-24 (Interactive Anchor Withdrawal)
// ────────────────────────────────────────────────────────────────────────────────
//
// After a milestone is released, the freelancer holds USDC on Stellar.
// To convert USDC → local fiat (USD, EUR, NGN, etc.), they interact with
// a Stellar Anchor using the SEP-24 protocol.
//
// Flow:
//   1. Discover anchor endpoints from stellar.toml
//   2. Authenticate via SEP-10 (challenge-response)
//   3. Initiate SEP-24 interactive withdrawal
//   4. User completes KYC in the anchor's hosted UI
//   5. Send USDC to the anchor's Stellar account
//   6. Anchor wires fiat to the freelancer's bank account
//   7. Poll for transaction completion
//
// This module implements each step as a reusable function.
// ────────────────────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnchorConfig {
  /** Anchor's home domain (e.g. "anchor.example.com") */
  anchorDomain: string;
  /** Horizon server URL */
  horizonUrl: string;
  /** Network passphrase */
  networkPassphrase: string;
  /** Freelancer's Stellar secret key */
  freelancerSecret: string;
}

interface StellarTomlInfo {
  TRANSFER_SERVER_SEP0024: string;
  WEB_AUTH_ENDPOINT: string;
  SIGNING_KEY: string;
}

interface Sep24WithdrawResponse {
  /** The interactive URL the user must visit (KYC / bank details) */
  url: string;
  /** Anchor-assigned transaction ID for status polling */
  id: string;
  /** Type of flow */
  type: "interactive_customer_info_needed";
}

interface Sep24TransactionStatus {
  transaction: {
    id: string;
    status:
      | "incomplete"
      | "pending_user_transfer_start"
      | "pending_anchor"
      | "pending_stellar"
      | "pending_external"
      | "completed"
      | "expired"
      | "error"
      | "no_market"
      | "too_small"
      | "too_large";
    status_eta?: number;
    amount_in?: string;
    amount_out?: string;
    amount_fee?: string;
    withdraw_anchor_account?: string;
    withdraw_memo?: string;
    withdraw_memo_type?: string;
    message?: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Step 1: Discover Anchor Endpoints
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the anchor's `stellar.toml` to discover SEP-24 and
 * SEP-10 endpoints.
 *
 * The TOML file is always at: `https://{domain}/.well-known/stellar.toml`
 *
 * @example
 * ```ts
 * const info = await discoverAnchor("anchor.example.com");
 * // info.TRANSFER_SERVER_SEP0024 = "https://anchor.example.com/sep24"
 * // info.WEB_AUTH_ENDPOINT       = "https://anchor.example.com/auth"
 * ```
 */
export async function discoverAnchor(
  anchorDomain: string
): Promise<StellarTomlInfo> {
  const tomlUrl = `https://${anchorDomain}/.well-known/stellar.toml`;

  console.log(`[SEP-24] Fetching stellar.toml from ${tomlUrl}`);

  const response = await fetch(tomlUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch stellar.toml: ${response.status}`);
  }

  const tomlText = await response.text();

  // Simple TOML parser for the keys we need.
  // In production, use a proper TOML library (e.g. `toml` or `smol-toml`).
  const getValue = (key: string): string => {
    const regex = new RegExp(`^${key}\\s*=\\s*"(.+)"`, "m");
    const match = tomlText.match(regex);
    if (!match) {
      throw new Error(`Missing ${key} in stellar.toml at ${anchorDomain}`);
    }
    return match[1];
  };

  return {
    TRANSFER_SERVER_SEP0024: getValue("TRANSFER_SERVER_SEP0024"),
    WEB_AUTH_ENDPOINT: getValue("WEB_AUTH_ENDPOINT"),
    SIGNING_KEY: getValue("SIGNING_KEY"),
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Step 2: SEP-10 Authentication
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate with the anchor using SEP-10 (Stellar Web Authentication).
 *
 * Flow:
 *   1. GET /auth?account={publicKey} → receive challenge transaction XDR
 *   2. Verify challenge is from the anchor's SIGNING_KEY
 *   3. Sign the challenge with the freelancer's key
 *   4. POST /auth with the signed XDR → receive a JWT token
 *
 * @returns A JWT token string for subsequent API calls.
 */
export async function authenticateSep10(
  webAuthEndpoint: string,
  serverSigningKey: string,
  freelancerSecret: string,
  networkPassphrase: string
): Promise<string> {
  const keypair = Keypair.fromSecret(freelancerSecret);
  const publicKey = keypair.publicKey();

  console.log(`[SEP-10] Requesting auth challenge for ${publicKey}`);

  // ── Request the challenge ─────────────────────────────────────────────

  const challengeResponse = await fetch(
    `${webAuthEndpoint}?account=${publicKey}`
  );

  if (!challengeResponse.ok) {
    throw new Error(
      `SEP-10 challenge request failed: ${challengeResponse.status}`
    );
  }

  const { transaction: challengeXdr, network_passphrase } =
    (await challengeResponse.json()) as {
      transaction: string;
      network_passphrase: string;
    };

  // ── Verify network passphrase matches ─────────────────────────────────

  if (network_passphrase !== networkPassphrase) {
    throw new Error(
      `Network passphrase mismatch: expected "${networkPassphrase}", ` +
        `got "${network_passphrase}"`
    );
  }

  // ── Reconstruct, verify, and sign ─────────────────────────────────────

  const challengeTx = TransactionBuilder.fromXDR(
    challengeXdr,
    networkPassphrase
  );

  // Verify the challenge was signed by the anchor's SIGNING_KEY.
  const serverKeypair = Keypair.fromPublicKey(serverSigningKey);
  const txHash = challengeTx.hash();

  const serverSigned = challengeTx.signatures.some((sig) => {
    try {
      return serverKeypair.verify(txHash, sig.signature());
    } catch {
      return false;
    }
  });

  if (!serverSigned) {
    throw new Error(
      "Challenge transaction was NOT signed by the anchor's SIGNING_KEY. " +
        "Possible man-in-the-middle attack."
    );
  }

  // Sign with the freelancer's key.
  challengeTx.sign(keypair);

  const signedXdr = challengeTx.toEnvelope().toXDR("base64");

  // ── Submit the signed challenge ───────────────────────────────────────

  const tokenResponse = await fetch(webAuthEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedXdr }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`SEP-10 token request failed: ${errorBody}`);
  }

  const { token } = (await tokenResponse.json()) as { token: string };

  console.log(`[SEP-10] ✅ Authenticated. Token obtained.`);
  return token;
}

// ────────────────────────────────────────────────────────────────────────────────
// Step 3: Initiate SEP-24 Interactive Withdrawal
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Start a SEP-24 interactive withdrawal.
 *
 * The anchor returns a URL where the freelancer completes KYC and enters
 * bank details. After completing the interactive flow, the anchor provides
 * a Stellar address and memo for the freelancer to send USDC to.
 *
 * @param transferServerUrl  - The anchor's SEP-24 transfer server
 * @param authToken          - JWT from SEP-10 authentication
 * @param assetCode          - The asset to withdraw (e.g. "USDC")
 * @param amount             - Amount to withdraw
 * @param freelancerPublicKey - The freelancer's Stellar public key
 * @returns The interactive URL and transaction ID
 */
export async function initiateWithdrawal(
  transferServerUrl: string,
  authToken: string,
  assetCode: string,
  amount: string,
  freelancerPublicKey: string
): Promise<Sep24WithdrawResponse> {
  console.log(
    `[SEP-24] Initiating ${assetCode} withdrawal for ${amount}`
  );

  const response = await fetch(
    `${transferServerUrl}/transactions/withdraw/interactive`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        asset_code: assetCode,
        amount: amount,
        account: freelancerPublicKey,
        // Optional: specify fiat currency preference
        // dest: "bank_account_id",
        // dest_extra: "routing_number",
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SEP-24 withdrawal initiation failed: ${errorBody}`);
  }

  const data = (await response.json()) as Sep24WithdrawResponse;

  console.log(`[SEP-24] ✅ Interactive URL received:`);
  console.log(`  URL: ${data.url}`);
  console.log(`  Transaction ID: ${data.id}`);
  console.log(`  → Open this URL in a browser to complete KYC and enter bank details.`);

  return data;
}

// ────────────────────────────────────────────────────────────────────────────────
// Step 4: Poll Withdrawal Status
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Poll the anchor for the current status of a SEP-24 withdrawal.
 *
 * Status progression for a typical withdrawal:
 *   incomplete → pending_user_transfer_start → pending_anchor →
 *   pending_external → completed
 *
 * @param transferServerUrl - The anchor's SEP-24 transfer server
 * @param authToken         - JWT from SEP-10
 * @param transactionId     - The anchor-assigned transaction ID
 * @returns Current transaction status
 */
export async function getWithdrawalStatus(
  transferServerUrl: string,
  authToken: string,
  transactionId: string
): Promise<Sep24TransactionStatus> {
  const response = await fetch(
    `${transferServerUrl}/transaction?id=${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get transaction status: ${response.status}`
    );
  }

  return (await response.json()) as Sep24TransactionStatus;
}

/**
 * Wait for the anchor to be ready to receive the freelancer's USDC.
 *
 * Polls until the status is `pending_user_transfer_start`, which means
 * the freelancer has completed KYC and the anchor is waiting for the
 * Stellar payment.
 *
 * @returns The anchor's receiving Stellar address and memo.
 */
export async function waitForTransferReady(
  transferServerUrl: string,
  authToken: string,
  transactionId: string,
  pollIntervalMs: number = 5_000,
  maxAttempts: number = 120
): Promise<{
  anchorAccount: string;
  memo: string;
  memoType: string;
}> {
  console.log(`[SEP-24] Polling for transfer-ready status...`);

  for (let i = 0; i < maxAttempts; i++) {
    const status = await getWithdrawalStatus(
      transferServerUrl,
      authToken,
      transactionId
    );

    const txStatus = status.transaction.status;
    console.log(
      `[SEP-24] Poll ${i + 1}/${maxAttempts}: status = ${txStatus}`
    );

    if (txStatus === "pending_user_transfer_start") {
      const anchorAccount = status.transaction.withdraw_anchor_account;
      const memo = status.transaction.withdraw_memo;
      const memoType = status.transaction.withdraw_memo_type || "text";

      if (!anchorAccount || !memo) {
        throw new Error(
          "Anchor returned pending_user_transfer_start but missing " +
            "withdraw_anchor_account or withdraw_memo"
        );
      }

      console.log(`[SEP-24] ✅ Anchor ready to receive funds:`);
      console.log(`  Account: ${anchorAccount}`);
      console.log(`  Memo:    ${memo} (${memoType})`);

      return { anchorAccount, memo, memoType };
    }

    if (
      txStatus === "error" ||
      txStatus === "expired" ||
      txStatus === "no_market"
    ) {
      throw new Error(
        `Withdrawal failed with status: ${txStatus}. ` +
          `Message: ${status.transaction.message || "none"}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Withdrawal not ready after ${maxAttempts} polls. ` +
      `User may not have completed the interactive flow.`
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Step 5: Send USDC to the Anchor
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Send the freelancer's USDC to the anchor's Stellar account.
 *
 * This is a standard Stellar payment — the anchor will process the fiat
 * wire once they confirm receipt on the ledger.
 *
 * @param config         - Horizon and account config
 * @param anchorAccount  - Anchor's receiving Stellar address
 * @param memo           - Memo required by the anchor (identifies the withdrawal)
 * @param memoType       - Memo type (usually "text" or "hash")
 * @param amount         - Amount of USDC to send
 * @param assetCode      - Asset code (e.g. "USDC")
 * @param assetIssuer    - Asset issuer public key
 * @returns Transaction hash
 */
export async function sendToAnchor(
  config: AnchorConfig,
  anchorAccount: string,
  memo: string,
  memoType: "text" | "hash" | "id",
  amount: string,
  assetCode: string,
  assetIssuer: string
): Promise<string> {
  const { Memo, Operation, Asset } = await import("@stellar/stellar-sdk");

  const horizon = new Horizon.Server(config.horizonUrl);
  const freelancerKeypair = Keypair.fromSecret(config.freelancerSecret);

  const sourceAccount = await horizon.loadAccount(
    freelancerKeypair.publicKey()
  );

  // Build the memo based on type.
  let txMemo;
  switch (memoType) {
    case "text":
      txMemo = Memo.text(memo);
      break;
    case "hash":
      txMemo = Memo.hash(memo);
      break;
    case "id":
      txMemo = Memo.id(memo);
      break;
    default:
      txMemo = Memo.text(memo);
  }

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: anchorAccount,
        asset: new Asset(assetCode, assetIssuer),
        amount: amount,
      })
    )
    .addMemo(txMemo)
    .setTimeout(30)
    .build();

  transaction.sign(freelancerKeypair);

  const response = await horizon.submitTransaction(transaction);
  const txHash = response.hash;

  console.log(`[SEP-24] ✅ USDC sent to anchor. Hash: ${txHash}`);
  return txHash;
}

// ────────────────────────────────────────────────────────────────────────────────
// Complete Off-Ramp Orchestrator
// ────────────────────────────────────────────────────────────────────────────────

/**
 * End-to-end fiat off-ramp flow.
 *
 * Orchestrates the complete SEP-24 withdrawal:
 *   1. Discover → 2. Authenticate → 3. Initiate → 4. Wait for KYC →
 *   5. Send USDC → 6. Wait for fiat wire
 *
 * @returns Object with the interactive URL (for the freelancer's browser)
 *          and a `complete()` function to call after KYC is done.
 *
 * @example
 * ```ts
 * const offramp = await initiateOfframp({
 *   anchorDomain: "anchor.mybank.com",
 *   horizonUrl: "https://horizon.stellar.org",
 *   networkPassphrase: Networks.PUBLIC,
 *   freelancerSecret: "SABC...SECRET",
 * }, "USDC", "GA5ZSE...ISSUER", "5000");
 *
 * // Show offramp.interactiveUrl to the freelancer in a browser/webview.
 * // Once they complete KYC:
 * const result = await offramp.complete();
 * console.log(result); // { txHash, finalStatus }
 * ```
 */
export async function initiateOfframp(
  config: AnchorConfig,
  assetCode: string,
  assetIssuer: string,
  amount: string
): Promise<{
  interactiveUrl: string;
  transactionId: string;
  complete: () => Promise<{ txHash: string; finalStatus: string }>;
}> {
  // ── 1. Discover ───────────────────────────────────────────────────────

  const tomlInfo = await discoverAnchor(config.anchorDomain);

  // ── 2. Authenticate ───────────────────────────────────────────────────

  const authToken = await authenticateSep10(
    tomlInfo.WEB_AUTH_ENDPOINT,
    tomlInfo.SIGNING_KEY,
    config.freelancerSecret,
    config.networkPassphrase
  );

  // ── 3. Initiate withdrawal ────────────────────────────────────────────

  const freelancerKeypair = Keypair.fromSecret(config.freelancerSecret);
  const withdrawResult = await initiateWithdrawal(
    tomlInfo.TRANSFER_SERVER_SEP0024,
    authToken,
    assetCode,
    amount,
    freelancerKeypair.publicKey()
  );

  // Return the interactive URL and a completion function.
  return {
    interactiveUrl: withdrawResult.url,
    transactionId: withdrawResult.id,

    /**
     * Call this after the freelancer has completed the interactive KYC flow.
     * It will:
     *   1. Wait for the anchor to be ready (status: pending_user_transfer_start)
     *   2. Send USDC to the anchor's account
     *   3. Poll until the fiat wire is completed
     */
    complete: async () => {
      // ── 4. Wait for anchor to be ready ────────────────────────────────

      const { anchorAccount, memo, memoType } = await waitForTransferReady(
        tomlInfo.TRANSFER_SERVER_SEP0024,
        authToken,
        withdrawResult.id
      );

      // ── 5. Send USDC to the anchor ───────────────────────────────────

      const txHash = await sendToAnchor(
        config,
        anchorAccount,
        memo,
        memoType as "text" | "hash" | "id",
        amount,
        assetCode,
        assetIssuer
      );

      // ── 6. Poll until completed ──────────────────────────────────────

      console.log(`[SEP-24] Waiting for anchor to process fiat wire...`);

      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));

        const status = await getWithdrawalStatus(
          tomlInfo.TRANSFER_SERVER_SEP0024,
          authToken,
          withdrawResult.id
        );

        console.log(
          `[SEP-24] Status: ${status.transaction.status}` +
            (status.transaction.status_eta
              ? ` (ETA: ${status.transaction.status_eta}s)`
              : "")
        );

        if (status.transaction.status === "completed") {
          console.log(`[SEP-24] ✅ Fiat withdrawal COMPLETE!`);
          console.log(
            `  Amount out: ${status.transaction.amount_out} fiat`
          );
          console.log(`  Fee:        ${status.transaction.amount_fee}`);
          return { txHash, finalStatus: "completed" };
        }

        if (
          status.transaction.status === "error" ||
          status.transaction.status === "expired"
        ) {
          throw new Error(
            `Withdrawal failed: ${status.transaction.status} — ` +
              (status.transaction.message || "no details")
          );
        }
      }

      console.log(
        `[SEP-24] ⏳ Fiat wire still pending. Check back later with tx ID: ${withdrawResult.id}`
      );
      return { txHash, finalStatus: "pending_external" };
    },
  };
}
