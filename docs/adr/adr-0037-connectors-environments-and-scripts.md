---
created: 2026-06-25
description: A uniform per-project operations model — connectors, environments and approved workflows — on GitHub Actions.
---

# Agent Operations: Connectors, Environments, and Approved Workflows

**Status:** Accepted

*Build on GitHub Actions first; revisit the platform-owned runner only if limitations force it.*

> **Revision note.** An earlier draft of this ADR rejected GitHub Actions and had the **platform own an execution runner/sandbox**. Cost and security analysis reversed that: **GitHub Actions is now the chosen execution backend**, with a platform-owned runner retained only as a documented fallback (see *Execution backend — chosen path and alternatives*). The operations *model* below (environments, variables, approved operations, secret-hiding, gates) is unchanged; only *who executes and where secrets live* changed.

## Context

Phase 8 (Remote Operations) needs the agent to help with **operations** — deploying a project, running a backup, syncing config — safely, while the operator directs it remotely from a phone. Two hard floors: the agent must have **no path to break production**, and it must **never see deployment secrets**.

Today the platform's external-service access is split and rigid:
- **`Provider` table** — platform-wide service credentials the platform itself uses (voice STT/TTS, LLM keys, the org GitHub PAT). Plaintext at rest.
- **Bespoke per-project git** — `ProjectSshKey` / `ProductSshKey` store SSH deploy keys; `gitAccessService` provisions and grants them via a per-run grant-and-sweep. Good *isolation*, but hardcoded, GitHub-only, plaintext at rest.

Two problems: it's **rigid** (the only project-scoped integration is git, welded to GitHub in platform code — a new target means a platform release), and **secrets are plaintext** in Postgres (latent debt that multi-user, Phase 9, forces us to fix).

This ADR is the product of an extended design exploration. The key turns that shaped it:

- **Don't own deployment mechanics.** Standardising deploy (the base44 model) removes the user's stack freedom. Users keep their stack; the platform must not dictate *how* a deploy works.
- **The agent's natural medium is files.** The easiest model for the agent to deliver work is: *operations are files; secrets are referenced by name.* The agent writes a workflow that references a secret by name; it never authors a value.
- **The operations model mirrors how developers already work** — per-environment config (`.env.staging`, `.env.production`), and CI/CD that runs the deploy. We mirror that rather than invent a parallel system.
- **GitHub Actions is the execution backend** *(this is the decision the revision note flags)*. When the agent builds a new project, that project lives on GitHub, and **GitHub Actions is the consensus CI/CD for that segment** — ~62% of personal/greenfield projects and the single most-used CI tool overall ([JetBrains State of CI/CD 2025](https://blog.jetbrains.com/teamcity/2025/10/the-state-of-cicd/)). Decisively, Actions **already provides the two things most dangerous to build ourselves** — an encrypted secret store and an isolated execution sandbox — plus environment gates, required-reviewer approval, and automatic secret-masking in logs, hardened and **free within the org's existing Team plan**. Building our own runner was a security liability and an engineering cost for no benefit the platform's users would value. The agent authoring `.github/workflows/*.yml` produces **standard, portable CI/CD the developer owns** — no Agenthix lock-in.
- **The platform must not categorise secrets by purpose.** "App env var" vs "deploy key" is decided by *which workflow uses a value*, not by a platform label.
- **Build on the integration first; own it later only if forced.** Building on GitHub Actions is cheaper to ship and faster to learn from than a bespoke runner — and it means we **inherit an established convention** (the workflow YAML format) instead of inventing a deploy-config language and teaching it to both users and the model. We adopt GitHub first, learn from real use, and keep the platform-owned runner (option C) as a clean escape hatch to customise and extend if GitHub's limits ever bite.

## Decision

> ⚠️ **`Connector` (§2) is not built.** It is commented out in hq's schema, carrying the note
> "Uncomment and migrate when building the agent connector / secrets feature". `Provider`
> exists and the GitHub Actions execution model exists (`hq/src/server/github/`), so this
> record is accurate about what shipped and describes an unshipped middle. Nothing
> superseded it — the decision stands and the work has not happened. It is queued.
> *(annotated 2026-08-19, updated 2026-08-21)*

A project gets a uniform operations model, executed on GitHub Actions.

### 1. Provider — the platform's own service accounts *(unchanged)*
Site-wide credentials the platform uses to deliver built-in features (voice, LLM, org git PAT). Stored in the existing `Provider` table, pre-coded, not agent-scoped. **Left as-is.**

### 2. Connector — a scoped, pre-coded external-service integration
A stored, scoped credential for a service the platform built support for (Drive, Slack, GitHub), scope-resolved project → product → org. The agent uses it **interactively** (built-in tools, or a credential proxy) **without ever seeing the value**. This is the "agent, read my Drive" surface — distinct from deployment. (Realises the schema's reserved `Connector` model.)

### 3. Environment — named variable sets that map to GitHub Environments
A project has **named environments** (`preview`, `staging`, `production` — add / rename / delete) **plus a fixed `Shared` scope**. These **map onto [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)**. Each holds **Variables**:
- flat **key → value** pairs, each with a **secret flag**: secret → relayed to that environment's **GitHub Secrets** (the agent knows the name only, never the value); not-secret → a **GitHub Actions variable** (`vars` context), readable by the agent.
- the platform does **not** categorise variables by purpose — they are just named values; the workflows decide what each is for.
- `Shared` holds **overarching** variables (repo/org-level secrets and variables applied across environments); per-environment values live in their environment.
- **We store no secret values.** The operator enters a value in our UI; we encrypt it with the repo's public key and write it to GitHub's secrets API — pass-through, nothing persisted. This sidesteps the plaintext-at-rest debt for deploy secrets entirely (GitHub is the custodian). *(Git **access** — clone/push — is a **separate** credential from these app secrets; it is handled by the platform's GitHub credential in §8, not stored as a workflow secret. See Open.)*

### 4. Operation — an approved GitHub Actions workflow the agent authors
An operation is a workflow file (`.github/workflows/<slug>.yml`, plus any scripts it calls) the agent authors, scoped to an environment:
- **draft → live**. The agent writes a draft; a human **reviews and approves**; **approval is what pushes the workflow to the repo** (the agent never pushes a workflow unreviewed). Editing an approved workflow lands as a new draft — the live version keeps running until the new one is approved.
- **operations are general, not deploy-only.** A workflow is *any* approved operation, triggered on demand (`workflow_dispatch`) or on a schedule (`schedule:` cron), and **need not touch the codebase** — a manual `pg_dump` of production, a one-off migration, or a nightly backup are each a workflow with a secret and no build step. The workflow *file* lives in the repo only because that is where GitHub reads workflow definitions; that is storage, not a constraint on what the operation does.
- **invoke flag** — `agent-runnable` (the agent may trigger a run, a `workflow_dispatch`) vs the default **operator-only** (only the operator taps Run).
- references **secrets by name** (`${{ secrets.DATABASE_URL }}`); **GitHub injects the values at run and masks them in logs**; the agent authors **blind to the values**.
- **run lifecycle** surfaced from the GitHub Actions API — queued → running (with the current step, run number, commit, and Cancel) → success / failure (log retained on GitHub).
- the agent **separates concerns into multiple workflows** as the work demands (a `deploy` workflow, a separate `sync-env`), and writes **environment-specific** workflows where the logic differs or one generic workflow where it doesn't.

### 5. The platform is unopinionated about deploy logic
The platform does not dictate *how* a deploy works — `fly` vs `ssh`, env-file vs `process.env`, deploy-vs-sync as separate workflows: all of that lives in the agent's workflow. The platform's job is **authoring + approval + surfacing**, with **GitHub Actions as the execution backend** and **GitHub Secrets / Environments as the secret + gate store**.

### 6. Secret-hiding stance *(realised by GitHub)*
The agent **never sees a real secret value, in any environment.** It authors workflows referencing names; the **operator provides values**; **GitHub holds, injects, and masks** them. The agent debugs against **mocks / non-real values**, and for a real-secret run the agent is **not given the run's output** (an agent that authors the code *and* watches it run with real secrets is an exfiltration channel masking alone can't fully close) — enforced as a policy on whether the agent may read a run's Actions logs. **Production is safe by construction** — the agent never runs or observes the production app.

### 7. Gates — separation of duties
- **Author** — the agent drafts a workflow. Gated by an author permission.
- **Approve** — a human reviews the diff; **approval pushes the workflow to the repo**. Human-only; never an agent-holdable permission. GitHub's **required-reviewer** environment protection adds a *second*, native gate at run time for protected environments.
- **Invoke** — triggering a run (`workflow_dispatch`): operator-only by default; `agent-runnable` only where the operator opts that workflow in.

### 8. Execution backend — GitHub Actions
- **Secrets** relay to GitHub Secrets (per environment / Shared) via the secrets API; we store nothing.
- **Environments** map to GitHub Environments, carrying GitHub's protection rules (required reviewers, wait timers).
- **Runs** execute on GitHub Actions and are surfaced in our UI by reading the Actions API.
- **Our credential — a pluggable GitHub connection.** Pushing workflows, setting secrets, dispatching runs, and the agent's git access all go through **one internal accessor** ("get a token for this repo"), so the *connection method is pluggable*. Two methods, offered as user options:
  - **Stored PAT — the baseline** *(already built; free)*. The existing `Provider` PAT (with `repo` + `workflow` scopes) can already set secrets, push workflows, dispatch, and read runs. The operations feature is built on this first; it suffices for single-tenant use.
  - **Per-site GitHub App — an optional upgrade** *(candidate paid/premium tier)*. A bot identity with fine-grained per-repo permissions and short-lived (~1 hr) installation tokens, retiring the plaintext-PAT and agent-held-key exposures (BL-028, the product backlog, outside this repository). Per-site (site is self-hostable; HQ aggregates many sites). A follow-on deliverable, **not** a prerequisite. (Build-time sub-choice: platform-registered-per-site vs bring-your-own App.)
  - Giving users **multiple ways to connect GitHub** (PAT now, App later) falls out of the accessor abstraction; the platform holds whichever credential the chosen method stores, encrypted at rest.

### Surfacing
This lives on the project's **GitHub tab** (these are all GitHub surfaces): the **Repository** connection on top, then **Actions & secrets** below — **environment sub-tabs** (`Shared` + the environments) → a view-only **Variables** tile ("synced to GitHub") and **Workflow** tiles (pending-review with a Review action; live runs with Run / Cancel, run number, commit, status) that drill into detail (the diff to approve, the run log on GitHub). Heavy management lives on drill-down screens.

## Execution backend — chosen path and alternatives

Documented so we can revisit as we scale. The control plane (secrets, environments, gates, orchestration, log masking) is **GitHub's in all three**; the options differ only in **where the job's compute runs**.

| Option | Where compute runs | Cost | Build / security surface | When |
|--------|--------------------|------|--------------------------|------|
| **A — GitHub-hosted runner** *(chosen default)* | GitHub's cloud | Free to **3,000 min/mo** (Team, private repos); then **$0.006/min** Linux; **public repos free** | **None** — GitHub builds + secures it | Default. Low/medium volume; production (rare, gated). ~600–900 deploys/mo within the included quota. |
| **B — Self-hosted runner** *(cost + reachability lever)* | **Our machine** (isolated sidecar) | **Free minutes, always** — flat ~$10–15/mo box | Low — we host GitHub's runner *agent*; GitHub still holds/injects/masks secrets and enforces gates | Two drivers. **Cost:** high-frequency environments (busy agents deploying **staging**); break-even ≈ **1,000+ deploys/mo**, where a flat box beats per-minute. **Reachability:** *required* when an operation must reach **private infrastructure** GitHub's cloud cannot — a DB on the site box, an internal-network service, a firewalled VPS (a production backup is the canonical case). Set per workflow: `runs-on: self-hosted`. Never on public repos (fork-PR code execution). |
| **C — Platform-owned runner/sandbox** *(rejected; fallback only)* | Our machine | Our compute + **high build + perpetual security upkeep** | **Highest** — we build the encrypted vault, secret injection, log redaction, and isolation from scratch | Only if a project can't use Actions at all (e.g. a **non-GitHub** repo, or a **Free-plan org with a private repo**, where GitHub Environments/protection rules are unavailable). Designed in the architecture doc, kept on the shelf. |

**Why A over C.** C's only theoretical advantage — compute on our own machine — is captured by **B without building any security-critical parts** (GitHub still does secrets/injection/masking/gates). So B dominates C on every axis; C survives solely as the non-GitHub fallback.

**Scaling path:** start on **A** (free, zero infra) → add **B** for whichever environments get deploy-heavy (free minutes on our box) → build **C** only if a real non-GitHub / Free-private project ever demands it.

## Consequences

### Positive
- **We don't build or operate a secret vault or an execution sandbox** — the two most dangerous things to own. GitHub does the security-critical work, hardened and free within Team.
- **No secret-at-rest debt for deploy secrets** — we store none; GitHub is the custodian.
- **Standard, portable, no lock-in** — the agent produces normal `.github/workflows/*.yml` the developer owns and could take elsewhere; it does exactly what a human dev would do on a GitHub project.
- **Native gates** — GitHub Environments + required reviewers give a real human deploy gate, on top of our draft→live approval.
- **The agent's job is dead simple** — author a workflow, reference secrets by name. **Secrets hidden from the agent; production safe by construction.**
- **Cost is favourable and elastic** — free to quota on hosted runners; self-hosted runners remove per-minute cost for high-volume environments.

### Negative
- **GitHub dependency.** This path assumes the project is a GitHub repo. Non-GitHub projects, and **Free-plan orgs with private repos** (no Environments/protection rules), fall back to option C — which we have not built.
- **We hold a per-site GitHub credential** that can push workflows, set secrets, dispatch runs, and grant the agent git access. Smaller than a vault+sandbox, but a real long-lived secret to scope, encrypt at rest, and protect — *and the agent acting autonomously means the site must hold some such secret regardless of model.*
- **Self-hosted runners (option B) put injected secrets briefly on our machine** during a job. Mitigated: GitHub injects/masks, the runner is ephemeral per job and isolated; never used on public repos.
- **The secret-hiding stance still constrains the agent** — it debugs against mocks and is not given real-secret run output.

### Risks
- **A workflow the agent authored could misuse an injected secret at runtime.** Mitigated by our draft→live diff review, GitHub's environment gates, and the secret-hiding stance; never fully closed for code the agent authors.
- **The GitHub credential's scope** must be tight (per-repo, least-privilege, expiring where the model allows) — an over-scoped or non-expiring credential is a real blast radius.
- **Plaintext-at-rest debt remains for the platform's *own* credentials** (`Provider` PAT/LLM keys, the agent's git push credential) — separate from deploy secrets, still to be fixed before multi-user (Phase 9).
- The existing `canAccess` TEMP allow-all must be closed (Phase 9) before multi-user, or our approval/invoke gates are theatre.

### Open — for the architecture doc
- **The platform↔GitHub credential model** — *decided: pluggable* (see §8). **PAT is the baseline** (built; the operations feature ships on it); a **per-site GitHub App** is an **optional upgrade and candidate paid tier**, a follow-on deliverable. Sub-detail for the App: platform-registered-per-site vs bring-your-own. (Rejected as *the sole* model: a central Agenthix App — can't serve self-hosted sites.)
- **Agent git access** *(a separate credential from app secrets)* — clone/push during the agent's dev loop. Today it is the plaintext SSH deploy key written into the agent's workspace; under this decision it is **replaced** by the platform credential — keyless `GITHUB_TOKEN` inside workflows, and a short-lived token *or* **server-proxied push** (agent holds nothing) for the agent's own commits. Decide token-vs-proxy.
- **The workflow-approval mechanism** — how draft→live approval actually pushes the workflow (commit to a branch / PR / protected path) and how that reconciles with GitHub's own environment review.
- **Secret-relay flow** — encrypting with the repo public key and writing via the secrets API; non-secret variables via the variables API.
- **Run surfacing** — reading the Actions API for status/logs; the agent-observability policy (which runs' logs the agent may read).
- **Self-hosted runner isolation** (option B) — how the runner agent is sandboxed if/when we add it.
- The architecture doc is reframed from a platform-owned runner to a **GitHub Actions integration**, keeping the owned-runner (option C) as a deferred fallback section.

## References
- [ADR-0036 — Context-Centric Security](./adr-0036-context-centric-security.md) — credential-free surface + run-context permissions; the gates and the secret-hiding stance extend its model.
- [ADR-0031 — Project Workspaces and Roadmap Memory](./adr-0031-project-workspaces-and-roadmap-memory.md) — the workspace operations run against.
- [ADR-0025 — Agent Identity as First-Class Org Member](./adr-0025-agent-identity-as-first-class-org-member.md) — agents are shared; why secrets must never be agent-held.
- GitHub docs: [Using environments for deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment), [Managing environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment) (Team plan required for protection rules on private repos), [Billing for Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions).
- Industry context: [JetBrains State of CI/CD 2025](https://blog.jetbrains.com/teamcity/2025/10/the-state-of-cicd/) — GitHub Actions is the consensus CI/CD for new GitHub-hosted projects.
- Schema: realises the reserved `Connector` model; adds an **Environment / Variable / Workflow** model; `Provider` unchanged; `ProjectSshKey` / `ProductSshKey` are **retired** — git access moves to the platform's GitHub credential (not stored as workflow secrets).
- Roadmap Phase 8 (this deliverable), Phase 9 (run-context security + closing `canAccess` + encryption at rest for the platform's own credentials) — the product roadmap, outside this repository.
- Site Live Preview — the preview-before-deploy half; preview is the dev environment the agent *does* observe (low-stakes values). Architecture doc now in `agenthix`.
- Architecture doc: Site Operations — the GitHub Actions integration that realises this decision, with the owned runner (option C) kept as a deferred fallback section. Now in `agenthix`.
