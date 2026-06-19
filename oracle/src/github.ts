import crypto from "node:crypto";
import type { Request } from "express";
import { GITHUB_WEBHOOK_SECRET, MILESTONE_MAP } from "./config.js";
import { logger } from "./logger.js";

// ────────────────────────────────────────────────────────────────────────────────
// GitHub Webhook Types (subset relevant to PR events)
// ────────────────────────────────────────────────────────────────────────────────

export interface GitHubPullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    merged: boolean;
    merge_commit_sha: string | null;
    user: { login: string };
    base: {
      ref: string; // target branch (e.g. "main", "milestone-1")
      repo: { full_name: string };
    };
    head: {
      ref: string; // source branch
    };
  };
}

export interface WebhookValidationResult {
  valid: boolean;
  milestoneId?: number;
  reason?: string;
  metadata?: {
    repo: string;
    prNumber: number;
    prTitle: string;
    author: string;
    targetBranch: string;
    sourceBranch: string;
    mergeCommit: string | null;
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Signature Verification
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Verify the GitHub webhook signature using HMAC-SHA256.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing attacks.
 * The raw body (Buffer) must be used — parsed JSON will fail verification
 * because whitespace/encoding can differ.
 *
 * @param rawBody - The raw request body as a Buffer.
 * @param signatureHeader - The `X-Hub-Signature-256` header value.
 * @returns `true` if the signature is valid.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) {
    logger.warn("Missing X-Hub-Signature-256 header");
    return false;
  }

  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest("hex")}`;

  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(signatureHeader, "utf8");

  if (expected.length !== received.length) {
    logger.warn("Signature length mismatch");
    return false;
  }

  if (!crypto.timingSafeEqual(expected, received)) {
    logger.warn("Signature mismatch — possible tampering or wrong secret");
    return false;
  }

  return true;
}

// ────────────────────────────────────────────────────────────────────────────────
// Event Validation
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Validate a GitHub webhook event and extract the milestone ID if applicable.
 *
 * Criteria for triggering a milestone release:
 *   1. Event must be `pull_request` (checked via X-GitHub-Event header).
 *   2. Action must be `closed` with `merged: true`.
 *   3. The PR's target branch must map to a milestone ID in MILESTONE_MAP.
 *
 * @param eventType - The `X-GitHub-Event` header value.
 * @param payload   - The parsed webhook payload.
 * @returns Validation result with milestone ID if criteria are met.
 */
export function validateWebhookEvent(
  eventType: string | undefined,
  payload: GitHubPullRequestPayload
): WebhookValidationResult {
  // ── Gate 1: Must be a pull_request event ──────────────────────────────────

  if (eventType !== "pull_request") {
    return {
      valid: false,
      reason: `Ignoring event type: ${eventType ?? "unknown"}`,
    };
  }

  // ── Gate 2: Must be a merged PR (action=closed + merged=true) ─────────────

  if (payload.action !== "closed") {
    return {
      valid: false,
      reason: `Ignoring PR action: ${payload.action} (need 'closed')`,
    };
  }

  if (!payload.pull_request.merged) {
    return {
      valid: false,
      reason: "PR was closed without merging — skipping",
    };
  }

  // ── Gate 3: Target branch must map to a milestone ─────────────────────────

  const targetBranch = payload.pull_request.base.ref;
  const milestoneId = MILESTONE_MAP[targetBranch];

  if (milestoneId === undefined) {
    return {
      valid: false,
      reason: `Branch "${targetBranch}" has no milestone mapping. ` +
        `Configured branches: [${Object.keys(MILESTONE_MAP).join(", ")}]`,
    };
  }

  // ── All gates passed ──────────────────────────────────────────────────────

  return {
    valid: true,
    milestoneId,
    metadata: {
      repo: payload.pull_request.base.repo.full_name,
      prNumber: payload.pull_request.number,
      prTitle: payload.pull_request.title,
      author: payload.pull_request.user.login,
      targetBranch,
      sourceBranch: payload.pull_request.head.ref,
      mergeCommit: payload.pull_request.merge_commit_sha,
    },
  };
}
