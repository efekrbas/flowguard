// ────────────────────────────────────────────────────────────────────────────────
// FlowGuard Dashboard — Shared Types
// ────────────────────────────────────────────────────────────────────────────────

export type MilestoneStatus = "Pending" | "Approved" | "Disputed";

export interface Milestone {
  id: number;
  title: string;
  budget: number;
  status: MilestoneStatus;
}

export type UserRole = "client" | "freelancer" | "arbiter" | "unknown";

export interface EscrowContract {
  contractId: string;
  client: string;
  freelancer: string;
  arbiter?: string;
  tokenSymbol: string;
  totalBudget: number;
  funded: boolean;
  milestones: Milestone[];
  createdAt: string;
}

export interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  isFreighterInstalled: boolean;
  connecting: boolean;
  error: string | null;
}
