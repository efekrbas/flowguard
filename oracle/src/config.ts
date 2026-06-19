import "dotenv/config";

// ────────────────────────────────────────────────────────────────────────────────
// Environment Variable Loader with Validation
// ────────────────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env and fill in all values.`
    );
  }
  return value.trim();
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

// ─── Stellar / Soroban ────────────────────────────────────────────────────────

export const SOROBAN_RPC_URL = requireEnv("SOROBAN_RPC_URL");
export const SOROBAN_NETWORK_PASSPHRASE = requireEnv("SOROBAN_NETWORK_PASSPHRASE");
export const FLOWGUARD_CONTRACT_ID = requireEnv("FLOWGUARD_CONTRACT_ID");
export const ORACLE_SECRET_KEY = requireEnv("ORACLE_SECRET_KEY");

// ─── GitHub Webhook ─────────────────────────────────────────────────────────

export const GITHUB_WEBHOOK_SECRET = requireEnv("GITHUB_WEBHOOK_SECRET");

// ─── Milestone Mapping ─────────────────────────────────────────────────────

/**
 * Maps a branch name (the PR's merge-target branch) to a milestone ID.
 * Example: { "milestone-1": 0, "milestone-2": 1 }
 */
export const MILESTONE_MAP: Record<string, number> = (() => {
  const raw = optionalEnv("MILESTONE_MAP", "{}");
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("MILESTONE_MAP must be a JSON object");
    }
    return parsed as Record<string, number>;
  } catch (err) {
    throw new Error(
      `Invalid MILESTONE_MAP: ${err instanceof Error ? err.message : err}`
    );
  }
})();

// ─── Server ─────────────────────────────────────────────────────────────────

export const PORT = parseInt(optionalEnv("PORT", "3000"), 10);
export const LOG_LEVEL = optionalEnv("LOG_LEVEL", "info");
