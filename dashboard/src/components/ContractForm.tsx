"use client";

import { useState, useCallback } from "react";
import { useWallet } from "./WalletProvider";

interface MilestoneInput {
  title: string;
  budget: string;
}

export default function ContractForm() {
  const { isConnected, publicKey } = useWallet();
  const [freelancerKey, setFreelancerKey] = useState("");
  const [arbiterKey, setArbiterKey] = useState("");
  const [tokenSymbol] = useState("USDC");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { title: "Project Kickoff & Planning", budget: "" },
    { title: "Development Phase", budget: "" },
    { title: "Testing & Delivery", budget: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalBudget = milestones.reduce(
    (sum, m) => sum + (parseFloat(m.budget) || 0),
    0
  );

  const addMilestone = useCallback(() => {
    setMilestones((prev) => [
      ...prev,
      { title: `Milestone ${prev.length + 1}`, budget: "" },
    ]);
  }, []);

  const removeMilestone = useCallback((index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateMilestone = useCallback(
    (index: number, field: keyof MilestoneInput, value: string) => {
      setMilestones((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isConnected) return;

      setSubmitting(true);

      // Simulate contract deployment — in production this would invoke the Soroban contract.
      await new Promise((r) => setTimeout(r, 2000));

      console.log("Contract created:", {
        client: publicKey,
        freelancer: freelancerKey,
        arbiter: arbiterKey || undefined,
        token: tokenSymbol,
        milestones: milestones.map((m, i) => ({
          id: i,
          title: m.title,
          budget: parseFloat(m.budget),
        })),
        totalBudget,
      });

      setSubmitting(false);
      setSubmitted(true);
    },
    [isConnected, publicKey, freelancerKey, arbiterKey, tokenSymbol, milestones, totalBudget]
  );

  const isValid =
    isConnected &&
    freelancerKey.length === 56 &&
    freelancerKey.startsWith("G") &&
    milestones.length > 0 &&
    milestones.every((m) => m.title.trim() && parseFloat(m.budget) > 0) &&
    totalBudget > 0;

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 mb-6">
          <svg
            className="h-10 w-10 text-emerald-400"
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
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          Contract Created Successfully
        </h2>
        <p className="text-zinc-400 mb-8">
          Your escrow contract has been deployed to Stellar. You can now fund
          it from the dashboard.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setFreelancerKey("");
            setArbiterKey("");
            setMilestones([
              { title: "Milestone 1", budget: "" },
            ]);
          }}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white
                     bg-gradient-to-r from-violet-600 to-indigo-600
                     hover:from-violet-500 hover:to-indigo-500
                     transition-all cursor-pointer"
        >
          Create Another Contract
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Create Escrow Contract
        </h1>
        <p className="text-zinc-400 mt-1">
          Define the terms of your milestone-based escrow agreement.
        </p>
      </div>

      {/* Parties Section */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Parties
        </h2>

        {/* Client (auto-filled) */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Client (You)
          </label>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isConnected ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isConnected ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              />
            </span>
            <span className="text-sm font-mono text-zinc-300">
              {isConnected && publicKey
                ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
                : "Connect wallet to continue"}
            </span>
          </div>
        </div>

        {/* Freelancer */}
        <div>
          <label
            htmlFor="freelancer-key"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Freelancer / Service Provider
            <span className="text-red-400 ml-1">*</span>
          </label>
          <input
            id="freelancer-key"
            type="text"
            placeholder="G... (Stellar public key)"
            value={freelancerKey}
            onChange={(e) => setFreelancerKey(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50
                       text-white placeholder-zinc-500 font-mono text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50
                       transition-all"
            maxLength={56}
          />
          {freelancerKey && !freelancerKey.startsWith("G") && (
            <p className="mt-1.5 text-xs text-red-400">
              Stellar public keys start with &quot;G&quot;
            </p>
          )}
        </div>

        {/* Arbiter (optional) */}
        <div>
          <label
            htmlFor="arbiter-key"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Arbiter
            <span className="text-zinc-500 ml-2 text-xs font-normal">
              Optional — for dispute resolution
            </span>
          </label>
          <input
            id="arbiter-key"
            type="text"
            placeholder="G... (leave empty if not needed)"
            value={arbiterKey}
            onChange={(e) => setArbiterKey(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50
                       text-white placeholder-zinc-500 font-mono text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50
                       transition-all"
            maxLength={56}
          />
        </div>
      </section>

      {/* Milestones Section */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Milestones
          </h2>
          <button
            type="button"
            onClick={addMilestone}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20
                       transition-all cursor-pointer"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Milestone
          </button>
        </div>

        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <div
              key={index}
              className="group flex items-start gap-3 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/30
                         hover:border-zinc-600/50 transition-all"
            >
              {/* Index Badge */}
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-700/50 text-xs font-bold text-zinc-300 mt-1">
                {index + 1}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="Milestone title"
                  value={milestone.title}
                  onChange={(e) =>
                    updateMilestone(index, "title", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50
                             text-white placeholder-zinc-500 text-sm
                             focus:outline-none focus:ring-2 focus:ring-violet-500/50
                             transition-all"
                />
              </div>

              {/* Budget */}
              <div className="w-40 flex-shrink-0">
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={milestone.budget}
                    onChange={(e) =>
                      updateMilestone(index, "budget", e.target.value)
                    }
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 pr-16 rounded-lg bg-zinc-800/50 border border-zinc-700/50
                               text-white placeholder-zinc-500 text-sm text-right
                               focus:outline-none focus:ring-2 focus:ring-violet-500/50
                               transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">
                    {tokenSymbol}
                  </span>
                </div>
              </div>

              {/* Remove */}
              {milestones.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMilestone(index)}
                  className="flex-shrink-0 p-2 rounded-lg text-zinc-500 hover:text-red-400
                             hover:bg-red-500/10 opacity-0 group-hover:opacity-100
                             transition-all cursor-pointer mt-0.5"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Summary & Submit */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-zinc-400">Total Contract Value</p>
            <p className="text-3xl font-bold text-white mt-1">
              {totalBudget.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              <span className="text-lg text-zinc-400 ml-2">{tokenSymbol}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-400">Milestones</p>
            <p className="text-3xl font-bold text-white mt-1">
              {milestones.length}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full py-4 rounded-xl font-semibold text-sm text-white
                     bg-gradient-to-r from-violet-600 to-indigo-600
                     hover:from-violet-500 hover:to-indigo-500
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-300 shadow-lg shadow-violet-500/20
                     hover:shadow-violet-500/40 cursor-pointer"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Deploying Contract...
            </span>
          ) : !isConnected ? (
            "Connect Wallet to Continue"
          ) : (
            "Deploy Escrow Contract"
          )}
        </button>
      </section>
    </form>
  );
}
