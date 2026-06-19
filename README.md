# FlowGuard

FlowGuard is a milestone-based escrow system for freelance work on Stellar
Soroban. It combines an on-chain Rust smart contract, a Next.js dashboard, and
an optional GitHub webhook oracle that can release milestones when agreed work
is merged.

## What It Does

- Creates escrow agreements between a client and a freelancer.
- Locks the full project budget in a Soroban token contract.
- Releases milestone funds only after client authorization.
- Supports disputes that can only be resolved by the configured arbiter.
- Provides unit tests for happy path, authorization failures, and dispute
  resolution.
- Includes a dashboard for wallet-based escrow management.
- Includes an oracle service for GitHub-driven milestone automation.

## Funding Track Fit

FlowGuard is positioned for the Stellar Community Fund (SCF), the highest-value
track described for projects with technical depth, ecosystem impact, and
real-world adoption potential.

SCF fit:

- Financial application: FlowGuard uses Stellar and Soroban to make freelance
  escrow faster, programmable, and more transparent.
- Real-world adoption: Freelancers, agencies, open-source maintainers, and
  remote teams need milestone-based payments with dispute handling.
- Ecosystem value: The project can drive more token payment activity, wallet
  usage, and Soroban contract interactions.
- Infrastructure tooling: The oracle service connects GitHub workflows to
  on-chain milestone settlement.
- Technical depth: The system includes a Soroban escrow contract, token
  movement, authorization tests, a wallet dashboard, and webhook automation.

The grant proposal draft is available in `SCF_APPLICATION.md`.

## Repository Structure

```text
flowguard/
  contracts/
    flowguard/          Soroban escrow contract written in Rust
  dashboard/            Next.js frontend for users
  oracle/               Express/TypeScript webhook oracle
  SCF_APPLICATION.md     Draft Stellar Community Fund application
  Cargo.toml            Rust workspace configuration
  Cargo.lock            Locked Rust dependency versions
```

## Smart Contract

The contract lives in `contracts/flowguard`.

Core contract methods:

- `initialize` - creates the escrow agreement and milestone schedule.
- `deposit_funds` - transfers the full budget from the client into escrow.
- `release_milestone` - releases a pending milestone to the freelancer.
- `trigger_dispute` - marks a pending milestone as disputed.
- `resolve_dispute` - lets the arbiter route disputed funds to either party.
- `get_agreement`, `get_milestone`, `is_funded` - read-only helpers.

Security model:

- The client must authorize initialization, deposits, and milestone releases.
- Only the client or freelancer can trigger a dispute.
- Only the configured arbiter can resolve a disputed milestone.
- Funds are moved through the configured Soroban token contract.

## Rust and Soroban Configuration

The workspace uses Soroban SDK `26.1.0`.

```toml
[workspace.dependencies]
soroban-sdk = "26.1.0"

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
```

The contract crate is built as both `cdylib` and `rlib` so it can produce WASM
artifacts and run native Rust unit tests.

## Running Contract Tests

From the repository root:

```bash
cargo test -p flowguard
```

The current test suite covers:

- Happy path: initialize, deposit, approve a milestone, and transfer funds.
- Security/auth: a third-party address cannot call `release_milestone`.
- Dispute resolution: a dispute can be triggered, a non-arbiter is rejected,
  and the arbiter can route funds successfully.

## Building the Contract

Install the Soroban target if needed:

```bash
rustup target add wasm32v1-none
```

Build the contract:

```bash
cargo build -p flowguard --target wasm32v1-none --release
```

The WASM artifact is produced at:

```text
target/wasm32v1-none/release/flowguard.wasm
```

## Dashboard

The dashboard is a Next.js app in `dashboard/`.

Install dependencies:

```bash
cd dashboard
npm install
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful scripts:

```bash
npm run build
npm run start
npm run lint
```

## Oracle Service

The oracle is an Express/TypeScript service in `oracle/`. It is designed to
receive GitHub webhook events, map merged pull requests to milestone IDs, and
submit Soroban transactions that release milestones.

Install dependencies:

```bash
cd oracle
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Configure at least:

- `SOROBAN_RPC_URL`
- `SOROBAN_NETWORK_PASSPHRASE`
- `FLOWGUARD_CONTRACT_ID`
- `ORACLE_SECRET_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `MILESTONE_MAP`

Run in development:

```bash
npm run dev
```

Build and start:

```bash
npm run build
npm run start
```

## Git Hygiene

The root `.gitignore` excludes generated and local-only files, including:

- Rust build output: `target/`
- Soroban test snapshots: `test_snapshots/`
- JavaScript dependencies: `node_modules/`
- Next.js build output: `.next/`
- Local environment files: `.env`

Do not commit private keys, webhook secrets, RPC credentials, or local `.env`
files.

## Development Checklist

Before opening a pull request or deploying:

```bash
cargo test -p flowguard
```

```bash
cd dashboard
npm run lint
npm run build
```

```bash
cd oracle
npm run build
```

## Status

This project is an early FlowGuard implementation. Review authorization paths,
token configuration, deployment scripts, and production secret handling before
using it with real funds.
