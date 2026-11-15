# Agenthix — working in this repository

How to work in this repository. `CLAUDE.md` is a symlink to this file. **For work in a module, read that
module's `AGENTS.md` too** (`hq/`, `site/`, `host/`, `console/`, `console-web/`, `ui/`) — each adds only what applies there.

Everything up to *For maintainers* applies to everyone, contributors included. This file holds only what every turn
needs; procedures are skills, loaded when a task calls for them.

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

**Procedures are skills**, in `.agents/skills/` and each module's `.agents/skills/` (the open Agent Skills layout;
`.claude/skills` links to it). A tool that does not load skills reads their `SKILL.md` files there.

Deployment is [`docs/architecture/deployment.md`](docs/architecture/deployment.md). Every port and address block is in
[`docs/architecture/ports.md`](docs/architecture/ports.md), written from `core/src/ports/ports.ts`; a number never goes
into code or a document as a new literal.

## Code conventions

- **File size** (source and test files alike): at **300 lines**, consider splitting; at **500 lines**, stop and split into
  single-responsibility modules before continuing. If that is not possible, say why before going on.
- **TypeScript:** strict mode. No `any` unless unavoidable, with a comment saying why.
- **The two apps never import from each other.** `hq` and `site` are separate builds; what they share goes
  through `@agenthix/core` (and, for hq's UI, `@agenthix/ui`).
- **Colours come from the design tokens**, never a hex value in a component — see [`ui/AGENTS.md`](ui/AGENTS.md).
- **Binaries.** A binary the source needs — to build, run or test — is committed, kept small, and added rather than
  replaced. A binary a release produces — screenshots, recordings, builds — is that release's asset, and is never
  committed.
- **Comments** only where the logic is not obvious. No docstrings on simple functions, no comment restating the code.
- **Match the surrounding code** — naming, idiom, comment density.
- **A feature that is not ready ships behind a flag with a stage**, checked where it runs:
  [`docs/architecture/feature-flags.md`](docs/architecture/feature-flags.md).
- **A change to anything another part receives** — a channel message, an HTTP route or its answer, a socket event,
  a stored format — follows [`docs/architecture/versioning.md`](docs/architecture/versioning.md): its version moves,
  and nothing is removed without a deprecation mark first.
- **A dependency is added or changed by the rules** in [`docs/architecture/dependencies.md`](docs/architecture/dependencies.md),
  never by switching a check off: no `--force`, no `legacy-peer-deps`.
- **Verify by running things**: a typecheck, the tests, or reading the file; never a script that prints a conclusion
  written in advance. Which tests, when, and which model a model check runs on: the `testing-a-change` skill.

**Every migration keeps the data.** Each app's migrations start from one initial migration, made before `v0.1.0`.
From it on, every schema change is a new migration that carries an installation's rows forward (add, backfill, then
tighten), and the migration check proves it. Something stored that a change can't carry is a breaking change, made
only as [versioning](docs/architecture/versioning.md#stored-data) says.

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
  (the `testing-a-change` skill), the user guide updated if what people see or do changed, and commits in the form
  `type(area): what changed`. [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) has the setup and the contributor
  agreement.

## For maintainers

How the maintainers plan, record and land work is the `planned-work` skill; releasing is the `releasing` skill. Two
rules hold in every turn:

- **Never merge to `main` or push without the owner's explicit approval**, each time.
- **Documents** (plans, specs, decision records) are committed only with the owner's approval.
