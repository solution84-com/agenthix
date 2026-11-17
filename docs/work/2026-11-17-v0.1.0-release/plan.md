---
name: v0.1.0 release — plan
description: The phases of the v0.1.0 release unit — every v0.1.0 blocker proven, the QA audit, then the cut of the first public release.
created: 2026-11-17
---

# v0.1.0 release — plan

## Goal

`v0.1.0`, the first public release, published once every issue that blocks it has been proven and closed and the QA
audit has run (owner, 17 Nov).

## Approach

**Straight to `v0.1.0`, with no `alpha.7`** (owner, 17 Nov). Nothing since `alpha.6` touches the release workflow, the
images, the host service, the migrations or the protocols, and that path published `alpha.4` to `alpha.6`. The one real
change since, the tool search and the leaner context, is tried in use before the tag instead: the walkthroughs run on
images built from `main`, and include a conversation that finds a tool by search and uses it.

**Every release is prepared and cut on its own release branch** (owner, 17 Nov), and `v0.1.0` is the first. It is
`release/v0.1.0`, cut from `main` at `2e26278e`, and starts with the model relay's source-check test (`00b264dd`).
The blockers, the audits and their fixes are made on it; the Release workflow runs on it, so the tag lands on its last
commit; then it merges into `main`. `main` stays open meanwhile: a fix merged there that this release also needs is
cherry-picked onto the branch, and anything else waits for the next release.

**The proofs run on our own machines, never a person's computer.** The Linux proofs run on a Linux machine of ours, in a
folder of their own with a temporary Node.js and a temporary user, under the tests' own Docker namespaces and address
range, and are removed afterwards. The two-machine walkthrough adds a temporary site on another of our machines and
removes it when it passes.

**The branch is pushed whenever progress needs saving** (owner, 17 Nov): a push runs Checks, like a push to `main`, and
nothing else. Releasing is only ever by hand: the release build runs inside the Release run, or when started by hand,
never on a push. The full regression runs on the branch on the dev machine before the cut.

**Pushes, the cut and the merge into `main` are the owner's.**

## Work breakdown

### Phase 1 — The blockers proven

- [x] 1.1 **The Linux proofs**, on a Linux Docker engine (Debian 13, Linux 6.12, Docker 29): the site's container
      tests, with a new test that a relay request from another container is refused by where it came from
      (`relaySource.container.test.ts`); the security suite's container rows
      (`npm run test:security -- --no-integration --no-cross-app`). Both have only ever run on Docker Desktop.
      *Done:* on Linux 6.12, the site's 153 container tests pass, the relay source-check test among them, and every security row passes (A1–A18, K-*, F-*; the integration and cross-app parts not run there, as they don't depend on the engine). Linux showed three things Docker Desktop hid, fixed under 1.8.
- [x] 1.2 **The Wasp 0.25 walkthrough**: a task attachment's download, an agent's avatar image, and an agent's MCP
      tools, the three paths Wasp 0.25 changed underneath, on images built from `main`.
      *Done:* on images built from the release branch: an attachment uploaded and downloaded whole, an uploaded agent
      avatar shown in the profile and the sidebar, and a task run's MCP tools all passing their checks (zod 4).
- [x] 1.3 **The two-machine walkthrough**: hq on one of our machines, and a temporary site on another behind its
      firewall, under a namespace of its own; it registers, runs a chat and a task, survives each side restarting, and
      is revoked and registered again.
      *Done:* all five steps pass, with a temporary site on another of our machines; it found the kernel requirement (1.7) and two small faults (1.8).
- [x] 1.4 **The tool search in use**: on images built from `main`, a conversation that needs a folded tool finds it by
      search and uses it, and a task run does the same.
      *Done:* a task run found a hidden tool by search and used it; in a conversation the lead searched, called a
      hidden tool through `use_tool` and handed the work off; every call passed its checks. Agents can't start a
      project's sprints: queued as a feature for after `v0.1.0`.
- [x] 1.5 **A breaking change can't ship without a version move and a warning**: a breaking commit is marked `!` with
      what an installation must do; Release's first stage finds every break since the previous tag (a protocol major or
      a format number moved, a column or table dropped, a core export, an `agenthix` command or option or a `host.env`
      setting removed, a commit marked `!`), then refuses a patch and opens the release notes with each break and what
      to do; the migration check catches a dropped or narrowed column; the CLI, `host.env` settings, an installation's
      names and core's exports are snapshotted against the last release. Data is carried forward from `alpha.6`
      (`docs/architecture/versioning.md`), so `alpha.6` → `v0.1.0` is the first upgrade it guards.
      *Done:* merged; nothing breaking since `alpha.6`.
- [x] 1.6 **The release workflow, every release on its own branch**: a decision record that every release, major,
      minor or patch, is prepared and cut on `release/<version>` and then merged into `main` (a major or minor cut from
      `main`, a patch from the tag it fixes), replacing ADR-0146's "a release branch only for a patch"; the releasing
      skill and `docs/architecture/versioning.md` to match; `docs/CONTRIBUTING.md` says pull requests go to `main`; the
      Release workflow's dependency and security gate (`scripts/deps/due.mjs`, `security.mjs`) skips only a patch
      version. **On GitHub's side:** a push to `release/**` no longer starts the release build (`release-build.yml`
      loses its push trigger; `proven-run.mjs` stops counting a push as a proven run), so a push only saves progress
      and runs Checks; no ruleset for `release/**` (only maintainers can push; owner, 17 Nov), and the releasing skill
      says a release branch's history may be cleaned and force-pushed until the cut, never after its tag; the
      workflows' and scripts' wording that still says a release branch is a patch's (`release.yml`,
      `checks-passed.sh`, `proven-run.mjs`); the merge back into `main` made the way a unit's merge is, so `main`'s
      ruleset (a pull request and passing checks, with the owner's bypass) applies as today.
      *Done:* merged: ADR-0194, the releasing skill, the workflows and the docs.
- [x] 1.7 **No installation where agents can't work** (owner, 17 Nov): an agent's commands are contained by Landlock,
      and its signal scoping needs Landlock 6 (Linux 6.12); below it a site runs no agent at all. `agenthix install`,
      `agenthix console connect` and every upgrade ask the kernel's Landlock version through the agent image's
      launcher before anything is started or written, and refuse below 6, saying why and the fix for the distribution
      they find (Ubuntu 24.04's newer kernel, Debian 12's backports). The deployment guide's "What a machine needs"
      and the user guide's install page (`docs/guide/getting-started/install.md`, both "What you need") say so. The site's own check per run stays as the last line of defence.
      *Done:* merged; the machine behind the walkthrough's site was moved to a newer kernel.
- [x] 1.8 **What the proofs turn up**, fixed here; anything not fixed decided by the owner.
      *Done:* merged: a Fleet Console site's log line; a site's agents stopped with it; a workspace's mount point made by the site, never root-owned on Linux; the relay's flow-control test sized past Linux's socket buffers (the relay itself was right). Each rerun on Linux and passes.
- [x] 1.9 **A model the organisation never chose is never run**: when no default can be used, the resolver's last
      resort takes the provider's recommended model, not the first in its catalogue (the walkthrough's run fell to
      OpenRouter's alphabetically first model and looped).
      *Done:* merged: the last resort takes the first provider's recommended model; four resolver tests, three of
      which failed before.

### Phase 2 — The audits

- [x] 2.1 **The QA audit**, required before `v0.1.0`: what changed since the last one (8 Nov), against the contract the
      units since then wrote.
      *Done:* 12 findings, none critical; the code defect (`use_tool`'s input sent as text) and the contract edits fixed
      here, the rest raised as issues.
- [x] 2.2 **The public-repository audit**, the gate for the repository going public with nothing private in it: its
      files, history, issues, pull requests, discussions and releases (against the maintainers' list of private names), the
      pre-push hook and the writing-in-public skill current.
      *Done:* the audit ran: 12 findings under both versions of the writing-in-public rule, 14 under the newer one
      only. The history is kept as it is (the owner's decision); the reported passages in the current files are
      reworded. No known-limitations page: the guide's front page sends readers to the open issues instead.
- [x] 2.3 What the audits find, fixed here or decided by the owner.
      *Done:* the pre-push hook now also checks every line a push adds, and its commit messages, against a committed
      list of patterns and the maintainers' private one, so new text is held to the rule from here on; its tests run
      in *Checks*. An edit to an older spec whose unit has no plan file now passes; only a spec a push adds is held
      back. Every passage the audit reported is reworded: private names described, Agenthix Cloud named by its flag
      only, no pricing, legal questions asked rather than answered, no deployment details, and the old product name
      gone. gitleaks allows the fake test credentials by path.
      The same wording in product code comments and the QA contract, which the audit had not listed, is reworded too.
- [ ] 2.4 **The changelog reviewed** against what `v0.1.0` carries: what was built after it was written (8 Nov) added,
      and what a release doesn't offer taken out.
      *Progress:* updated, and dated 17 Nov with an empty Unreleased section above it; the releasing skill now dates
      the changelog as each release's last commit before the cut. If the cut moves to another day, the date moves with
      it. Waits for the owner's read.

### Phase 3 — The cut

- [ ] 3.1 The full regression on the branch; the branch pushed; Checks pass on it.
      *Progress:* the full regression passes: 49 steps, the images, the install, upgrade and container tests among
      them. Its one failure was a timing race in Home's layout test, fixed and passing in both end-to-end runs. The
      branch's history is regrouped into 11 commits. Not pushed yet.
- [ ] 3.2 The Release workflow run on `release/v0.1.0` with the version `0.1.0`: the gates, the screenshots captured and
      pinned, the release build, the tag and the publish.
- [ ] 3.3 The branch merged into `main`, then deleted, locally and on GitHub.
- [ ] 3.4 **The packages made public**: the eight image packages (`hq-server`, `hq-web`, `relay`, `site-server`,
      `agent`, `executor`, `host`, `console`) and `@agenthix/core`, by hand in each package's settings, since nothing
      in the workflows changes visibility; each checked with an anonymous pull, and the install run on a clean machine
      with no registry credential.
- [ ] 3.5 The upgrade from `alpha.6` to `v0.1.0` tested on a machine of ours, then our installations upgraded to
      `v0.1.0`, each on a kernel that runs agents.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0190 (one Release workflow); `docs/architecture/versioning.md` (data carried from `alpha.6`) |
| **Implements** | the new record of 1.6 (every release on its own branch) |
| **Revisits** | ADR-0146, item 5 (a release branch only for a patch), superseded by 1.6's record |

## Deviations

| Phase | What changed | Why |
|---|---|---|
| All | Opened as `alpha.7`, the last pre-release; reshaped the same day to go straight to `v0.1.0` | Owner, 17 Nov: nothing since `alpha.6` touches the release path, and what `alpha.7` would show is tried in use instead (1.4) |
| All | Every release is prepared and cut on its own branch (1.6), so this unit's branch is the release branch and the cut happens on it | Owner, 17 Nov: one path for every release, simpler to reason about |
| 1 | 1.5 (breaking-change guards) added | Planned before the QA audit on 16 Nov; data is kept from `alpha.6` |
| 1 | 1.7 (refuse below Linux 6.12) added | The two-machine walkthrough found a site on Linux 6.8 runs no agent at all; owner: no installation where agents can't work |
| 2 | The public-repository audit added beside the QA audit | It is the gate for the repository going public |
| 3 | Making the packages public added (3.4) | Publishing does not change a package's visibility |
| 2 | The public-repository audit failed on documents agents wrote against the writing-in-public rule. The history is kept as it is; the current files are cleaned against this repository's rule, and the pre-push hook now refuses new text that breaks it | Owner, 17 Nov: "accept that previous history breaks this rule"; a fresh history again would not stop it happening |
| 2 | No known-limitations page (2.2); the changelog reviewed instead (2.4) | Owner, 17 Nov: the open issues already list what is known, and a page beside them would need keeping in step |

## Closing note
