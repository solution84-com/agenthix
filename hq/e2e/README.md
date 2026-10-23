# hq end-to-end tests (Playwright)

Browser-level end-to-end tests for hq's web app. Tool: **Playwright**
(`@playwright/test`). The mobile client lives outside this repository and has its
own tests there.

## Prerequisites

The suite runs against an **already-running dev server** — it does not boot one.

1. Postgres reachable and `DATABASE_URL` set in `.env.server`.
2. Dev server up: `./scripts/dev/start.sh` (or `npx wasp start`).
   - Client (Vite) and server (Express) are on the development ports in `core/src/ports/ports.ts`
     (`scripts/dev/start.sh` prints their addresses; all ports are in [`docs/architecture/ports.md`](../../docs/architecture/ports.md)).
3. Browsers installed once: `npx playwright install chromium`.

## Run

```bash
npm run e2e          # headless
npm run e2e:ui       # Playwright UI mode (watch / debug)
```

Name the addresses if hq runs elsewhere, for example one started on free ports (the guide's screenshots do this):

```bash
E2E_CLIENT_URL=<hq's web address> E2E_SERVER_URL=<hq's server address> npm run e2e
```

## What's covered

| Spec | What it covers | Mutates state? |
|---|---|---|
| `canary.spec.ts` | `GET /health` (200, `{ status: 'ok' }` and nothing else) · `GET /api/auth/bootstrap-status` (boolean) · unauthenticated `/` → auth page redirect + render | No |
| `login.spec.ts` | Sign in, invite-only notice, sign out, "Remember me" keeps only the username | Signs in and out |
| `shell.spec.ts` | The app shell on a wide screen: Home after sign-in, the navigation, its highlighting and collapse, the panels | No |
| `mobile-responsive.spec.ts` | The shell at 375px: no horizontal scroll, the drawer, full-screen panels | No |
| `projectsBoards.spec.ts` | The Projects screen: filters, empty states, Boards and Workspaces views, return to the list after a delete | The delete test (`E2E_DELETE_PROJECT_KEY`) |
| `taskDelete.spec.ts` | Deleting a task needs a second, confirming click | Yes (`E2E_TASK_KEY`) |
| `executionSiteRegistry.spec.ts` | The registry list, the registration-token and device-code routes gone, project placement | Yes |
| `mobilePairing.spec.ts` | The mobile pairing page: QR, link, countdown, regenerate | Creates pairing codes |
| `chatStreaming.spec.ts` | An assistant reply streams over the socket | Yes; needs an agent with a runnable site |
| `workforceConfirm.spec.ts` | Confirming a workforce proposal returns to `/org` | Yes (`E2E_REVIEW_TASK_ID`) |
| `sessionPrivacy.spec.ts` | A conversation is readable only by the person who opened it — see below | Seeds its own data |
| `setup.spec.ts` | First-admin setup: the account, how agents reach AI (Agenthix Cloud greyed, *not available yet*), a model provider, voice, the organisation with its time zone, the last look — see below | Yes, on a fresh HQ |
| `notSecure.spec.ts` | At a plain-http network address: voice greyed, a conversation started and a message sent, a link copied — see below | Yes |
| `install/walkthrough.spec.ts` | HQ as installed, run by `scripts/install-test/run.sh` — see below | On the test's own install |

The canary is deliberately **read-only** so it needs no test-data setup. It
proves the harness wires up end-to-end: server API, the React app, the router,
and the auth guard. Every spec that signs in uses the seeded e2e accounts and the
helpers in `fixtures/auth.ts`; a spec whose data is not there skips rather than
fails.

No spec calls a real model. `playwright.config.ts` starts a stand-in endpoint on a free port it chooses when it loads (`E2E_STAND_IN_PORT`)
(`scripts/install-test/stand-in-model.mjs`), and the `stand-in` setup project, signed in as `e2e-admin`, adds it to the
organisation's providers (an own OpenAI-compatible endpoint) and makes it the default conversation and worker model for
the run; `stand-in-teardown` removes it and puts the defaults back. An organisation that already has an own endpoint is
left as it is.

No spec reaches a vendor either. HQ checks a provider's key with its vendor before it stores it. A model provider is
added as an own endpoint at the stand-in, which answers the check. The speech vendors (AssemblyAI, Inworld) can only be
checked at their own address, so the specs and recipes that add them answer the browser's add-provider call themselves
(a route intercept, `fixtures/voiceProviders.ts`) or leave the form unsaved, and put the provider in the database with an
obviously fake key (`fixtures/add-provider.mjs`, which reads `DATABASE_URL`, else `.env.server`). Such a provider is dated
so that HQ never re-checks it with its vendor.

## At an address that is not secure (the `not-secure` project)

A browser gives some features (`crypto.randomUUID`, the clipboard, the microphone) only to a secure page: https, or
`localhost`. HQ is also opened over plain http at a network address, where they are missing, so the `not-secure`
project serves the same dev server at a made-up name, `hq-e2e.local`, that Chromium resolves to this machine
(`--host-resolver-rules`). It runs `notSecure.spec.ts`, which first checks the page is not secure, and the specs that
send a message and copy text (`chatStreaming`, `mobilePairing`). `npm run e2e` runs it with the rest; on its own:

```bash
npx playwright test --project not-secure
```

Checks also fails when browser code uses one of these features directly instead of through a helper that handles
its absence (`node scripts/check-secure-page.mjs` at the repository's root).

## HQ as installed (the `install` project)

`scripts/install-test/run.sh`, at the repository's root, builds every image, installs HQ at this machine's network
address over plain http under a namespace of its own, and runs `install/walkthrough.spec.ts` against it: the first
admin made, a message sent to a stand-in model (no real model is called), the speech providers put in as described
under the setup spec below, a conversation opened and the Fleet Console opened. It refuses on a machine that already runs an HQ, and removes only what it made. Without it, the
project skips.

## The user guide's screenshots

`e2e/guide/` holds the recipes that capture the screenshots shown in `docs/guide/`. They are their own Playwright
projects (`guide`, `guide-fresh`; the default `chromium` project skips them), run against separate `_guide`
databases by `npm run guide:screenshots`, and compared with the last release by `npm run guide:compare`. How to
write a recipe is in [`e2e/guide/README.md`](guide/README.md).

## Test data (not isolated)

The integration suite is isolated: `npm run test:integration` runs each worker on
its own database (`agenthix_w1_test` … `_w4_test`, created by
`scripts/test/with-test-db.mjs`) and starts each test from an empty database. The
**e2e** suite is not: it runs against the dev server's own database, signs in with
seeded accounts (`fixtures/auth.ts`, `fixtures/seed-e2e-users.mjs`) and has no
browser-level reset. Several specs change data, so never point it at a database
whose data you need.

## Test level per finding

Not every audit finding belongs in the browser. Data-path findings are proven
faster and less flakily at the **integration** level (`npm run test:integration`,
each test on an empty database); only genuine UI behaviour needs **e2e** here.

| Finding | Level | Status |
|---|---|---|
| F-005 session delete cancels active runs first | integration | done — `src/sessions/__tests__/deleteTaskSession.integration.test.ts` |
| F-012 risk-rule auto-rejection enforcement | integration | planned |
| First-admin setup: invite link → account → how agents reach AI → model provider → voice → organisation → review → Home | e2e | `setup.spec.ts` — needs a fresh HQ and its one-time link (`E2E_FIRST_ADMIN_LINK`) |
| F-003 project / board / task mutations, drag-and-drop | e2e | partly — `projectsBoards.spec.ts`, `taskDelete.spec.ts`; drag-and-drop planned |

## Conversation privacy (`sessionPrivacy.spec.ts`)

The first **mutating** spec in this suite, and the first with an auth fixture.
`sessionPrivacy` covers the conversation-privacy rule (ADR-0041, ADR-0096) across two users, including the live
socket path a read-only check cannot reach. A conversation in a person's own space is held in hq; the spec checks that
another person, an ADMIN included, gets a not-found for it, never sees its messages in any listing, and receives
nothing from its live socket room. Shared sign-in helpers live in
`fixtures/auth.ts`.

**It needs two throwaway accounts** — `e2e-operator` (an organisation Member) and `e2e-admin`
(ADMIN) — created with the app's real password hashing, so the login path is
genuinely exercised rather than stubbed. Existing accounts are never touched.

```bash
# one-time setup (needs DATABASE_URL from .env.server)
export $(grep -E '^DATABASE_URL=' .env.server | xargs)
node e2e/fixtures/seed-e2e-users.mjs
node e2e/fixtures/seed-e2e-data.mjs        # prints the env vars the specs need

E2E_CONVERSATION_ID=… E2E_AGENT_ID=… npx playwright test e2e/sessionPrivacy.spec.ts

# remove the accounts and their data again
node e2e/fixtures/cleanup-e2e-data.mjs
```

`seed-e2e-data.mjs` writes the operator's conversation and one message into hq's database, sealing the message with
hq's `SECRETS_MASTER_KEY` (read from `.env.server`). The fixtures reach **two databases**: hq's holds the accounts,
the organisation and the conversation; the site's holds workspaces, so `seed-e2e-data.mjs` and
`cleanup-e2e-data.mjs` read the site's `DATABASE_URL` from `../site/.env.server`, the site module's settings file in
this repository. The user
seed also creates an organisation if the database has none (a booted hq makes
one itself); cleanup leaves it.

## First-admin setup (`setup.spec.ts`)

Setup runs once per HQ, so this spec needs an HQ with no admin yet and that HQ's one-time link
(`/invite/<code>`, printed in its log or by `agenthix hq invite-admin`). Nothing seeds the link; pass it in.
Without it the spec skips. It makes its own account, so run it before `seed-e2e-users.mjs` on that HQ.

```bash
E2E_FIRST_ADMIN_LINK=<hq's address>/invite/<code> npx playwright test e2e/setup.spec.ts
```

It takes Your own keys (Agenthix Cloud's card is checked to be disabled with *not available yet*), adds an own
OpenAI-compatible endpoint at the stand-in model as the model provider, and the two speech providers as described under
the stand-in above; for those it runs `fixtures/add-provider.mjs`, which needs `DATABASE_URL` and `SECRETS_MASTER_KEY`
(from the environment, else `.env.server`) to be the HQ's under test. The install walkthrough does the same in the
install's database, from inside its hq-server container (`scripts/install-test/speech-provider.cjs`, fed to `node` there
by `docker exec`), so the install's database address and secrets key never leave it.

**One honest limitation.** The socket test asserts that a non-owner receives no
events after subscribing to another person's conversation room. With no reply
actively streaming, it cannot distinguish "the join was refused" from "nothing was
happening" — it is a wiring smoke check. The join's rule is covered by the unit tests of
`src/conversations/coordinator/socketRoom.ts`, and the session, task and board rooms by the integration test
`src/server/__tests__/socketRooms.integration.test.ts`, against the real test database.
