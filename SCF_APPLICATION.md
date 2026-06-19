# FlowGuard Stellar Community Fund Application Draft

## Project Name

FlowGuard

## Funding Track

Stellar Community Fund (SCF)

Target request: up to $150,000, depending on grant scope, review feedback, and
required milestones.

## One-Line Summary

FlowGuard is a Soroban-powered milestone escrow platform that helps clients and
freelancers lock, release, and dispute stablecoin payments with transparent
on-chain rules.

## Problem

Freelance and remote work payments often depend on trust, manual invoices, and
centralized platforms that can be expensive or slow. Clients want confidence
that funds are only released when agreed work is delivered. Freelancers want
proof that the budget exists and that payment can be released without weeks of
manual follow-up.

Existing solutions usually fall into one of two weak categories:

- Traditional freelance marketplaces that control payments, charge high fees,
  and limit user ownership.
- Basic crypto transfers that are fast but do not include structured milestone
  approvals, escrow protection, or dispute resolution.

FlowGuard solves this gap with programmable escrow on Stellar.

## Solution

FlowGuard provides milestone-based escrow using Soroban smart contracts. A
client creates an agreement, deposits the full project budget into escrow, and
releases each milestone after approval. If there is a disagreement, either party
can trigger a dispute and a configured arbiter can route the locked milestone
funds.

The system includes:

- A Soroban Rust contract for escrow logic.
- Token transfers through the configured Soroban token contract.
- Client-only authorization for deposits and releases.
- Arbiter-only authorization for dispute resolution.
- A Next.js dashboard for wallet-based interaction.
- A GitHub webhook oracle that can connect merged work to milestone release
  workflows.

## Why Stellar

Stellar is a strong fit for FlowGuard because escrow payments need low fees,
fast settlement, stable asset support, and accessible wallets. Soroban enables
the milestone rules to run transparently on-chain while Stellar's payments
infrastructure can support real-world freelance and business transactions.

FlowGuard can increase Stellar ecosystem activity by encouraging:

- More stablecoin payment flows.
- More Soroban contract usage.
- More wallet-based business workflows.
- More integrations between developer platforms and Stellar payments.

## Current Progress

The repository already includes an MVP foundation:

- Soroban escrow contract in Rust.
- Milestone lifecycle: pending, approved, disputed.
- Full-budget deposit flow.
- Milestone release flow.
- Dispute trigger and arbiter resolution flow.
- Unit tests for happy path, unauthorized access, and dispute resolution.
- Next.js dashboard structure.
- TypeScript oracle service structure.
- GitHub webhook milestone mapping concept.

## Technical Depth

The smart contract is designed around explicit authorization boundaries:

- `initialize` requires the client's authorization.
- `deposit_funds` requires the client's authorization.
- `release_milestone` requires the client's authorization.
- `trigger_dispute` requires authorization from the client or freelancer.
- `resolve_dispute` requires the configured arbiter's authorization.

The Rust test suite uses Soroban SDK test utilities to verify both successful
flows and rejected authorization attempts.

## Target Users

- Freelancers working with milestone-based contracts.
- Clients hiring contractors for software, design, writing, or operations work.
- Agencies that need transparent payment workflows.
- Open-source maintainers receiving milestone-based sponsorship.
- Web3 teams that want payment rails connected to GitHub delivery workflows.

## Ecosystem Impact

FlowGuard can become a practical Stellar-native tool for work payments. It
turns Stellar from a simple payment rail into a programmable trust layer for
service agreements.

Potential ecosystem value:

- Demonstrates a real-world Soroban financial application.
- Encourages stable asset usage in freelance commerce.
- Provides reusable escrow patterns for other Stellar builders.
- Creates a path from developer workflows to on-chain settlement.
- Gives wallets and token issuers another concrete business use case.

## Roadmap

### Milestone 1: Contract Hardening and Deployment

- Add more negative-path tests.
- Add contract events for deposits, releases, disputes, and resolutions.
- Add deployment documentation.
- Deploy to Stellar testnet.
- Publish contract IDs and demo instructions.

### Milestone 2: Dashboard MVP

- Connect Freighter wallet flows end to end.
- Add agreement creation UI.
- Add deposit and milestone release screens.
- Add dispute and arbiter resolution screens.
- Add transaction status and error handling.

### Milestone 3: Oracle and Automation

- Finalize GitHub webhook verification.
- Map merged pull requests to milestone IDs.
- Submit signed Soroban transactions from the oracle.
- Add webhook replay protection and structured logs.
- Add deployment guide for the oracle service.

### Milestone 4: Pilot and Feedback

- Run pilot agreements with early users.
- Collect feedback from freelancers and clients.
- Improve onboarding and agreement templates.
- Add analytics for milestone volume and completion rate.
- Prepare public demo material.

### Milestone 5: Production Readiness

- Complete external contract review or audit preparation.
- Add monitoring and incident response guidance.
- Improve key management and production secret handling.
- Add documentation for stable asset configuration.
- Prepare go-to-market materials for Stellar ecosystem users.

## Suggested Use of Funds

If selected for SCF support, funds would be used for:

- Smart contract hardening and security review.
- Frontend development and wallet UX improvements.
- Oracle reliability, webhook security, and deployment.
- Testnet and early pilot operations.
- User research with freelancers, agencies, and open-source maintainers.
- Documentation, demo content, and ecosystem onboarding.

## Success Metrics

Early success can be measured by:

- Number of escrow agreements created on testnet.
- Number of successful milestone releases.
- Number of completed pilot users or teams.
- Total value escrowed during pilots.
- Number of GitHub-triggered milestone releases.
- User feedback from both clients and freelancers.
- Reusable contract or integration patterns adopted by other builders.

## Competitive Advantage

FlowGuard is not only a demo contract. It combines a Soroban escrow primitive,
a user-facing dashboard, and developer workflow automation. That combination
can make Stellar payments useful in a concrete business process: paying people
for completed work.

## Risks and Mitigations

- Smart contract risk: expand tests, add events, and prepare for review.
- Oracle key risk: improve secret handling and limit oracle permissions.
- User onboarding risk: simplify dashboard flows and provide clear templates.
- Dispute process risk: make arbiter roles explicit and visible before deposit.
- Adoption risk: start with focused pilot users and GitHub-based workflows.

## Why Now

Remote work, open-source funding, and cross-border freelance payments continue
to grow. Stellar already has fast settlement and stable asset rails. Soroban now
enables programmable payment logic that can make escrow safer and more flexible
without forcing users into a closed marketplace.

FlowGuard turns that opportunity into a concrete product path.
