"use client";

import { useState } from "react";
import MilestoneTracker from "@/components/MilestoneTracker";
import type { Milestone, EscrowContract } from "@/types";

// Mock data for demonstration purposes
const MOCK_CONTRACT: EscrowContract = {
  contractId: "CABC1234XYZ...ESCROW",
  client: "GCJ5P245...XYZ",
  freelancer: "GBCX1234...ABC",
  tokenSymbol: "USDC",
  totalBudget: 15000,
  funded: true,
  createdAt: new Date().toISOString(),
  milestones: [
    {
      id: 1,
      title: "Project Kickoff & Planning",
      budget: 3000,
      status: "Approved",
    },
    {
      id: 2,
      title: "Core Architecture & Design",
      budget: 5000,
      status: "Approved",
    },
    {
      id: 3,
      title: "Frontend Development",
      budget: 4000,
      status: "Pending",
    },
    {
      id: 4,
      title: "QA, Testing & Final Delivery",
      budget: 3000,
      status: "Pending",
    },
  ],
};

export default function Dashboard() {
  const [contract, setContract] = useState<EscrowContract>(MOCK_CONTRACT);

  // In a real app, these would invoke Soroban contract functions.
  const handleRelease = (id: number) => {
    setContract((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) =>
        m.id === id ? { ...m, status: "Approved" } : m
      ),
    }));
  };

  const handleDispute = (id: number) => {
    setContract((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) =>
        m.id === id ? { ...m, status: "Disputed" } : m
      ),
    }));
  };

  const handleSubmitDeliverable = (id: number) => {
    console.log(`Deliverable submitted for milestone ${id}`);
    alert("Deliverable submitted to client for review.");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Active Contract</h1>
          <p className="text-zinc-400 mt-1 flex items-center gap-2">
            Contract ID:
            <span className="font-mono text-xs bg-zinc-800/50 px-2 py-0.5 rounded text-zinc-300">
              {contract.contractId}
            </span>
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-right">
            <p className="text-zinc-500 text-xs uppercase font-semibold tracking-wider">
              Role
            </p>
            <p className="font-medium text-violet-400">Client (View)</p>
          </div>
        </div>
      </div>

      {/* Contract Details */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Client
          </p>
          <p className="font-mono text-sm text-zinc-300">{contract.client}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Freelancer
          </p>
          <p className="font-mono text-sm text-zinc-300">
            {contract.freelancer}
          </p>
        </div>
      </div>

      {/* Pipeline Tracker */}
      <MilestoneTracker
        milestones={contract.milestones}
        userRole="client" // Toggle this to 'freelancer' to see different buttons
        totalBudget={contract.totalBudget}
        funded={contract.funded}
        tokenSymbol={contract.tokenSymbol}
        onRelease={handleRelease}
        onDispute={handleDispute}
        onSubmitDeliverable={handleSubmitDeliverable}
      />
    </div>
  );
}
