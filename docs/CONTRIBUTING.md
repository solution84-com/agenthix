# Contributing to Agenthix

Thank you for wanting to help. Bug reports, fixes, documentation and ideas are all welcome.

## Before you start

- **Questions and ideas** go to the repository's **Discussions**. **Bugs** go to **Issues**, using the bug report
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
  paid features, which the Elastic License alone does not; you keep the copyright in what you wrote. A check on your
  first pull request asks you to agree.

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
(cd core && npm install && npm run build)  # hq and site use core's build
(cd ui && npm install --legacy-peer-deps)
(cd hq && npm install && npx wasp install)
(cd site && npm install)
(cd site/opencode-plugin && npm install)   # site's tests import it
```

Then start the site and HQ, each in its own terminal:

```sh
cd site && npm run dev       # the Execution Site, on port 4201
cd hq && npx wasp start      # HQ, on http://localhost:4100
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
   | `ui` | `npx tsc --noEmit` | — |
   | `hq` | `npm run typecheck` | `npm test`, and `npm run test:integration` for anything that reads or writes data |
   | `site` | `npm run typecheck` | `npm test`, and `npm run test:integration` |

   In `hq/`, a bare `npx tsc --noEmit` checks nothing; use `npm run typecheck`.
3. **If your change alters what people see or do**, update the [user guide](guide/README.md) in the same pull
   request, and its screenshot recipes if a screen changed.
4. **Title the pull request** in the form `type(area): what changed`, for example
   `fix(site): a run that times out says so`. It lands on `main` as one commit — the title is its message, the
   description its body, and you its author — so your branch's own commits can be as many and as rough as you
   like.

## Pull requests

- One purpose per pull request, with a description of what changed and why, and how you checked it.
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
