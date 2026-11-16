# Contributing to Agenthix

Thank you for wanting to help. Bug reports, fixes, documentation and ideas are all welcome.

## Before you start

- **Questions and ideas** go to the repository's **Discussions**; how a request for a feature is handled is in
  [`TRIAGE.md`](TRIAGE.md). **Bugs** go to **Issues**, using the bug report
  form, which asks for your version, your operating system and the logs.
- **What to contribute: small, self-contained changes** — a bug fix, a small feature, a documentation fix, a missing
  test. Each is one issue and one pull request; no design document or plan is needed.
- **For anything beyond a small fix, agree the approach on the issue first**, before you spend time on it.
- **Larger or architectural changes are planned by the maintainers.** You are welcome to start one — an issue or a
  discussion with the idea, or a draft pull request that shows it — and the maintainers take it over as planned work,
  crediting you.
- **The licence.** Agenthix is source-available under the Elastic License 2.0, with an additional permission;
  [`LICENSING.md`](../LICENSING.md) says what that means. Your contributions are part of Agenthix under the same
  licence.
- **The contributor agreement.** Before your first pull request can be merged, you agree to the
  [contributor licence agreement](../CLA.md), once. It lets Solution84 use your contribution in Agenthix Cloud and in
  paid features, which the Elastic License alone does not; you keep the copyright in what you wrote. On your first pull
  request, the check **Contributor licence agreement** comments with the sentence to reply with; reply with it once,
  and the check passes then and on your later pull requests.

## Set up

You need Node.js 24 (`.nvmrc`), Docker with Compose v2, and Git.

```sh
git clone https://github.com/solution84-com/agenthix.git
cd agenthix
git config core.hooksPath .githooks        # the repository's git hooks (root `npm install` also sets it)
docker compose up -d                       # the development databases
cp hq/.env.server.example hq/.env.server
cp hq/.env.client.example hq/.env.client
cp site/.env.server.example site/.env.server
(cd core && npm ci && npm run build)       # hq and site use core's build
(cd ui && npm ci)
hq/scripts/install.sh                      # hq, Wasp's own packages and the code Wasp generates
(cd site && npm ci)
(cd site/opencode-plugin && npm ci)        # site's tests import it
```

`npm ci` installs exactly what each module's `package-lock.json` pins. hq's lockfile also pins the packages of the code
Wasp generates, which a fresh clone does not have yet, so hq is installed with its script rather than by hand: a plain
`npm install` in hq before that code exists drops them from the lockfile.

Then start the site and HQ, each in its own terminal:

```sh
cd site && npm run dev       # the Execution Site
cd hq && npx wasp start      # HQ
```

Run Wasp as `npx wasp`, from `hq/`: it is pinned in hq's dependencies, so no global install is needed.

## How the code is arranged

Read [`AGENTS.md`](../AGENTS.md) first: it holds the conventions every change follows, and points to each module's
own `AGENTS.md`. The architecture is explained, for someone new to it, in
[`docs/architecture/`](architecture/README.md).

| Folder | What it is |
|---|---|
| `hq/` | HQ — the organisation's data and the whole web interface |
| `site/` | The Execution Site — runs agents in containers |
| `core/` | Types and the protocol HQ and sites share |
| `ui/` | The shared component library |
| `docs/` | Architecture, concepts, decision records, the QA contract, and the [user guide](guide/README.md) |

## Making a change

1. **Write a test that fails without your change**, then make it pass.
2. **Check it** in every module you touched:

   | Module | Typecheck | Tests |
   |---|---|---|
   | `core` | `npm run typecheck` | `npm test` |
   | `ui` | `npm run typecheck` | `npm test` |
   | `hq` | `npm run typecheck` | `npm test`, and `npm run test:integration` for anything that reads or writes data |
   | `site` | `npm run typecheck` | `npm test`, and `npm run test:integration` |
   | `host` | `npm run typecheck` | `npm test`, and `npm run test:container` for anything that needs a real Docker |
   | `console` | `npm run typecheck` | `npm test` |
   | `console-web` | `npm run typecheck` | `npm test` |
   | `relay` | `npm run typecheck` | `npm test` |

   `core` must be built first (`cd core && npm run build`) for every module but `core` itself; `ui` is checked with hq's
   installed React linked into `ui/node_modules`, as the *Link hq's React into ui* step of
   [`.github/workflows/checks.yml`](../.github/workflows/checks.yml) does. Each module's `AGENTS.md` has its details.

   In `hq/`, a bare `npx tsc --noEmit` checks nothing; use `npm run typecheck`.
3. **If your change alters what people see or do**, update the [user guide](guide/README.md) in the same pull
   request, and its screenshot recipes if a screen changed.
4. **Title the pull request** in the form `type(area): what changed`, for example
   `fix(site): a run that times out says so`. It lands on `main` as one commit — the title is its message, the
   description its body, and you its author — so your branch's own commits can be as many and as rough as you
   like.
5. **If your change breaks something an installation relies on** — it removes a core export, an `agenthix` command
   or option, a `host.env` setting or a name an installation creates, moves a protocol's major or a stored format's
   number, or has a migration that drops or narrows a column — mark the title `type(area)!: what changed` and end the
   description with a footer saying what an installation must do: `BREAKING CHANGE: <what to do>`. A release finds
   every such break and refuses one that no marked commit explains; the footer's words open its release notes
   ([versioning](architecture/versioning.md#breaking-changes)).

## The changelog

[`CHANGELOG.md`](../CHANGELOG.md) lists what people who use or run Agenthix will notice. **A change that a user or
operator notices adds one line under *Unreleased*** in the same pull request, in the section that fits (Added,
Changed, Deprecated, Removed, Fixed or Security), in plain words about what they get, with no commit hashes. A
refactor, a test or a change to the repository's own tooling needs no entry. A security entry says only what is now
enforced.

## Pull requests

- Open every pull request against `main`. The `release/…` branches are the maintainers', for preparing a release.
- One purpose per pull request, with a description of what changed and why, and how you checked it.
- If a user or operator would notice the change, add a line to the changelog (see above).
- Run the checks in *Making a change* for every module you touched before you open it. The same checks run on every
  pull request: typecheck and tests for each module, and the guide's screenshots when screens or the guide change. A
  pull request merges once they pass and a maintainer has reviewed it.
- Say in the pull request if any of it is someone else's work, and under which licence.

## Credit

Your commits keep your name. If a maintainer carries your work on — a larger change you started — their commits name
you with `Co-authored-by:`. If your change includes anything you did not write, say where it comes from and its
licence in the pull request; it is listed in [`LICENSING.md`](../LICENSING.md).

## Conduct

Everyone taking part follows the [code of conduct](../CODE_OF_CONDUCT.md). Report a problem to conduct@agenthix.com,
not in a public issue.

## Reporting a security problem

Do not open a public issue. Report it privately through the repository's **Security** tab
(**Report a vulnerability**).
