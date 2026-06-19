import express from "express";
import { PORT, FLOWGUARD_CONTRACT_ID, MILESTONE_MAP } from "./config.js";
import { logger } from "./logger.js";
import {
  verifyGitHubSignature,
  validateWebhookEvent,
  type GitHubPullRequestPayload,
} from "./github.js";
import { releaseMilestone } from "./soroban.js";

// ────────────────────────────────────────────────────────────────────────────────
// Express App Setup
// ────────────────────────────────────────────────────────────────────────────────

const app = express();

// Track processed deliveries to prevent duplicate processing.
// In production, replace with Redis or a persistent store.
const processedDeliveries = new Set<string>();

// ────────────────────────────────────────────────────────────────────────────────
// Health Check
// ────────────────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "flowguard-oracle",
    contractId: FLOWGUARD_CONTRACT_ID,
    milestoneMap: MILESTONE_MAP,
    uptime: process.uptime(),
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// GitHub Webhook Endpoint
// ────────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT: We use `express.raw()` to get the raw body as a Buffer.
// This is critical — if we parse JSON first, the HMAC signature check will fail
// because express.json() may alter whitespace/encoding.
//

app.post(
  "/webhook/github",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const requestId = (req.headers["x-github-delivery"] as string) ?? "unknown";
    const log = logger.child({ requestId });

    try {
      // ── Step 1: Verify webhook signature ────────────────────────────────

      const signatureHeader = req.headers["x-hub-signature-256"] as
        | string
        | undefined;

      if (!verifyGitHubSignature(req.body as Buffer, signatureHeader)) {
        log.warn("Webhook signature verification FAILED");
        res.status(403).json({ error: "Invalid signature" });
        return;
      }

      log.debug("Webhook signature verified ✓");

      // ── Step 2: Idempotency check ───────────────────────────────────────

      if (processedDeliveries.has(requestId)) {
        log.info("Duplicate delivery — already processed");
        res.status(200).json({ status: "already_processed" });
        return;
      }

      // ── Step 3: Parse & validate the event ──────────────────────────────

      const payload: GitHubPullRequestPayload = JSON.parse(
        (req.body as Buffer).toString("utf8")
      );
      const eventType = req.headers["x-github-event"] as string | undefined;
      const validation = validateWebhookEvent(eventType, payload);

      if (!validation.valid) {
        log.info({ reason: validation.reason }, "Event skipped");
        res.status(200).json({ status: "skipped", reason: validation.reason });
        return;
      }

      log.info(
        {
          milestoneId: validation.milestoneId,
          pr: `${validation.metadata!.repo}#${validation.metadata!.prNumber}`,
          title: validation.metadata!.prTitle,
          author: validation.metadata!.author,
          branch: `${validation.metadata!.sourceBranch} → ${validation.metadata!.targetBranch}`,
        },
        "🚀 Merged PR matches milestone criteria — triggering on-chain release"
      );

      // ── Step 4: Invoke the Soroban contract ─────────────────────────────

      // Respond to GitHub immediately (webhook timeout is 10s).
      // Process the contract call asynchronously.
      res.status(202).json({
        status: "accepted",
        milestoneId: validation.milestoneId,
        message: "Milestone release transaction submitted",
      });

      // Mark as processed before async work to prevent races.
      processedDeliveries.add(requestId);

      try {
        const txHash = await releaseMilestone(validation.milestoneId!);
        log.info(
          {
            txHash,
            milestoneId: validation.milestoneId,
            pr: validation.metadata!.prNumber,
          },
          "✅ Milestone released successfully"
        );
      } catch (err) {
        // Remove from processed so a retry can attempt again.
        processedDeliveries.delete(requestId);
        log.error(
          {
            error: err instanceof Error ? err.message : String(err),
            milestoneId: validation.milestoneId,
          },
          "❌ Failed to release milestone on-chain"
        );
      }
    } catch (err) {
      log.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Unhandled error processing webhook"
      );
      // Only send if headers haven't been sent yet.
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────────
// Manual Trigger Endpoint (for testing / external API integration)
// ────────────────────────────────────────────────────────────────────────────────
//
// POST /api/release-milestone
// Body: { "milestone_id": 0, "api_key": "..." }
//
// This endpoint lets an external verification API (not GitHub) trigger a
// milestone release. Protected by a simple API key check.
//

app.post("/api/release-milestone", express.json(), async (req, res) => {
  const log = logger.child({ fn: "manual-release" });

  try {
    const { milestone_id, api_key } = req.body as {
      milestone_id?: number;
      api_key?: string;
    };

    // Simple API key check — in production use JWT/OAuth.
    const expectedKey = process.env.API_KEY;
    if (!expectedKey || api_key !== expectedKey) {
      log.warn("Unauthorized manual release attempt");
      res.status(401).json({ error: "Invalid or missing API key" });
      return;
    }

    if (milestone_id === undefined || typeof milestone_id !== "number") {
      res.status(400).json({ error: "milestone_id (number) is required" });
      return;
    }

    log.info({ milestoneId: milestone_id }, "Manual milestone release requested");

    const txHash = await releaseMilestone(milestone_id);

    log.info({ txHash, milestoneId: milestone_id }, "✅ Milestone released");
    res.json({ status: "success", txHash, milestoneId: milestone_id });
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : String(err) },
      "❌ Manual release failed"
    );
    res.status(500).json({
      error: "Failed to release milestone",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Start Server
// ────────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      contractId: FLOWGUARD_CONTRACT_ID,
      milestoneMap: MILESTONE_MAP,
      endpoints: [
        `POST /webhook/github   — GitHub webhook receiver`,
        `POST /api/release-milestone — Manual/API trigger`,
        `GET  /health           — Health check`,
      ],
    },
    `🛡️  FlowGuard Oracle is running on port ${PORT}`
  );
});
