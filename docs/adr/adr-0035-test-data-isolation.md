---
created: 2026-06-20
description: A dedicated test database with truncation-based isolation, integration-first.
---

# ADR-0035: Test-Data Isolation — Dedicated Test Database

**Status:** Accepted

## Context

The `site` discovery audit (2026-06-19) found the user-facing operation layer has
no automated coverage (findings F-001/F-002/F-003/F-005/F-010/F-012). A deeper look
showed **42 of 44 database-touching site tests mock Prisma** (`vi.mock('wasp/server')`).
A mock asserts what the test *told* it to return — it cannot prove what the database
actually does. So the highest-impact findings — F-005 "delete cancels active runs
first", F-012 risk-gate enforcement, F-010 onboarding seeding — are *data-path*
concerns that the current test suite structurally cannot verify.

We need a test level that exercises **real database behaviour**, isolated and
repeatable, without per-run environment juggling.

### Relationship to ADR-0034 (dynamic port allocation)

ADR-0034 enables running a **test stack alongside the dev stack** (separate ports per
environment) — a *concurrency convenience* for end-to-end testing. It is **not** the
data-isolation mechanism, and this ADR does **not** depend on it. A database is
selected by its **name** in `DATABASE_URL`, not by a port: one Postgres server hosts
many databases (`agenthix`, `agenthix_test`) on the same port. The two ADRs are
complementary — ADR-0035 defines *how test data is isolated*; ADR-0034 is a later
convenience for *running test and dev servers at the same time*.

## Decision

Adopt a **dedicated test database with truncation-based isolation**, integration-first.

1. **One test database, no new ports.** `agenthix_test` lives on the existing dev
   Postgres (`localhost:4109`) — created once (`CREATE DATABASE`), schema applied via
   `prisma migrate deploy`. No new container, no new port.

2. **The dev env file is never edited, and no secret is duplicated.** A small wrapper
   (`scripts/test/with-test-db.mjs`) loads the existing dev environment, then **derives**
   the test `DATABASE_URL` by swapping only the database *name* to `agenthix_test`
   (override via `TEST_DB_NAME`). It **refuses to run unless the resolved name ends in
   `_test`** — a hard guard so the destructive truncation can never target the dev
   database. The wrapper runs the test command (`vitest`, or later `wasp start` for an
   e2e boot) with the derived URL. `.env.server` stays pointing at the dev database,
   untouched; there is no second env file holding the password.

3. **Integration level (primary workhorse).** Vitest, in-process — no server, no ports,
   no auth cookies. A test imports a Wasp action/query and invokes it with a constructed
   context (`{ user, entities }`) backed by a Prisma client pointed at `agenthix_test`.
   All tables are truncated between tests (`TRUNCATE … RESTART IDENTITY CASCADE`,
   excluding `_prisma_migrations`) so each test starts clean and order never matters. A
   shared `src/test/factories.ts` builds the entities each test needs.

   *(2026-10-05: in hq, the database is now emptied before each test with `DELETE`s in dependency order
   rather than `TRUNCATE`, and the run uses one database per worker (`agenthix_w<N>_test`) — the same
   isolation, faster. The decision stands; see `docs/qa/qa-strategy.md`.)*

4. **End-to-end level (secondary, later).** Playwright against a real stack booted with
   the test `DATABASE_URL`; authentication via a saved Playwright `storageState` fixture
   (log in once, reuse); reset between specs via truncation or a dev-only reset path.
   Runs one stack at a time — no ADR-0034 dependency. Concurrent dev + test stacks remain
   a later convenience delivered by ADR-0034.

5. **Prove the pattern with F-005 first** — "delete cancels active runs first" — the
   highest-impact data-path finding, written as the first integration test and the
   template the others follow.

## Consequences

- **Real database behaviour becomes provable.** Mocks remain appropriate for pure-unit
  logic; integration tests cover the data paths mocks cannot.
- **No env juggling.** One-time setup (test DB + `.env.test` + harness + factories), then
  every run is a single command with automatic between-test cleanup.
- **Integration coverage lands independently of ADR-0034.** E2e expansion is sequenced
  separately and is not on the critical path.
- **New upkeep:** `agenthix_test` must be kept schema-current (apply migrations to it as a
  setup step / test script); CI must provision it before running integration tests.

### Open questions

- **CI provisioning** — the simplest is a CI setup step that creates `agenthix_test` and
  runs `prisma migrate deploy` against it before the integration job.
- **E2e reset path** — truncate via a direct test Prisma connection, or a dev-only reset
  endpoint on the server. Decide when the first mutating e2e flow is built.

## To implement (on acceptance)

1. Provision `agenthix_test` on `:4109` and apply the schema.
2. Add `scripts/test/with-test-db.mjs` (derive + guard) and a `test:integration` script
   (keep `test` for the existing mocked unit suite).
3. Build the Vitest integration setup (load `.env.test`, truncate helper) and
   `src/test/factories.ts`.
4. Write F-005 as the first integration test; verify green.
5. Correct the dangling "ADR-0034" *isolation* references — in `qa-strategy.md` (the
   "Test data" note and the e2e Deviations line) and `site/e2e/README.md` — to point to
   this ADR, and reframe ADR-0034 as the concurrency convenience it is.

## Origin

Surfaced by the `site` discovery audit (2026-06-19); designed and approved in the QA
session on 2026-06-20.
