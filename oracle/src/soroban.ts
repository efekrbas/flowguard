import {
  Keypair,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc as StellarRpc,
} from "@stellar/stellar-sdk";
import {
  SOROBAN_RPC_URL,
  SOROBAN_NETWORK_PASSPHRASE,
  FLOWGUARD_CONTRACT_ID,
  ORACLE_SECRET_KEY,
} from "./config.js";
import { logger } from "./logger.js";

// ────────────────────────────────────────────────────────────────────────────────
// Soroban Client — Builds, simulates, signs & submits transactions
// ────────────────────────────────────────────────────────────────────────────────

const server = new StellarRpc.Server(SOROBAN_RPC_URL);
const oracleKeypair = Keypair.fromSecret(ORACLE_SECRET_KEY);
const contract = new Contract(FLOWGUARD_CONTRACT_ID);

const TX_TIMEOUT_SECONDS = 30;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 30;

/**
 * Invoke the `release_milestone` function on the FlowGuard Soroban contract.
 *
 * Flow:
 *   1. Build a transaction with the contract call operation.
 *   2. Simulate to compute resource footprint + fees.
 *   3. Assemble + sign with the oracle's (client's) secret key.
 *   4. Submit and poll until the network confirms or rejects.
 *
 * @param milestoneId - The 0-based milestone index to release.
 * @returns The transaction hash on success.
 * @throws If simulation fails, submission fails, or the tx is rejected.
 */
export async function releaseMilestone(milestoneId: number): Promise<string> {
  const log = logger.child({ milestoneId, fn: "releaseMilestone" });
  log.info("Starting release_milestone invocation");

  // ── 1. Build the raw transaction ──────────────────────────────────────────

  const sourceAccount = await server.getAccount(oracleKeypair.publicKey());

  const rawTx = new TransactionBuilder(sourceAccount, {
    fee: "100000", // 0.01 XLM — generous base fee, simulation will refine
    networkPassphrase: SOROBAN_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "release_milestone",
        nativeToScVal(milestoneId, { type: "u32" })
      )
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  log.debug("Raw transaction built");

  // ── 2. Simulate ───────────────────────────────────────────────────────────

  const simulation = await server.simulateTransaction(rawTx);

  if (StellarRpc.Api.isSimulationError(simulation)) {
    const errorMsg =
      "error" in simulation ? String(simulation.error) : "Unknown simulation error";
    log.error({ error: errorMsg }, "Simulation failed");
    throw new Error(`Simulation failed: ${errorMsg}`);
  }

  log.debug("Simulation succeeded");

  // ── 3. Assemble & sign ────────────────────────────────────────────────────

  const preparedTx = StellarRpc.assembleTransaction(rawTx, simulation).build();
  preparedTx.sign(oracleKeypair);

  log.info({ txHash: preparedTx.hash().toString("hex") }, "Transaction signed");

  // ── 4. Submit & poll ──────────────────────────────────────────────────────

  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    log.error({ response: sendResponse }, "Transaction submission rejected");
    throw new Error(
      `Transaction submission failed: ${JSON.stringify(sendResponse.errorResult)}`
    );
  }

  log.info(
    { hash: sendResponse.hash, status: sendResponse.status },
    "Transaction submitted, polling for confirmation..."
  );

  // Poll for final status.
  const txHash = sendResponse.hash;
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    await sleep(POLL_INTERVAL_MS);

    const getResponse = await server.getTransaction(txHash);

    if (getResponse.status === "SUCCESS") {
      log.info({ txHash, ledger: getResponse.ledger }, "✅ Milestone released on-chain");
      return txHash;
    }

    if (getResponse.status === "FAILED") {
      log.error({ txHash, response: getResponse }, "❌ Transaction failed on-chain");
      throw new Error(`Transaction failed on-chain. Hash: ${txHash}`);
    }

    // status === "NOT_FOUND" — still pending, keep polling
    log.debug({ attempt: attempts }, "Transaction still pending...");
  }

  throw new Error(
    `Transaction ${txHash} not confirmed after ${MAX_POLL_ATTEMPTS} attempts`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
