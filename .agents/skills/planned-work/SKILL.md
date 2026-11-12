---
name: planned-work
description: Use when planning, recording or landing the maintainers' work in this repository — a unit of work's folder, specs, plans and decision records, queued work as issues, QA stories and the screenshot walkthrough at a unit's close, branches, when to commit, regrouping and merging to main, pushing, taking over a contribution, and running subagents in parallel. Maintainers only; contributors follow AGENTS.md's Contributing section.
---

# Planned work

## Documents and queued work

- **`docs/` describes the present**: architecture, concepts, the QA contract, and the decision records in
  [`docs/adr/`](../../../docs/adr/README.md). A dated spec or plan never goes there.
- **A unit of work** (an initiative, operational work, a feedback loop, or a QA audit) is one folder,
  `docs/work/<YYYY-MM-DD>-<slug>/`, holding its design spec, if it has one, and its implementation plan.
  - Its `execution/` folder is gitignored scratch, and `.scratchpad/` is never committed anywhere.
  - **Never cite a gitignored path from a committed document**: it is dead for anyone else who clones the repository.
- **A decision that binds how the rest of the system is built is a decision record**, not queued work.
- **Queued work is an issue on this repository**, never a file, with an issue type (`Bug`, `Debt`, `Feature`, `Chore`)
  and a `Priority`.
- **QA** lives in `docs/qa/`: the [QA model](../../../docs/qa/README.md), shared and versioned, and this repository's
  [settings](../../../docs/qa/qa-strategy.md).
  - A unit that changes behaviour writes the stories and scenarios for it when it closes, and tags the tests that
    cover them with `@SC-NNN`; never during its phases.
  - A full QA audit is optional at a unit's close and required before a release (`releasing`). Deferred findings are
    issues.

## The screenshot walkthrough at a unit's close

A unit that changes what people see closes with a walkthrough the maintainers' agents carry out and record as
screenshots. The owner reviews the screenshots as the evidence that the work was walked, and spot-checks the running
installation, instead of walking all of it themselves.

- **On the final build.** It runs after the last fix and the full regression, on a test installation of the branch's
  final images (`scripts/install-test/run.sh` with `INSTALL_TEST_KEEP=1`), never on development servers or on images
  older than the last commit that changes a screen. A fix made after the walk sends the steps it touches back through
  the walk.
- **Driven in a real browser** with Playwright, step by step through every story and scenario the unit changed: the
  usual path, each failure made on purpose as the `handling-errors` skill describes, every subject or role the spec
  names, light and dark, and phone width.
- **The evidence is one page.** A screenshot of each step's result, numbered in the order walked, grouped by area, on
  one HTML page. Each caption says what was done, what the spec expects, which spec section or scenario it shows, and
  whether it passed. Anything that does not pass is listed at the top.
- **Never committed.** The screenshots and the page stay in the unit's gitignored `execution/walk/` folder (see
  *Binaries* in `AGENTS.md`).
- **A step that fails is fixed and shot again before the owner sees the page.** The installation is kept running
  for the owner's spot checks, then removed.

## Git

- **Branches:** one branch per unit of work, cut from `main`. Work goes on a branch; a typo or a one-line fix may go
  straight to `main`.
- **When to commit:** during planned implementation, at each task boundary. During patching, review or a walkthrough,
  only when the owner says so. **Documents** (plans, specs, decision records) only with the owner's approval, whatever
  the context.
- **A contributor's pull request is squash-merged**: one commit on `main`, its message the pull request's title
  (`type(area): what changed`) and description, its author the contributor. Edit the title before merging if it does
  not read that way.
- **Taking over a contribution:** every commit built on a contributor's work carries a `Co-authored-by:` line for them,
  and the merge names their pull request. Anything copied in from elsewhere is listed with its licence in
  `LICENSING.md`.
- **Before a merge, regroup the branch** into a few ordered commits with fixes folded into what they fix, unless its
  commits are cited somewhere; then leave them and write a clear merge message. Create a `backup/<branch>` before any
  rebase, reset or regroup.
- **A unit's branch merges to `main` with `--no-ff`**, so each piece of planned work lands as one merge commit with its
  commits underneath. Fast-forward only for a branch that is genuinely one commit.
- **Never merge to `main` or push without the owner's explicit approval**, each time.
- **Checks on `main`:** a pull request merges only once the *All checks passed* check passes. The owner pushes to
  `main` without waiting for it, after the unit's regression (`testing-a-change`); when a run on such a push fails, the
  fix is the next push. That is the only way a commit with failing checks reaches `main`.
- A change that also needs another repository updated is a separate commit there; there is no cross-repository commit.

## Working with agents

**Choose each subagent's model for its task**: the least capable one that does it well. Always pass it explicitly; a
subagent given none inherits the lead's.

**Before running subagents in parallel, write down a resource strategy and put it in every brief.** Parallel agents
share one machine, and more than one at a time has exhausted memory here. It answers four questions, scaled to the
work: three agents reading code need a sentence, six building in their own worktrees need all four.

1. **What will they contend for?** Memory and CPU (typechecks, tests, builds, containers), fixed ports and the shared
   test databases, Docker, an external service's rate limit or budget, the same files.
2. **What runs one at a time?** For example, a machine-wide lock around heavy commands; suites that need fixed ports
   run once, by the lead, after the work is combined. Agents run the tests for what they changed and the typecheck of
   the modules they touched; the unit's regression runs once, when the unit closes.
3. **How is it watched?** Free memory, load and swap, or an external service's errors and spend, each with a threshold
   that raises an alert, and an alert when it recovers.
4. **What happens at a limit?** Decided in advance: which agents pause first, and what is reduced before anything is
   stopped.

Reassess when the work changes shape, for example when research turns into building.
