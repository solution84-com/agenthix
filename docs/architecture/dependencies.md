# Dependencies

Agenthix is built from outside software: npm packages, base images and workflow actions. Each is pinned to an exact
version, so a release is exactly what was tested, and each moves only when we move it: once a month, in **the monthly
dependency updates**, made and tested on the dev machine, under rules that keep every package within what the others
require of it. The decision is [ADR-0192](../adr/adr-0192-dependencies-are-updated-locally-once-a-month-and-every-security-alert-is-decided.md);
this document is how it works today.

## What we depend on, and how each is pinned

| Level | Where it is named | Pinned by | Moved by |
|---|---|---|---|
| **npm packages** | each module's `package.json` (the root, `hq`, `site`, `site/opencode-plugin`, `host`, `console`, `console-web`, `ui`, `core`, `relay`, `tests/cross-app`) | its `package-lock.json` | `scripts/deps/npm.mjs` |
| **Images from outside** | the `FROM` lines of every Dockerfile; `image:` in compose files and in workflows' service containers; image constants in code (the Postgres and Caddy images the host service runs) | a digest (`name:tag@sha256:…`) | `scripts/deps/images.mjs` |
| **Workflow actions** | the `uses:` lines of `.github/workflows/` | a commit, with the release in a comment (`@<commit> # v7.0.1`) | `scripts/deps/actions.mjs` |
| **Node** | `.nvmrc`, every Dockerfile's `FROM`, each module's `engines`, and the comments, documents and test scripts that name the version | the exact version in `.nvmrc` | `scripts/deps/images.mjs`, with the images |
| **cosign** | the host image and the workflows' `COSIGN_VERSION` | the exact version, held equal by a test | `scripts/deps/images.mjs`, both together |

Our own images (`agenthix-…`) are built here and are not outside dependencies. The development tools a person
installs on their own machine are not covered.

## The rules

Each rule exists because breaking it once cost something. **The check in Checks holds the ones marked ✓.**

| Rule | Why |
|---|---|
| **`package.json` states the range we accept; the lockfile is the pin.** Versions are ranges (`^1.2.3`), and an update moves only the lockfile, within them. ✓ | An exact version never moves, so a patch or a security fix could only be taken by editing the file by hand. |
| **A version is exact only where an outside tool needs it** (the allowed list, `ALLOWED_EXACT` in `scripts/deps/check.mjs`): hq's Wasp command line (`@wasp.sh/wasp-cli`), `prisma` and `typescript`; site's `prisma` and `@prisma/client`; `site/opencode-plugin`'s `@opencode-ai/plugin`. ✓ | Wasp builds against one Prisma and one TypeScript, and compares the text of hq's `package.json` with its own list, so the update script never rewrites a range. Site's Prisma client and command line move as one. The OpenCode plugin is built against the OpenCode the agent image installs, so it equals the image's `OPENCODE_VERSION`. |
| **Below 1.0, a caret already means patch only** (`^0.28.2` allows `0.28.x`). | npm reads it that way, so the 0.x packages need no list of their own. |
| **TypeScript takes patches only** (`~6.0.3`; hq's is exact). ✓ | TypeScript does not follow semantic versioning: a minor version may break the typecheck. |
| **One version across modules** for `typescript`, `esbuild` and `prisma`, counted in each module that names the package itself. ✓ | Two compilers or two Prismas give two answers to the same code. A copy another package brings in is that package's choice, and is not counted. |
| **The Node types follow Node's major**: `@types/node` is `^24.0.0` (the text Wasp requires), on the major `.nvmrc` names. ✓ | Types from another Node describe functions the running Node may not have. |
| **Peer dependencies are checked everywhere**: no `legacy-peer-deps` in any `.npmrc`, Dockerfile, workflow or script. ✓ | Switched off, it hid a real conflict: site's Claude Agent SDK needed zod 4 while site had zod 3. A conflict now fails `npm install`, where the update script sees it. |
| **Every image from outside names a digest.** ✓ | A tag can be moved by its publisher; a digest is the image we tested. |
| **Updates are minor and patch only.** A major is taken by hand ([below](#taking-a-major)). | A major is a change of behaviour, decided on purpose; bundled with routine fixes it is neither reviewed nor proved on its own. |
| **Every install installs exactly the lockfile** ([below](#exact-installs)). | Otherwise CI, the images and a new checkout each run versions nobody committed. |

Nobody changes a dependency by switching a check off: no `--force`, no `--legacy-peer-deps`. A conflict is resolved
by choosing versions that agree.

## The check

`node scripts/deps/check.mjs` (plain Node, no install needed) is the job **Dependencies follow the rules** in Checks.
It is selected whenever a change touches a file it reads: a `package.json`, a lockfile, an `.npmrc`, a `tsconfig`,
a Dockerfile, `.nvmrc`, a workflow or `scripts/deps/` (`scripts/affected.mjs`). The same job runs the tests of the
check and of the update scripts. In a checkout it reads only files Git tracks. On the dev machine, the full regression runs
the same two (its step `dependency-rules`, [below](#what-the-full-regression-proves-locally)).

It prints nothing and passes when every rule holds; otherwise it prints one line per failure, `module: file: rule`,
and fails:

```text
ui: ui/package.json: zod is exact (4.3.6) and is not on the allowed list; use a range
hq: hq/.npmrc:1: legacy-peer-deps is set; the install must resolve peer dependencies properly
root: package-lock.json: typescript is on more than one version: 6.0.3 in root, hq; 6.0.2 in core
site: site/package-lock.json: @types/node is 22.19.1 but .nvmrc is Node 24; the major must match
host: host/package.json: typescript is "^6.0.3"; its range must be patch-only (~)
site: site/compose.yml:4: postgres:17-alpine is not pinned by a digest
```

What to do: write a range (`^` for most packages, `~` for TypeScript); remove the line that switches the peer check
off and resolve the conflict it was hiding; move the module that differs to the others' version, or all of them
together (a lockfile is regenerated with `npm install` in that module; hq's with `hq/scripts/install.sh`
[below](#exact-installs)); pin an image by its digest (`docker buildx imagetools inspect <name>:<tag>` prints it). An
exact version that an outside tool really requires goes on the allowed list, with the reason, in the same change.

## The monthly dependency updates

Once a month, on the dev machine, and tested there before anything is pushed:

1. **A branch** `chore/deps-<yyyy-mm>` from `main`.
2. **The updates**: `scripts/deps/update.sh --record`, from a clean checkout. It needs the network (the npm registry,
   the image registries, github.com):
   - **npm**: `npm update --package-lock-only` in every module with a lockfile, within its ranges. Only lockfiles
     move; a `package.json` that changes, or an update npm refuses (a peer conflict), fails the run and names the
     module. hq is compiled first when it has not been, since its lockfile also pins the packages of the code Wasp
     generates.
   - **Images**: each to the newest digest of its tag, and its tag to the newest of the same shape within its major
     (Alpine `3.23` to `3.24`; Caddy's `2-alpine` keeps its tag). Node moves to the newest version of the major
     `.nvmrc` names that every image variant in use has, and is rewritten everywhere the old version is named, except
     the records of what was (`docs/work/`, `docs/adr/`). cosign moves in the host image and the workflows together.
   - **Actions**: each to the newest release of its major, its commit and its comment (read with `git ls-remote`).
   - **The rebuild epoch** (`rebuildEpoch` in `scripts/images/parts.json`) is raised by one, every run. It is an input
     of every image's content key ([versioning.md](versioning.md#an-images-content-key)), so the next release build
     rebuilds every image and takes the fixes to the system packages the images install, which are not pinned.
   - **The run is recorded** in `scripts/deps/taken.json`: the date, **the month** (`"month": "2026-11"`, in
     Australia/Sydney time), and what moved, by module, version to version. With nothing to update, the run is still
     recorded and the epoch still raised.
   - It prints what moved, then every open security alert to decide ([below](#security-alerts)).
3. **The full regression, with the upgrade test**: `node scripts/regression/run.mjs --full --upgrade-test` (the
   `testing-a-change` skill). The updates touch every module and move the images an installation runs, so the upgrade
   test is asked for, whatever changed; `update.sh` ends by saying so. Fix what fails on the branch (usually a link between files that move together: a version
   named in two places, a type a new release tightened). An update that still fails after two attempts is held back
   for the month (its range pinned in that module, said in the commit) rather than worked around.
4. **Every open security alert decided** ([below](#security-alerts)).
5. **One push**; Checks confirms; merged to `main` with the owner's say-so. Release ships what `main` holds.

Without `--record`, `update.sh` makes the same changes and prints what moved, without recording the run or raising the
epoch.

### Knowing a month has passed

The record is the repository itself: **a month is done when the month in `taken.json` is the current month**, in
Australia/Sydney, wherever the check runs, so the dev machine and GitHub's runners (UTC) agree on when the 1st is.
`scripts/deps/due.mjs` decides, and every place below calls it:

| From | Where | What it says or does |
|---|---|---|
| The 1st of a month not done | every dev start (`scripts/dev/fresh.sh`) and the top of the full and affected regressions' output | "Dependency updates for December aren't done: run the monthly dependency updates." |
| The 8th | the same places, saying *overdue* in place of *aren't done* | "Dependency updates for December are overdue: run the monthly dependency updates." |
| Any day of a month not done | Release's stage 0 stops, starting nothing | "Dependency updates for December aren't done: run the monthly dependency updates first." |

A reminder never fails a dev start or a regression. **Release's stage 0 is the only enforcement**: Checks does not
check the month, since a failing Checks on `main` would only stop Release, which stage 0 already does, and would hold
up contributors' pull requests for something not theirs. A patch on a release branch is not stopped, and neither is a
Release dry run.

## Exact installs

What runs is what was committed. Everywhere a module is installed for CI, an image or a new checkout:

- **`npm ci`**, which installs exactly the lockfile and never writes it: every Dockerfile and every workflow.
- **hq through `hq/scripts/install.sh`.** hq's lockfile also pins the packages of the code Wasp generates (the npm
  workspaces under `.wasp/out`), which a clean checkout does not have yet. `npx wasp install` runs `npm install`
  before that code exists and drops those packages; the script puts the lockfile back before `npx wasp compile`, and
  fails if the lockfile differs at the end. A plain `npm install` in hq before the first compile takes them at their
  newest. A new checkout installs as [CONTRIBUTING.md](../CONTRIBUTING.md#set-up) says.
- **The lockfile hold**: every CI job that installs runs `scripts/deps/held.sh` after its installs, which fails when an
  install changed a committed lockfile; every regression runs it too (`lockfiles-held`), after its own installs.
  Commit each lockfile from a clean install of its module.

## Local copies

The monthly dependency updates change lockfiles. On a local copy:

- **The dev start checks** (`scripts/dev/fresh.sh`, run first by `hq/scripts/dev/start.sh` and by the
  `[dev:site] Start` task, so by `[dev] Start All`). It fetches `origin` and stops when the branch is behind its
  upstream ("This branch is behind GitHub: pull first"); it never pulls, so local work is never moved behind your
  back. Then, in each module already installed, it runs `npm install` when the lockfile is newer than the last install
  (hq's install script when Wasp's code is not generated). It says so when `.nvmrc` names another Node than the one
  running, and says, one line each, when the monthly dependency updates are due and when security alerts need a
  decision. Neither of those stops the start.
- **After a Node move**, install that Node on the dev machine (`nvm install`); the updates' summary says when it moved.
- **Git refuses a push** of a branch behind GitHub, so the updates are never pushed over.

## Security alerts

GitHub's **security alerts** (Dependabot alerts) are on in the repository's settings; Dependabot's version updates are
not used. They list every known hole in what our lockfiles install, and change nothing. **Every alert gets a
decision**; the count is never the goal, the exposure is:

| Decision | When | Where it is recorded |
|---|---|---|
| **Fixed** | A version within range, a removal, or a major taken on purpose ([below](#taking-a-major)) | The fix itself; GitHub closes the alert |
| **Dismissed, with a reason** | Not used, not reachable from outside, or a tolerable risk | Dismissed in GitHub with the reason |
| **Deferred, to a named month** | Its fix needs a major or another change first | `scripts/deps/deferred.json`, committed; it comes back in that month |

A fix is never a workaround, and no check is switched off to clear an alert.

**How soon:** a **critical or high alert in shipped code** is decided within **7 days** of GitHub opening it: warned
about from that day, at every dev start and at the top of the full and affected regressions, and after day 7 Release
stops. *Shipped* is what GitHub calls a runtime dependency, in any module but the root's tools and the cross-app suite,
which no image installs; GitHub reports `site/opencode-plugin` as development. Any other alert (medium or low, or
development-only) is decided in the next monthly dependency updates; the reminder line counts them only while those
updates are due.

`scripts/deps/security.mjs` reads the open alerts with `gh api` (your own GitHub login on the dev machine; in Release,
the workflow's token with `vulnerability-alerts: read`), leaves out those deferred until their month, and says which
need a decision and by when. A dismissed alert is no longer open, so it is not read again:

- `--line`, at every dev start: "2 security alerts need a decision (high: undici in hq, 3 days left)." Silent when
  the alerts can't be read (no login, no network).
- `--release`, in Release's stage 0: stops past the 7 days, and when the alerts can't be read.
- `--triage`, at the end of `update.sh` and whenever an alert is to be decided: every open alert by package and module,
  with its severity, whether it ships, the version that fixes all of them and when they must be decided, then the
  deferred ones.

**A deferral** in `deferred.json` is one entry per package and module: the alert numbers it covers, the reason, and
the month to look again (`lookAgain`). Those alerts are left out until that month, in Sydney time, and come back from
its first day. The two entries today:

```json
[
  {
    "package": "morgan",
    "module": "hq",
    "alerts": [84, 122, 125],
    "reason": "Wasp's generated server pins morgan ~1.10.0; the fix (1.12.1) needs Wasp's next version. Risk: log forging in hq's own request log, no data exposure.",
    "lookAgain": "2026-12"
  },
  {
    "package": "@opencode-ai/plugin (toml, zod, effect)",
    "module": "site/opencode-plugin",
    "alerts": [188, 189, 190, 191, 192, 193],
    "reason": "Development build of the site's OpenCode plugin; the versions come from OpenCode's plugin package, pinned to the OpenCode the agent image installs. Fixed by the next OpenCode version, its own change.",
    "lookAgain": "2026-12"
  }
]
```

**A dismissal** is made in GitHub, on the alert, with the reason GitHub asks for and a comment saying why: not used,
not reachable from outside, or a tolerable risk. The repository keeps no copy of it.

## What the full regression proves locally

GitHub confirms; it is not where we find out. Every check a workflow makes that a dev machine can make is a step of
the full regression (`node scripts/regression/run.mjs --full`, the `testing-a-change` skill), so a change proved there
passes on GitHub first time. Beside each module's typecheck, unit and integration tests, the images, the install test,
the end-to-end and cross-app suites and the guide's capture, it runs:

| Step | What it proves | GitHub runs it in |
|---|---|---|
| `dependency-rules` | The rules above, and the tests of `scripts/deps/` | Checks |
| `lockfiles-held` | No install changed a committed lockfile | Checks, in every job that installs |
| `workflows-lint` | The workflows and their shell (`actionlint` with `shellcheck`; it fails, saying how to install them, when either is missing) | Lint workflows |
| `scripts-tests`, `release-scripts-tests` | The regression map's, the robots bundle's and the contributor agreement's script tests; the release scripts' and the install test's stand-in model's | Checks; Release build; Install test |
| `core-package` | core installs as an outside project would (`check:package`) and packs as the release packs it | Checks; Release build |
| `host-build`, `console-build`, `console-web-build` | The builds, and the host service's bundles start (`check:bundles`) | Checks |
| `guide-compare` | Each guide screenshot against the one its page links (`npm run guide:compare` in hq; the releases are read with `GH_TOKEN`, else `gh auth token`) | Guide screenshots |
| `migration-check` | The migrations keep every row, from the newest release tag (`scripts/migration-check/run.sh`) | none: only here |
| `upgrade-test` | An installation upgrades with its data, and is put back after a forced failure, from the newest release (`scripts/upgrade-test/run.sh`) | none: only here |

The upgrade test runs only when what it proves changed since the base: a migration, the host service's upgrade
(`host/src/upgrades/`), hq's or the site's images, or the Postgres image the host service names; and always with
`--upgrade-test`. Its forced failure waits 90 seconds for hq (`UPGRADE_TEST_HQ_WAIT_SECONDS`), a setting only a
development build of the host service reads (`HOST_DEV_HQ_WAIT_SECONDS`).

The settings a CI job gives are the scripts' own, so both run the same thing: Wasp's telemetry off, hq's larger Node
heap for its typecheck and compile, and the robots bundle's token for the image builds. What only GitHub can do
(keyless signing, publishing, the contributor agreement on a pull request, the registry's cleanup) has its scripts'
tests run here instead.

## Taking a major

A major version is never taken by the monthly dependency updates. It is taken on purpose, usually only when something forces it (a package
we depend on requires it, or the version we are on stops receiving fixes):

1. **Everywhere at once**: every module that uses the package moves in the same change, so the one-version rule holds.
2. **Its own change**, holding nothing else, with what it breaks fixed in it.
3. **Proved** by every touched module's typecheck and tests, the full regression (the `testing-a-change` skill), and
   a Release dry run on its branch.
4. **Recorded** in the list below: the month, the package, where, and why.

A Node major also moves `.nvmrc`, `@types/node`'s range (the text Wasp requires) and every image together. A Wasp
release moves hq's pinned Wasp command line, Prisma and TypeScript to the versions it names, and the other modules'
TypeScript and Prisma with them.

### Majors taken

| When | What | Where | Why |
|---|---|---|---|
| November 2026 | zod 3 to 4 | `site` | Site's Claude Agent SDK requires zod 4; hq was already on it |
| November 2026 | TypeScript 5.8 and 5.9 to 6.0 | every module | The version hq's Wasp uses; three versions became one |
