# Agenthix — working in this repository

How to work in this repository. `CLAUDE.md` is a symlink to this file. **For work in a module, read that
module's `AGENTS.md` too** (`hq/`, `site/`, `host/`, `console/`, `console-web/`, `ui/`) — each adds only what applies there.

Everything up to *For maintainers* applies to everyone, contributors included. *For maintainers* is how the
maintainers plan and land larger work; a contributor can skip it.

## This repository is public

Everything committed here, and everything on its GitHub pages — commit messages, issues, comments, pull requests,
discussions, release notes — is readable by anyone, so what may be named in it is a rule:

- **Public repositories, packages and services may be named freely.**
- **Private repositories may not** — not their names, their contents, their paths, their internal identifiers,
  nor which of them holds what. That includes sibling repositories in the same local workspace, the maintainers'
  own tooling and planning, and internal infrastructure.

When something genuinely lives somewhere private, **describe it rather than naming where it is** — *"a decision
recorded outside this repository"*. Nothing a contributor must follow may live only outside this repository:
it belongs here, in an `AGENTS.md`, a document under `docs/`, or a skill under `.agents/skills/`.

**Before writing anything others will read, use the `writing-in-public` skill**: what never goes in — other products'
plans and dates, personal and business details, legal self-assessment, internal infrastructure, security problems —
and why text posted to GitHub must be right the first time.

## What this repository is

One Git repository, no submodules:

| Path | What it is | Read first |
|------|------------|------------|
| `hq/` | The control plane — a Wasp app. The organisation's data and the entire user-facing UI. Dispatches work to Execution Sites; runs no agents | [`hq/AGENTS.md`](hq/AGENTS.md) |
| `site/` | The Execution Site — a plain Node server. Runs agent containers, holds workspace storage and the runtime data | [`site/AGENTS.md`](site/AGENTS.md) |
| `host/` | The host service — a plain Node server, run as the container `agenthix-host` on every machine. The one authority over that machine: installs and runs hq and the site through Docker; its CLI (`agenthix …`) is the same image's command | [`host/AGENTS.md`](host/AGENTS.md) |
| `console/` | The Fleet Console — a plain Node server, run from the image `agenthix-console` on hq's machine by default. The fleet admins' portal: listens on `127.0.0.1` only (on a machine Agenthix Cloud runs, also on one remote-access port while Cloud has it on), dials out to hq, and signs every command to a host service; no accounts and no authority of its own | [`console/AGENTS.md`](console/AGENTS.md) |
| `console-web/` | The Fleet Console's screens — a React app built with Vite into static files, which the Fleet Console's server serves behind its guards. Talks only to that server's API | [`console-web/AGENTS.md`](console-web/AGENTS.md) |
| `core/` | Shared TypeScript types and protocol definitions, consumed by `hq`, `site`, `host`, `console` and `console-web` | the code |
| `ui/` | `@agenthix/ui`, the shared web component library and design tokens, consumed by `hq` and `console-web` | [`ui/AGENTS.md`](ui/AGENTS.md) |
| `docs/` | Architecture, concepts (the domain model), decision records, the QA contract, units of work, and the user guide (`docs/guide/`) | [`docs/architecture/README.md`](docs/architecture/README.md), [`docs/concepts/README.md`](docs/concepts/README.md) |
| `front-door/` | An optional HTTPS front door (Caddy) for a machine that has none | [`docs/architecture/deployment.md`](docs/architecture/deployment.md) |
| `tests/cross-app/` | The cross-app suite: boots hq and a site against their test databases and tests them together (`npm run test:cross-app` at the root) | the code |
| `scripts/dev/` | Development helpers shared by both apps, such as pairing hq with its own site (`pair.sh`) | the `running-locally` skill |

An organisation's **HQ** is its own instance — one per organisation, self-hostable — and the single source of
truth for its data. **Execution Sites** are the execution layer only and hold no identity store; an
organisation can connect several, on other machines. Why HQ is the organisation's own, and not a central
service, is [ADR-0042](docs/adr/adr-0042-hq-is-the-orgs-own.md) — read it before proposing anything that moves
an organisation's data outward.

Skills committed here, for procedures some tasks need: **`writing-in-public`** (anything others will read),
**`running-locally`** (start hq and its site, pairing,
reaching hq from another device) and **`database-migrations`** (schema changes in either app), in
`.agents/skills/` (the open Agent Skills layout; `.claude/skills` links to it); and **`app-layout`** (hq's app shell), in `hq/.agents/skills/`. Deployment is [`docs/architecture/deployment.md`](docs/architecture/deployment.md).

## Code conventions

- **File size** (source and test files alike): at **300 lines**, consider splitting; at **500 lines**, stop and split into
  single-responsibility modules before continuing. If that is not possible, say why before going on.
- **TypeScript:** strict mode. No `any` unless unavoidable, with a comment saying why.
- **The two apps never import from each other.** `hq` and `site` are separate builds; what they share goes
  through `@agenthix/core` (and, for hq's UI, `@agenthix/ui`).
- **Colours come from the design tokens**, never a hex value in a component — see [`ui/AGENTS.md`](ui/AGENTS.md).
- **Comments** only where the logic is not obvious. No docstrings on simple functions, no comment restating the code.
- **Match the surrounding code** — naming, idiom, comment density.
- **A change to anything another part receives** — a channel message, an HTTP route or its answer, a socket event,
  a stored format — follows [`docs/architecture/versioning.md`](docs/architecture/versioning.md): its version moves,
  and nothing is removed without a deprecation mark first.
- **Verify by running things.** Types: `npm run typecheck` in the module (`npx tsc --noEmit` in `ui/`; in `hq/` a
  bare `npx tsc --noEmit` checks nothing). Logic: the test suite. A file's contents: read it.
  Never "verify" with a script that prints a conclusion written in advance.
- **When to run the tests:** while working, the ones for what you changed — the tests of the files you touched and
  the typecheck of their modules; the e2e specs for screens you changed; a module's integration suite when you changed
  a server operation or the data it reads; the cross-app suite when you changed what hq and a site say to each other.
  Before a pull request, the suites of every module it touched. **Before a unit of work merges to `main`, the full
  regression:** every module's typecheck, unit and integration suites, the cross-app suite, hq's e2e tests (its
  `not-secure` project included), the image start test (`scripts/images/start-test-all.sh`, which builds every image
  and starts it) and the install test (`scripts/install-test/run.sh`, which installs from those images at the
  machine's network address and walks through it in a browser; it refuses on a machine that already runs an HQ, and
  then runs on the release branch instead). CI runs the typecheck, unit and integration suites again on each pull
  request and each push to `main`; a release branch also gets the release build (every image on both architectures,
  built and started as the tag builds it), the install test and the guide's screenshots.

**Until the first release candidate, `0.1.0-rc.1`: a clean slate.** No install needs its data carried forward yet.
Never write code that converts existing rows, stored values or on-disk layout — old data and old locations are
ignored or wiped. From `0.1.0-rc.1` on, every schema change carries a release's data forward; remove this rule then.

## Writing and terminology

Use established terms or plain descriptive language — never coined shorthand or undefined jargon, and never a
term as if the reader already knows it. Prefer the industry term where one exists; otherwise describe plainly,
and define any non-obvious term on first use. No colours for state: say "passes", "fails", "issue", not "green"
or "red". Words about a person in the product are gender-neutral: their name, or "they" and "their".

## Contributing a change

Contributions are **small, self-contained changes**: a bug fix, a small feature, a documentation fix, a test that
was missing. Each is one issue and one pull request — no plan or design document is needed.

- **Start from an issue.** Find one, or open one with the bug-report form, and say on it that you are taking it.
  For anything beyond a small fix, agree the approach on the issue first.
- **Larger or architectural changes are planned by the maintainers.** You are welcome to start one — open an issue
  or a discussion with the idea, or a draft pull request that shows it — and the maintainers take it over as planned
  work, crediting you. Do not write a design spec or a plan under `docs/work/`; that folder holds the maintainers'
  units of work.
- **In the pull request:** tests that fail without your change, the typecheck and tests of every module you touched
  (*Code conventions* above), the user guide updated if what people see or do changed, and commits in the form
  `type(area): what changed`. [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) has the setup and the contributor
  agreement.

## For maintainers

How the maintainers plan, record and land work. Contributors can stop reading here.

### Documents and queued work

- **`docs/` describes the present** — architecture, concepts, the QA contract, and the decision records in
  [`docs/adr/`](docs/adr/README.md). A dated spec or plan never goes there.
- **A unit of work** — an initiative, operational work, a feedback loop, or a QA audit — is one folder,
  `docs/work/<YYYY-MM-DD>-<slug>/`, holding its design spec (if it has one) and its implementation plan. Its
  `execution/` folder is gitignored scratch, and `.scratchpad/` is never committed anywhere. **Never cite a
  gitignored path from a committed document** — it is dead for anyone else who clones the repository.
- **A decision that binds how the rest of the system is built is a decision record**, not queued work.
- **Queued work is an issue on this repository**, never a file, with an issue type (`Bug`, `Debt`, `Feature`,
  `Chore`) and a `Priority`.
- **QA** lives in `docs/qa/`: the [QA model](docs/qa/README.md), shared and versioned, and this repository's [settings](docs/qa/qa-strategy.md). A unit that changes behaviour writes the stories and
  scenarios for it when it closes, and tags the tests that cover them with `@SC-NNN` — never during its phases.
  A full QA audit is optional at a unit's close and required before a release, `0.1.0` the first; a pre-release
  (`-alpha.N`, `-rc.N`) needs none. Deferred findings are issues.

### Git

- **Branches:** one branch per unit of work, cut from `main`. Work goes on a branch; a typo or a one-line fix
  may go straight to `main`.
- **A contributor's pull request is squash-merged**: one commit on `main`, its message the pull request's title
  (`type(area): what changed`) and description, its author the contributor. Edit the title before merging if it
  does not read that way.
- **A unit's branch merges to `main` with `--no-ff`**, so each piece of planned work lands as one merge commit with
  its commits underneath. Fast-forward only for a branch that is genuinely one commit.
- **Before a merge, regroup the branch** into a few ordered commits with fixes folded into what they fix —
  unless its commits are cited somewhere, in which case leave them and write a clear merge message. Create a
  `backup/<branch>` before any rebase, reset or regroup.
- **Never merge to `main` or push without the owner's explicit approval** — each time.
- **A release is cut on a release branch**
  ([ADR-0137](docs/adr/adr-0137-a-release-is-cut-on-its-own-release-branch.md)), never on `main`:
  1. `release/<version>` is cut from `main` when a release is due; units keep merging to `main`, never into it.
  2. On it, and only there, the version is set in every `package.json` and lock file
     (`node scripts/check-versions.mjs <version>` checks them).
  3. **It proves everything a release does except publish**, in CI on every push: *Checks*, the install test, the
     guide's screenshots and the release build (`.github/workflows/release-build.yml`, the one definition the tag
     uses too: every image for amd64 and arm64, built and started, and core packed). All but *Checks* run on
     `release/**` and not on `main`. The full regression is not run again: it ran before each unit merged, and the
     branch adds only the version. Only fixes for what the bar finds go on it; anything larger is an issue or a unit
     of its own.
  4. When the work is ready, the release branch is merged into `main` locally with `--no-ff`, and **that merge commit
     is pushed to the release branch**, which proves it. The tag, `v<version>`, goes on it once the bar passes, so
     each release is one merge commit on `main`. **The tag only publishes** what the branch proved, and refuses
     unless all of it passed for the tagged commit.
  5. **If anything fails after the tag is pushed**, the tag and whatever that attempt published are deleted, the fix
     goes on the same release branch, and the same version is tagged again on the fixed commit. A new version number
     is only for a change to something released.
     - **A version that published is never published again**, even when it turns out not to work: someone may
       already have it. Its fix takes the next number: `0.1.0-alpha.3` after `0.1.0-alpha.2`, `1.0.2` after `1.0.1`.
       A patch that may be shaky can go out first as a release candidate (`1.0.1-rc.1`, then `rc.2`) and become
       final once it is proved; that is optional.
  6. Once published, `main` fast-forwards to the tagged merge commit and the branch is deleted (if `main` moved
     meanwhile, merge it into the release branch and prove it again first). One release branch is open at a time.
- **Checks on `main`:** a pull request merges only once the *All checks passed* check passes. The owner pushes to
  `main` without waiting for it, after the full regression; when a run on such a push fails, the fix is the next
  push. That is the only way a commit with failing checks reaches `main`.
- **When to commit:** during planned implementation, at each task boundary. During patching, review or a
  walkthrough, only when the owner says so. **Documents** — plans, specs, decision records — only
  with the owner's approval, whatever the context.
- A change that also needs another repository updated is a separate commit there; there is no cross-repository
  commit.
- **Taking over a contribution:** every commit built on a contributor's work carries a `Co-authored-by:` line for
  them, and the merge names their pull request. Anything copied in from elsewhere is listed with its licence in
  `LICENSING.md`.

### Working with agents

**Choose each subagent's model for its task** — the least capable one that does it well — and always pass it
explicitly; a subagent given none inherits the lead's.

**Before running subagents in parallel, write down a resource strategy and put it in every brief.** Parallel
agents share one machine, and more than one at a time has exhausted memory here. It answers four questions,
scaled to the work — three agents reading code need a sentence, six building in their own worktrees need all four:

1. **What will they contend for?** Memory and CPU (typechecks, tests, builds, containers), fixed ports and the
   shared test databases, Docker, an external service's rate limit or budget, the same files.
2. **What runs one at a time?** For example, a machine-wide lock around heavy commands; suites that need fixed
   ports run once, by the lead, after the work is combined. Agents run the tests for what they changed and
   the typecheck of the modules they touched; the full regression runs once, when the unit closes.
3. **How is it watched?** Free memory, load and swap — or an external service's errors and spend — each with a
   threshold that raises an alert, and an alert when it recovers.
4. **What happens at a limit?** Decided in advance: which agents pause first, and what is reduced before
   anything is stopped.

Reassess when the work changes shape, for example when research turns into building.
