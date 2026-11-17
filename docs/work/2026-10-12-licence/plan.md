---
created: 2026-10-12
description: How the platform takes its licence and opens to contributors — the Elastic License 2.0 across every package with an additional permission, a contributor agreement, a contributing guide and a bug-report form.
---

# Implementation Plan · The licence applied, and ready for contributors

## Goal

Every part of the platform is under one source-available licence, the **Elastic License 2.0** (ELv2), with Solution84
as licensor, and the repository says so plainly.

**In scope:** the licence files, every package's `license` field, the README's wording, third-party notices, the one
dependency whose licence does not fit, and the public issues that name private places.
**Also in scope, folded in on 2026-10-12** (owner): *Ready for outside users and contributors*
— the contributor agreement and the check that asks for
it, the contributing guide, a bug-report template, and the old issue links. The checks on every pull request, and
repository *settings* — the agreement check, Discussions, branch protection — move to the clean public repository,
because settings do not travel with the code.
**Out of scope:** the
website's licence page — the website's, from the summary written here; a hosted service's own terms, outside this
repository; trademark registration and policy —
the business's.

## Approach

**The choice is made, so the work is applying it.** The owner chose ELv2 on 2026-10-12, from a comparison of the
source-available licences against the direction set on 2026-10-08: self-hosting free for any organisation's own use,
companies included; offering Agenthix to others as a hosted or managed service, or reselling it, forbidden; an agency
may run a client's own instance. ELv2's restriction is almost that direction in its own words, and it never expires. The owner will decide later, case by case,
whether anything becomes open source.

**One licence for everything, `core` included.** `core` is MIT today; the owner keeps it consistent with the rest, so
the protocol between HQ and its sites carries the same terms.

**What ELv2 does not say is added once, beside it.** ELv2 is silent on someone who installs and runs a client's own
instance for a fee. `LICENSING.md` carries an additional permission that allows it, with a plain summary of what the
licence allows and forbids. ELv2's text in `LICENSE` stays verbatim, so it is recognisable to anyone who knows it.

**Reviewed by a lawyer later** — the owner's call, 2026-10-12. The notice, the additional
permission and the agreement contributors sign are drafted here and published as they are; the review is queued as an
issue, not a release blocker.

**By hand, by the lead**, on `feature/licence`: the changes are small and touch files across the repository. The
dependency removal runs hq's suites; the full regression runs once before the merge. The owner reads `LICENSING.md`
before the close. The branch lands on `main` by a `--no-ff` merge.

## Decision records

| | Records |
|---|---|
| **Depends on** | None in this repository. The licence choice is recorded at product line level, outside this repository |
| **Implements** | None |
| **Revisits** | None |

## Key decisions

| Decision | Why |
|---|---|
| The Elastic License 2.0 | Its restriction — no hosted or managed service for others — matches the owner's direction, does not expire, and protects paid features through its licence-key clause; it is well known (Elasticsearch, Kibana, Airbyte) |
| The Fair Core License with Apache-2.0 later — **decided against** | It forbids only *commercial* competing use, so free hosting for others stays allowed, and each version becomes open source after two years; the owner decides on openness case by case instead |
| Business Source License, Sustainable Use License, PolyForm, AGPL with a commercial licence — **decided against** | BSL needs its grant drafted from scratch; the others each fail one requirement — the Sustainable Use License forbids more than the direction, PolyForm Internal Use forbids distribution, AGPL allows anyone to host for others |
| `core` under ELv2, not MIT — owner, 2026-10-12 | One licence across the platform; nothing outside this repository depends on `core` |
| The notice reads `Copyright 2026 Solution84` — owner, 2026-10-12 | Solution84 is the licensor. If Solution84 becomes a company, the copyright is assigned to it and the notice changes — so contributions are granted to Solution84 and its successors and assigns |
| An additional permission in `LICENSING.md`, ELv2's text left verbatim | A recognised licence text is easier to trust than an edited one; the permission is one paragraph beside it |
| No per-file licence headers | The root `LICENSE` travels with every copy, which is what ELv2 asks; headers add upkeep for nothing. Files copied from OpenCode keep their MIT notice |

## Work breakdown

One phase, 16 tasks.

- [x] 1. `LICENSE` at the root: a notice naming Solution84 and the additional permission, then ELv2's text verbatim
- [x] 2. `LICENSING.md`: what you may and may not do, the additional permission for running a client's own instance, and third-party components (the OpenCode files under MIT; the agent image installing Claude Code under Anthropic's terms and OpenCode under MIT)
- [x] 3. `core/LICENSE` removed; `"license": "Elastic-2.0"` in every `package.json`; `"private": true` in hq and site
- [x] 4. The README: "source-available" in place of "open-source", and a short licence section
- [x] 5. The unused `@anthropic-ai/claude-agent-sdk` removed from hq, which brings in an LGPL library
- [x] 6. Private places removed from the public issues that name them
- [x] 7. An issue: a lawyer reviews the notice, the additional permission and the contributor agreement
- [x] 8. The website's licence page handed over: the summary and the worked examples, where the website plans its work
- [x] 9. The licence choice recorded at product line level, and its open decision closed
- [x] 10. The contributor agreement, for individuals and for companies, granting rights to Solution84 and its successors and assigns
- [ ] 11. The check that asks every outside contributor to agree once, on their first pull request — dropped here, moved to the clean public repository (Deviations)
- [x] 12. `docs/CONTRIBUTING.md`: setting up, running the tests, a good pull request, the licence and the agreement in plain words
- [ ] 13. Checks on every pull request and push to `main`: typecheck and unit tests for core, ui, hq and site — dropped here, moved to the clean public repository (Deviations)
- [x] 14. A bug-report template asking for the version, the operating system and logs
- [x] 15. Three older issues — the pull-request checks, hq's development database and the migrated issues' dead links — dealt with: checked against the repository as it stands, fixed or closed
- [x] 16. The publish workflow reads the storage secrets the owner created

## Deviations

| What changed | Why |
|---|---|
| The lawyer's review is an ordinary issue, not a release blocker | The owner's call: the review comes later |
| *Ready for outside users and contributors* folded into this unit: tasks 10–16 | The owner's call: the contributor agreement belongs with the licence, and the work is small |
| The pull-request checks (task 13) taken out of this unit and moved to the clean public repository | The owner's call, 2026-10-12: on GitHub's clean machines, 26 hq unit tests and 3 hq integration tests fail that pass locally, and fixing them is not licence work. The workflow, with a fix that installs the OpenCode plugin's packages, is kept for the clean public repository. There is no linter to run; adding one is its own issue |
| The agreement check (task 11) is the CLA Assistant GitHub App (cla-assistant.io), set up in the clean public repository, not a workflow | The workflow action for it is archived; the App is maintained and is a repository setting, and settings do not travel with the code |
| The publish workflow reads repository secrets `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and the bucket from the `GUIDE_STORAGE_BUCKET` variable | Those are the secrets the owner created |
| hq's development database fixed here: it starts from the repository's compose file, and `[dev] Start` brings it up first | The contributing guide's setup depends on it |

## Closing note

**2026-10-12.** Accepted by the owner. The licence is applied across every package, and the contributor agreement,
contributing guide and bug-report form are in place. Tasks 11 and 13 — the agreement check and the pull-request
checks — move to the clean public repository; *Ready for outside users and contributors* stays open for them. Deferred: the
lawyer's review and a linter; neither blocks release. No QA audit ran: the unit changed no product behaviour. No decision records
were touched; the licence choice is recorded outside this repository.
