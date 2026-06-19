"use client";

import { useState } from "react";
import type { Milestone, UserRole } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Visual status configuration
// ────────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Pending: {
    label: "Locked",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
    icon: LockIcon,
    barColor: "bg-amber-500/40",
  },
  Approved: {
    label: "Paid",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
    icon: CheckIcon,
    barColor: "bg-emerald-500",
  },
  Disputed: {
    label: "Disputed",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    ring: "ring-red-500/30",
    dot: "bg-red-400",
    icon: AlertIcon,
    barColor: "bg-red-500/60",
  },
} as const;

interface MilestoneTrackerProps {
  milestones: Milestone[];
  userRole: UserRole;
  totalBudget: number;
  funded: boolean;
  tokenSymbol?: string;
  onRelease?: (milestoneId: number) => void;
  onDispute?: (milestoneId: number) => void;
  onSubmitDeliverable?: (milestoneId: number) => void;
}

export default function MilestoneTracker({
  milestones,
  userRole,
  totalBudget,
  funded,
  tokenSymbol = "USDC",
  onRelease,
  onDispute,
  onSubmitDeliverable,
}: MilestoneTrackerProps) {
  const paidAmount = milestones
    .filter((m) => m.status === "Approved")
    .reduce((sum, m) => sum + m.budget, 0);
  const lockedAmount = milestones
    .filter((m) => m.status === "Pending")
    .reduce((sum, m) => sum + m.budget, 0);
  const disputedAmount = milestones
    .filter((m) => m.status === "Disputed")
    .reduce((sum, m) => sum + m.budget, 0);

  const progressPct =
    totalBudget > 0 ? Math.round((paidAmount / totalBudget) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Contract Progress
            </h3>
            <p className="text-3xl font-bold text-white mt-1">
              {progressPct}%
              <span className="text-sm font-normal text-zinc-400 ml-2">
                complete
              </span>
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            funded
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-amber-400 bg-amber-500/10"
          }`}>
            {funded ? "Funded" : "Awaiting Deposit"}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden mb-5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Released"
            amount={paidAmount}
            token={tokenSymbol}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
          />
          <StatCard
            label="Locked"
            amount={lockedAmount}
            token={tokenSymbol}
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
          <StatCard
            label="Disputed"
            amount={disputedAmount}
            token={tokenSymbol}
            color="text-red-400"
            bg="bg-red-500/10"
          />
        </div>
      </div>

      {/* Milestone Pipeline */}
      <div className="space-y-3">
        {milestones.map((milestone, index) => (
          <MilestoneCard
            key={milestone.id}
            milestone={milestone}
            index={index}
            isLast={index === milestones.length - 1}
            userRole={userRole}
            tokenSymbol={tokenSymbol}
            onRelease={onRelease}
            onDispute={onDispute}
            onSubmitDeliverable={onSubmitDeliverable}
          />
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Milestone Card
// ────────────────────────────────────────────────────────────────────────────────

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  isLast: boolean;
  userRole: UserRole;
  tokenSymbol: string;
  onRelease?: (milestoneId: number) => void;
  onDispute?: (milestoneId: number) => void;
  onSubmitDeliverable?: (milestoneId: number) => void;
}

function MilestoneCard({
  milestone,
  index,
  isLast,
  userRole,
  tokenSymbol,
  onRelease,
  onDispute,
  onSubmitDeliverable,
}: MilestoneCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const config = STATUS_CONFIG[milestone.status];
  const StatusIcon = config.icon;

  const handleAction = async (
    action: string,
    handler?: (id: number) => void
  ) => {
    if (!handler) return;
    setLoading(action);
    await new Promise((r) => setTimeout(r, 1200));
    handler(milestone.id);
    setLoading(null);
  };

  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-[27px] top-[68px] bottom-[-12px] w-px bg-zinc-800" />
      )}

      <div
        className={`relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300
          ${config.border} ${config.bg} hover:ring-1 ${config.ring}`}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0 relative z-10">
          <div
            className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center
              ${config.bg} border ${config.border}`}
          >
            <StatusIcon className={`h-4.5 w-4.5 ${config.color}`} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-zinc-500 uppercase">
                  Milestone {index + 1}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider
                    ${config.bg} ${config.color}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${
                    milestone.status === "Pending" ? "animate-pulse" : ""
                  }`} />
                  {config.label}
                </span>
              </div>
              <h4 className="text-base font-semibold text-white mt-1">
                {milestone.title}
              </h4>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-white">
                {milestone.budget.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-zinc-400">{tokenSymbol}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4">
            {/* Client Actions */}
            {userRole === "client" && milestone.status === "Pending" && (
              <>
                <ActionButton
                  label="Approve & Release"
                  loading={loading === "release"}
                  onClick={() => handleAction("release", onRelease)}
                  variant="success"
                />
                <ActionButton
                  label="Dispute"
                  loading={loading === "dispute"}
                  onClick={() => handleAction("dispute", onDispute)}
                  variant="danger"
                />
              </>
            )}

            {/* Freelancer Actions */}
            {userRole === "freelancer" && milestone.status === "Pending" && (
              <>
                <ActionButton
                  label="Submit Deliverable"
                  loading={loading === "submit"}
                  onClick={() =>
                    handleAction("submit", onSubmitDeliverable)
                  }
                  variant="primary"
                />
                <ActionButton
                  label="Raise Dispute"
                  loading={loading === "dispute"}
                  onClick={() => handleAction("dispute", onDispute)}
                  variant="danger"
                />
              </>
            )}

            {/* Disputed */}
            {milestone.status === "Disputed" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <svg
                  className="h-3.5 w-3.5 text-red-400 animate-pulse"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-xs font-medium text-red-400">
                  Awaiting arbiter resolution
                </span>
              </div>
            )}

            {/* Approved */}
            {milestone.status === "Approved" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <svg
                  className="h-3.5 w-3.5 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-xs font-medium text-emerald-400">
                  Funds released to freelancer
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  amount,
  token,
  color,
  bg,
}: {
  label: string;
  amount: number;
  token: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${bg} border border-zinc-800`}>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>
        {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        <span className="text-xs font-normal text-zinc-500 ml-1">
          {token}
        </span>
      </p>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
  variant,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant: "primary" | "success" | "danger";
}) {
  const styles = {
    primary:
      "text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20",
    success:
      "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20",
    danger:
      "text-red-400 bg-red-500/10 hover:bg-red-500/20 border-red-500/20",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold
                  border transition-all disabled:opacity-50 cursor-pointer
                  ${styles[variant]}`}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Icons
// ────────────────────────────────────────────────────────────────────────────────

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}
