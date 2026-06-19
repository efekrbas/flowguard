#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Vec};

// ────────────────────────────────────────────────────────────────────────────────
// Error Codes
// ────────────────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FlowGuardError {
    /// Contract has already been initialized.
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet.
    NotInitialized = 2,
    /// Caller is not authorized for this action.
    Unauthorized = 3,
    /// The referenced milestone does not exist.
    MilestoneNotFound = 4,
    /// Milestone is not in the expected status for the requested action.
    InvalidMilestoneStatus = 5,
    /// The escrow has already been fully funded.
    AlreadyFunded = 6,
    /// The deposit amount does not match the total budget.
    DepositMismatch = 7,
    /// The sum of milestone budgets does not equal the total budget.
    BudgetMismatch = 8,
    /// Milestone list cannot be empty.
    EmptyMilestones = 9,
    /// The escrow has not been funded yet.
    NotFunded = 10,
}

// ────────────────────────────────────────────────────────────────────────────────
// Data Types
// ────────────────────────────────────────────────────────────────────────────────

/// Status progression for each milestone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    /// Milestone is created but funds have not been released.
    Pending,
    /// Client (or oracle) has approved; funds released to the freelancer.
    Approved,
    /// A dispute has been raised; funds are locked until arbiter resolves.
    Disputed,
}

/// A single milestone within the escrow agreement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    /// Unique identifier for the milestone (0-indexed).
    pub id: u32,
    /// Budget allocated to this milestone (in the token's smallest unit).
    pub budget: i128,
    /// Current lifecycle status.
    pub status: MilestoneStatus,
}

/// Top-level escrow agreement stored on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowAgreement {
    /// The party funding the escrow (client / buyer).
    pub client: Address,
    /// The party receiving milestone payouts (freelancer / service provider).
    pub freelancer: Address,
    /// Optional arbiter for dispute resolution. If `None`, disputes cannot be raised.
    pub arbiter: Option<Address>,
    /// Address of the token contract used for settlement (e.g. USDC SAC).
    pub token: Address,
    /// Total budget across all milestones.
    pub total_budget: i128,
    /// Whether the client has deposited the full budget into escrow.
    pub funded: bool,
    /// Ordered list of milestones.
    pub milestones: Vec<Milestone>,
}

/// Storage keys for the contract's persistent ledger entries.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Stores the `EscrowAgreement`.
    Agreement,
}

// ────────────────────────────────────────────────────────────────────────────────
// Contract
// ────────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct FlowGuardContract;

#[contractimpl]
impl FlowGuardContract {
    // ────────────────────────────────────────────────────────────────────
    // Initialize
    // ────────────────────────────────────────────────────────────────────

    /// Set up a new escrow agreement.
    ///
    /// # Arguments
    /// * `client`     – Address of the party funding the escrow.
    /// * `freelancer` – Address of the service provider receiving payouts.
    /// * `arbiter`    – Optional arbiter address for dispute resolution.
    /// * `token`      – Address of the Stellar Asset Contract (e.g. USDC).
    /// * `milestones` – Vector of `(budget_per_milestone)` values. IDs are
    ///                  assigned sequentially starting from 0.
    /// * `total_budget` – Must equal the sum of all milestone budgets.
    ///
    /// # Errors
    /// * `AlreadyInitialized` – if the contract was previously initialized.
    /// * `EmptyMilestones`    – if no milestones are provided.
    /// * `BudgetMismatch`     – if milestone budgets don't sum to `total_budget`.
    pub fn initialize(
        env: Env,
        client: Address,
        freelancer: Address,
        arbiter: Option<Address>,
        token: Address,
        milestone_budgets: Vec<i128>,
        total_budget: i128,
    ) -> Result<(), FlowGuardError> {
        // Prevent re-initialization.
        if env.storage().persistent().has(&DataKey::Agreement) {
            return Err(FlowGuardError::AlreadyInitialized);
        }

        // Validate inputs.
        if milestone_budgets.is_empty() {
            return Err(FlowGuardError::EmptyMilestones);
        }

        // Build milestone structs and verify budget sum.
        let mut milestones = Vec::new(&env);
        let mut budget_sum: i128 = 0;

        for (i, budget) in milestone_budgets.iter().enumerate() {
            budget_sum += budget;
            milestones.push_back(Milestone {
                id: i as u32,
                budget,
                status: MilestoneStatus::Pending,
            });
        }

        if budget_sum != total_budget {
            return Err(FlowGuardError::BudgetMismatch);
        }

        // The client must authorize the initialization.
        client.require_auth();

        let agreement = EscrowAgreement {
            client,
            freelancer,
            arbiter,
            token,
            total_budget,
            funded: false,
            milestones,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Agreement, &agreement);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────
    // Deposit Funds
    // ────────────────────────────────────────────────────────────────────

    /// Lock the full contract budget into the escrow.
    ///
    /// Transfers `total_budget` of the configured token from the client's
    /// account to this contract's address.
    ///
    /// # Errors
    /// * `NotInitialized` – contract not yet initialized.
    /// * `AlreadyFunded`  – funds were already deposited.
    /// * `Unauthorized`   – caller is not the client.
    pub fn deposit_funds(env: Env) -> Result<(), FlowGuardError> {
        let mut agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        if agreement.funded {
            return Err(FlowGuardError::AlreadyFunded);
        }

        // Only the client can deposit.
        agreement.client.require_auth();

        // Transfer tokens from the client to this contract.
        let token_client = token::Client::new(&env, &agreement.token);
        token_client.transfer(
            &agreement.client,
            &env.current_contract_address(),
            &agreement.total_budget,
        );

        agreement.funded = true;

        env.storage()
            .persistent()
            .set(&DataKey::Agreement, &agreement);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────
    // Release Milestone
    // ────────────────────────────────────────────────────────────────────

    /// Approve and release a specific milestone's funds to the freelancer.
    ///
    /// Only the **client** can call this. The milestone must be in `Pending`
    /// status (it cannot be already `Approved` or currently `Disputed`).
    ///
    /// # Arguments
    /// * `milestone_id` – The 0-based ID of the milestone to release.
    ///
    /// # Errors
    /// * `NotInitialized`       – contract not yet initialized.
    /// * `NotFunded`            – escrow has not been funded.
    /// * `MilestoneNotFound`    – no milestone with this ID exists.
    /// * `InvalidMilestoneStatus` – milestone is not `Pending`.
    /// * `Unauthorized`         – caller is not the client.
    pub fn release_milestone(env: Env, milestone_id: u32) -> Result<(), FlowGuardError> {
        let mut agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        if !agreement.funded {
            return Err(FlowGuardError::NotFunded);
        }

        // Authorization: only client can release.
        agreement.client.require_auth();

        // Look up the milestone.
        let idx = milestone_id as u32;
        let milestone: Milestone = agreement
            .milestones
            .get(idx)
            .ok_or(FlowGuardError::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Pending {
            return Err(FlowGuardError::InvalidMilestoneStatus);
        }

        // Transfer the milestone budget to the freelancer.
        let token_client = token::Client::new(&env, &agreement.token);
        token_client.transfer(
            &env.current_contract_address(),
            &agreement.freelancer,
            &milestone.budget,
        );

        // Update milestone status.
        let updated = Milestone {
            id: milestone.id,
            budget: milestone.budget,
            status: MilestoneStatus::Approved,
        };
        agreement.milestones.set(idx, updated);

        env.storage()
            .persistent()
            .set(&DataKey::Agreement, &agreement);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────
    // Trigger Dispute
    // ────────────────────────────────────────────────────────────────────

    /// Flag a milestone as disputed, locking its funds.
    ///
    /// Either the **client** or the **freelancer** may trigger a dispute.
    /// The milestone must be in `Pending` status. An arbiter must have been
    /// set during initialization.
    ///
    /// # Arguments
    /// * `caller`       – The address raising the dispute (must be client or freelancer).
    /// * `milestone_id` – The 0-based ID of the milestone to dispute.
    ///
    /// # Errors
    /// * `NotInitialized`       – contract not yet initialized.
    /// * `NotFunded`            – escrow has not been funded.
    /// * `Unauthorized`         – caller is neither client nor freelancer,
    ///                            or no arbiter was configured.
    /// * `MilestoneNotFound`    – no milestone with this ID exists.
    /// * `InvalidMilestoneStatus` – milestone is not `Pending`.
    pub fn trigger_dispute(
        env: Env,
        caller: Address,
        milestone_id: u32,
    ) -> Result<(), FlowGuardError> {
        let mut agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        if !agreement.funded {
            return Err(FlowGuardError::NotFunded);
        }

        // Must have an arbiter configured.
        if agreement.arbiter.is_none() {
            return Err(FlowGuardError::Unauthorized);
        }

        // Only client or freelancer can trigger.
        if caller != agreement.client && caller != agreement.freelancer {
            return Err(FlowGuardError::Unauthorized);
        }
        caller.require_auth();

        let idx = milestone_id as u32;
        let milestone: Milestone = agreement
            .milestones
            .get(idx)
            .ok_or(FlowGuardError::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Pending {
            return Err(FlowGuardError::InvalidMilestoneStatus);
        }

        let updated = Milestone {
            id: milestone.id,
            budget: milestone.budget,
            status: MilestoneStatus::Disputed,
        };
        agreement.milestones.set(idx, updated);

        env.storage()
            .persistent()
            .set(&DataKey::Agreement, &agreement);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────
    // Resolve Dispute
    // ────────────────────────────────────────────────────────────────────

    /// Arbiter resolves a disputed milestone.
    ///
    /// The arbiter decides whether the freelancer or the client receives the
    /// locked funds. Only the designated **arbiter** can call this.
    ///
    /// # Arguments
    /// * `milestone_id`         – The 0-based ID of the disputed milestone.
    /// * `release_to_freelancer` – `true` to pay the freelancer, `false` to
    ///                            refund the client.
    ///
    /// # Errors
    /// * `NotInitialized`       – contract not yet initialized.
    /// * `Unauthorized`         – caller is not the arbiter.
    /// * `MilestoneNotFound`    – no milestone with this ID exists.
    /// * `InvalidMilestoneStatus` – milestone is not `Disputed`.
    pub fn resolve_dispute(
        env: Env,
        milestone_id: u32,
        release_to_freelancer: bool,
    ) -> Result<(), FlowGuardError> {
        let mut agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        // Must have an arbiter.
        let arbiter = agreement
            .arbiter
            .clone()
            .ok_or(FlowGuardError::Unauthorized)?;

        // Only the arbiter can resolve disputes.
        arbiter.require_auth();

        let idx = milestone_id as u32;
        let milestone: Milestone = agreement
            .milestones
            .get(idx)
            .ok_or(FlowGuardError::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Disputed {
            return Err(FlowGuardError::InvalidMilestoneStatus);
        }

        // Transfer funds based on the arbiter's decision.
        let token_client = token::Client::new(&env, &agreement.token);
        let recipient = if release_to_freelancer {
            &agreement.freelancer
        } else {
            &agreement.client
        };

        token_client.transfer(
            &env.current_contract_address(),
            recipient,
            &milestone.budget,
        );

        // Mark as approved regardless of direction (funds have been disbursed).
        let updated = Milestone {
            id: milestone.id,
            budget: milestone.budget,
            status: MilestoneStatus::Approved,
        };
        agreement.milestones.set(idx, updated);

        env.storage()
            .persistent()
            .set(&DataKey::Agreement, &agreement);

        Ok(())
    }

    // ────────────────────────────────────────────────────────────────────
    // View Functions (Read-only)
    // ────────────────────────────────────────────────────────────────────

    /// Returns the full escrow agreement, including all milestones.
    pub fn get_agreement(env: Env) -> Result<EscrowAgreement, FlowGuardError> {
        env.storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)
    }

    /// Returns a single milestone by ID.
    pub fn get_milestone(env: Env, milestone_id: u32) -> Result<Milestone, FlowGuardError> {
        let agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        agreement
            .milestones
            .get(milestone_id)
            .ok_or(FlowGuardError::MilestoneNotFound)
    }

    /// Returns `true` if the escrow has been fully funded.
    pub fn is_funded(env: Env) -> Result<bool, FlowGuardError> {
        let agreement: EscrowAgreement = env
            .storage()
            .persistent()
            .get(&DataKey::Agreement)
            .ok_or(FlowGuardError::NotInitialized)?;

        Ok(agreement.funded)
    }
}

// ────────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{StellarAssetClient, TokenClient};
    use soroban_sdk::{vec, Env};

    /// Helper: deploys a test token and mints `amount` to `to`.
    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        (
            token::Client::new(env, &sac.address()),
            StellarAssetClient::new(env, &sac.address()),
        )
    }

    fn setup_env() -> (
        Env,
        Address, // contract id
        Address, // client
        Address, // freelancer
        Address, // arbiter
        Address, // token address
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(FlowGuardContract, ());
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);

        // Deploy a test USDC-like token.
        let admin = Address::generate(&env);
        let (_, sac_admin) = create_token(&env, &admin);

        // Mint tokens to the client so they can deposit.
        sac_admin.mint(&client_addr, &10_000_000);

        (
            env,
            contract_id,
            client_addr,
            freelancer,
            arbiter,
            sac_admin.address.clone(),
        )
    }

    #[test]
    fn test_full_happy_path() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        // 1. Initialize with 3 milestones (3M + 3M + 4M = 10M).
        let budgets = vec![&env, 3_000_000_i128, 3_000_000_i128, 4_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );

        // Verify initialization.
        let agreement = contract.get_agreement();
        assert_eq!(agreement.client, client);
        assert_eq!(agreement.freelancer, freelancer);
        assert_eq!(agreement.milestones.len(), 3);
        assert!(!agreement.funded);

        // 2. Deposit funds.
        contract.deposit_funds();
        assert!(contract.is_funded());

        // 3. Release milestone 0.
        contract.release_milestone(&0);
        let m0 = contract.get_milestone(&0);
        assert_eq!(m0.status, MilestoneStatus::Approved);

        // Verify freelancer received the funds.
        let token_client = TokenClient::new(&env, &token_addr);
        assert_eq!(token_client.balance(&freelancer), 3_000_000);

        // 4. Release milestone 1.
        contract.release_milestone(&1);
        let m1 = contract.get_milestone(&1);
        assert_eq!(m1.status, MilestoneStatus::Approved);
        assert_eq!(token_client.balance(&freelancer), 6_000_000);
    }

    #[test]
    fn test_dispute_and_resolve_to_freelancer() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        let budgets = vec![&env, 5_000_000_i128, 5_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );
        contract.deposit_funds();

        // Freelancer disputes milestone 0.
        contract.trigger_dispute(&freelancer, &0);
        let m = contract.get_milestone(&0);
        assert_eq!(m.status, MilestoneStatus::Disputed);

        // Arbiter resolves in freelancer's favor.
        contract.resolve_dispute(&0, &true);
        let m_resolved = contract.get_milestone(&0);
        assert_eq!(m_resolved.status, MilestoneStatus::Approved);

        let token_client = TokenClient::new(&env, &token_addr);
        assert_eq!(token_client.balance(&freelancer), 5_000_000);
    }

    #[test]
    fn test_dispute_and_resolve_to_client() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        let budgets = vec![&env, 5_000_000_i128, 5_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );
        contract.deposit_funds();

        // Client disputes milestone 1.
        contract.trigger_dispute(&client, &1);

        // Arbiter resolves in client's favor (refund).
        contract.resolve_dispute(&1, &false);

        let token_client = TokenClient::new(&env, &token_addr);
        // Client started with 10M, deposited 10M, got 5M back.
        assert_eq!(token_client.balance(&client), 5_000_000);
    }

    #[test]
    #[should_panic]
    fn test_cannot_release_disputed_milestone() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        let budgets = vec![&env, 10_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );
        contract.deposit_funds();

        contract.trigger_dispute(&client, &0);

        // This should panic — milestone is Disputed, not Pending.
        contract.release_milestone(&0);
    }

    #[test]
    #[should_panic]
    fn test_cannot_double_release() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        let budgets = vec![&env, 10_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );
        contract.deposit_funds();

        contract.release_milestone(&0);
        // This should panic — already Approved.
        contract.release_milestone(&0);
    }

    #[test]
    #[should_panic]
    fn test_budget_mismatch_panics() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);

        // Sum is 6M but total_budget is 10M — should fail.
        let budgets = vec![&env, 3_000_000_i128, 3_000_000_i128];
        contract.initialize(
            &client,
            &freelancer,
            &Some(arbiter.clone()),
            &token_addr,
            &budgets,
            &10_000_000_i128,
        );
    }
}

#[cfg(test)]
mod security_scenario_tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};
    use soroban_sdk::{vec, Env, IntoVal, InvokeError};

    const TOTAL_BUDGET: i128 = 10_000_000;
    const FIRST_MILESTONE_BUDGET: i128 = 4_000_000;
    const SECOND_MILESTONE_BUDGET: i128 = 6_000_000;

    fn setup_env() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        let contract_id = env.register(FlowGuardContract, ());
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let admin = Address::generate(&env);
        let asset_contract = env.register_stellar_asset_contract_v2(admin);
        let token_addr = asset_contract.address();
        let asset_admin = StellarAssetClient::new(&env, &token_addr);
        asset_admin.mock_all_auths().mint(&client, &TOTAL_BUDGET);

        (env, contract_id, client, freelancer, arbiter, token_addr)
    }

    fn initialize_and_deposit(
        env: &Env,
        contract: &FlowGuardContractClient,
        client: &Address,
        freelancer: &Address,
        arbiter: &Address,
        token_addr: &Address,
    ) {
        let budgets = vec![env, FIRST_MILESTONE_BUDGET, SECOND_MILESTONE_BUDGET];

        contract.mock_all_auths().initialize(
            client,
            freelancer,
            &Some(arbiter.clone()),
            token_addr,
            &budgets,
            &TOTAL_BUDGET,
        );
        contract.mock_all_auths().deposit_funds();
    }

    #[test]
    fn happy_path_initializes_deposits_and_releases_milestone() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);
        let token = TokenClient::new(&env, &token_addr);

        initialize_and_deposit(&env, &contract, &client, &freelancer, &arbiter, &token_addr);

        assert!(contract.is_funded());
        assert_eq!(token.balance(&client), 0);
        assert_eq!(token.balance(&contract_id), TOTAL_BUDGET);

        contract.mock_all_auths().release_milestone(&0);

        let milestone = contract.get_milestone(&0);
        assert_eq!(milestone.status, MilestoneStatus::Approved);
        assert_eq!(token.balance(&freelancer), FIRST_MILESTONE_BUDGET);
        assert_eq!(
            token.balance(&contract_id),
            TOTAL_BUDGET - FIRST_MILESTONE_BUDGET
        );
    }

    #[test]
    fn unauthorized_third_party_cannot_release_milestone() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);
        let token = TokenClient::new(&env, &token_addr);

        initialize_and_deposit(&env, &contract, &client, &freelancer, &arbiter, &token_addr);

        let third_party = Address::generate(&env);
        let result = contract
            .mock_auths(&[MockAuth {
                address: &third_party,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "release_milestone",
                    args: (&0_u32,).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_release_milestone(&0);

        assert!(matches!(result, Err(Err(InvokeError::Abort))));
        assert_eq!(contract.get_milestone(&0).status, MilestoneStatus::Pending);
        assert_eq!(token.balance(&freelancer), 0);
        assert_eq!(token.balance(&contract_id), TOTAL_BUDGET);
    }

    #[test]
    fn only_arbiter_can_resolve_dispute_and_route_funds() {
        let (env, contract_id, client, freelancer, arbiter, token_addr) = setup_env();
        let contract = FlowGuardContractClient::new(&env, &contract_id);
        let token = TokenClient::new(&env, &token_addr);

        initialize_and_deposit(&env, &contract, &client, &freelancer, &arbiter, &token_addr);

        contract
            .mock_auths(&[MockAuth {
                address: &freelancer,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "trigger_dispute",
                    args: (&freelancer, &0_u32).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .trigger_dispute(&freelancer, &0);

        assert_eq!(contract.get_milestone(&0).status, MilestoneStatus::Disputed);

        let third_party = Address::generate(&env);
        let unauthorized_result = contract
            .mock_auths(&[MockAuth {
                address: &third_party,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "resolve_dispute",
                    args: (&0_u32, &true).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .try_resolve_dispute(&0, &true);

        assert!(matches!(unauthorized_result, Err(Err(InvokeError::Abort))));
        assert_eq!(contract.get_milestone(&0).status, MilestoneStatus::Disputed);
        assert_eq!(token.balance(&freelancer), 0);

        contract
            .mock_auths(&[MockAuth {
                address: &arbiter,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "resolve_dispute",
                    args: (&0_u32, &true).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .resolve_dispute(&0, &true);

        assert_eq!(contract.get_milestone(&0).status, MilestoneStatus::Approved);
        assert_eq!(token.balance(&freelancer), FIRST_MILESTONE_BUDGET);
        assert_eq!(
            token.balance(&contract_id),
            TOTAL_BUDGET - FIRST_MILESTONE_BUDGET
        );
    }
}
