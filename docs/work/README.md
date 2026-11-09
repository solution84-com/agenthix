---
name: Units of Work
description: Every unit of work this codebase has run — its kind, its state, and what it holds.
created: 2026-08-25
updated: 2026-11-04
---

# Units of Work

One folder per unit of work. A unit is an **initiative**, an **operational item**, or a
**QA audit** — its slug says which.

**A unit holds everything about one piece of work** — its design spec, its plan, and the
output of its phases. Designing is the work, so the spec is the unit's first output rather
than a contract handed to it from outside.

**What precedes a unit is a proposal**, not a spec. A proposal asks *should we*, is decided,
and once accepted is queued like anything else.

**`execution/` is gitignored by choice.** The plan carries the phase log, so what was done,
reverted and rescoped is committed; what is ignored is working detail nobody re-reads.

**Older units hold a spec and nothing else.** They predate the current model: their execution
plans were never committed, so the spec is the whole of what survives — which is the correct
shape for them, not a gap.

## The register

| Unit | Kind | State | Holds |
|---|---|---|---|
| [2026-04-15-documentation-structure](2026-04-15-documentation-structure/) | initiative | Closed | spec.md |
| [2026-04-16-project-workspace-isolation](2026-04-16-project-workspace-isolation/) | initiative | Closed | spec.md |
| [2026-04-18-voice-integration](2026-04-18-voice-integration/) | initiative | Closed | spec.md |
| [2026-04-25-key-management](2026-04-25-key-management/) | initiative | Closed | spec.md |
| [2026-06-21-site-full-qa-audit](2026-06-21-site-full-qa-audit/) | audit | Closed | qa-report.md |
| [2026-06-22-mobile-responsive](2026-06-22-mobile-responsive/) | initiative | Closed | spec.md |
| [2026-06-23-remote-operations](2026-06-23-remote-operations/) | initiative | Closed | spec.md |
| [2026-08-09-hq-site-module-split](2026-08-09-hq-site-module-split/) | initiative | Closed | spec.md |
| [2026-08-12-plan5-execution-runtime](2026-08-12-plan5-execution-runtime/) | initiative | Closed | spec.md |
| [2026-08-14-hq-site-split](2026-08-14-hq-site-split/) | initiative | Closed | spec.md · plan.md |
| [2026-08-19-adr-state-integrity](2026-08-19-adr-state-integrity/) | initiative | Closed | spec.md · plan.md |
| [2026-08-21-architecture-documentation](2026-08-21-architecture-documentation/) | initiative | Open | spec.md · plan.md |
| [2026-08-30-decision-register-migration](2026-08-30-decision-register-migration/) | initiative | Closed | spec.md · plan.md · walkthrough.md |
| [2026-09-15-hq-site-split-close-out](2026-09-15-hq-site-split-close-out/) | initiative | Closed | spec.md · plan.md |
| [2026-09-27-hq-site-close-out-remainder](2026-09-27-hq-site-close-out-remainder/) | initiative | Closed | spec.md · plan.md |
| [2026-09-27-model-vendor-independence](2026-09-27-model-vendor-independence/) | initiative | Open | spec.md · plan.md · candidate-comparison.md |
| [2026-09-28-person-scoped-execution](2026-09-28-person-scoped-execution/) | initiative | Closed | spec.md · plan.md |
| [2026-10-02-agents-own-schedule](2026-10-02-agents-own-schedule/) | initiative | Open | spec.md · plan.md |
| [2026-10-02-road-to-first-release](2026-10-02-road-to-first-release/) | initiative | Closed — after its first batch; the plan is a record | plan.md |
| [2026-10-05-workspace-tidy](2026-10-05-workspace-tidy/) | operational | Closed — the repository's workspace tidied; no behaviour changed | plan.md · measures.md |
| [2026-10-06-every-screen-reviewed](2026-10-06-every-screen-reviewed/) | initiative | Closed — every screen reviewed and its design passes accepted | plan.md · spec/ · boards/ |
| [2026-10-12-user-guide](2026-10-12-user-guide/) | initiative | Closed | spec.md · plan.md |
| [2026-10-12-licence](2026-10-12-licence/) | operational | Open | plan.md |
| [2026-10-12-clean-public-repository](2026-10-12-clean-public-repository/) | operational | Closed — a clean repository for the public release | plan.md |
| [2026-10-13-host-management](2026-10-13-host-management/) | initiative | Closed — the host service, the Fleet Console and fleet admins | spec.md · plan.md · diagrams/ · boards/ |
| [2026-10-16-conversational-experience](2026-10-16-conversational-experience/) | initiative | Closed | spec.md · spec/ · diagrams/ · plan.md |
| [2026-10-18-desktop-shell](2026-10-18-desktop-shell/) | initiative | Closed | spec.md · plan.md · boards/ |
| [2026-10-18-pre-release-and-cloud-support](2026-10-18-pre-release-and-cloud-support/) | initiative | Closed | spec.md · plan.md · boards/ |
| [2026-10-19-first-pre-release](2026-10-19-first-pre-release/) | operational | Closed — four changes for Agenthix Cloud and `v1.0.0-alpha.2`; installing from the images moved to the version baseline | README.md · plan.md |
| [2026-10-19-adaptive-voice](2026-10-19-adaptive-voice/) | initiative | Closed | README.md · spec.md · spec/ · plan.md |
| [2026-10-21-version-baseline](2026-10-21-version-baseline/) | initiative | Closed — every version, protocol and name on a machine from one baseline; release branches; `v0.1.0-alpha.1` | spec.md · plan.md |
| [2026-10-23-models-from-one-place](2026-10-23-models-from-one-place/) | initiative | Closed — models and providers configured in one place | spec.md · spec/ · plan.md |
| [2026-10-23-one-port-plan](2026-10-23-one-port-plan/) | initiative | Closed — every port and address block from one plan | spec.md · plan.md |
| [2026-10-24-release-cycle](2026-10-24-release-cycle/) | initiative | Closed — a release is a proven build given a name | spec.md · plan.md |
| [2026-10-24-workflows](2026-10-24-workflows/) | initiative | Closed — workflows a person approves, run by the platform | spec.md · spec/ · plan.md · boards/ |
| [2026-10-25-agent-knowledge](2026-10-25-agent-knowledge/) | initiative | Closed — Knowledge pages in sections that agents read and write | spec.md · spec/ · plan.md · boards/ |
| [2026-10-26-seeing-the-work](2026-10-26-seeing-the-work/) | initiative | Closed — files open in place; git state in view; relays carry the bytes | spec.md · spec/ · plan.md · boards/ |
| [2026-10-27-skills](2026-10-27-skills/) | initiative | Closed — skills and the asset layer | spec.md · spec/ · plan.md · boards/ · design-state.md |
| [2026-11-01-live-preview](2026-11-01-live-preview/) | initiative | Closed — an agent's running app opened beside its work | spec.md · plan.md · boards/ |
| [2026-11-03-triage-and-release-blockers](2026-11-03-triage-and-release-blockers/) | operational | Open — release blockers done, branch merged; paused for a voice unit, then the release is cut, proved and live-tested | plan.md · design-plan.md |
| [2026-11-08-voice-that-stays-in-the-conversation](2026-11-08-voice-that-stays-in-the-conversation/) | initiative | Closed 10 Nov 2026 — voice hears with one key, the conversation model decides whether the person has finished, and the agent listens while they talk | spec.md · plan.md |
