---
created: 2026-10-05
description: hq's operations and services are tested against the real test database; unit tests are for pure logic; a module many tests depend on gets one shared fake; a test that only checks a mock was called is not kept once real behaviour is covered.
---

# ADR-0094: hq's Operations Are Tested Against the Real Database

**Status:** Accepted

## Context

hq's tests had grown larger than its code. Most test files replaced the modules around the code under
test with mocks, and almost a third of all assertions only checked that a mock had been called. Such a
test passes as long as the code calls what it called before, so it protects little and breaks whenever
the call changes. A few modules were mocked separately by dozens of test files in other folders, so a
change to one of them broke tests far from the change. Wasp provides no server-side test support, and its
maintainers advise keeping operations thin, with their logic in plain functions.

## Options considered

**Keep testing each module with its neighbours mocked.** Rejected: it is the arrangement that produced
the distant breakage and the mock-only assertions.

**Test mainly end to end, through the running app.** Rejected: slow, hard to point at a cause, and it
needs the whole system running for every change.

**Mock the database client in unit tests.** Rejected: it tests the code against a guess of what the
database does — the same weakness as mocking any other module.

## Decision

- **An operation or service that reads or writes data is tested against the real test database**, through
  the integration suite.
- **Unit tests are for pure logic** — code that takes values and returns values.
- **A module that many tests need replaced gets one shared fake**, kept with the test helpers, never a
  separate mock in each test file.
- **A test that only checks that a mock was called is not kept** once the behaviour it stood for is
  covered by a test that checks a result.

## What this binds

Every new test in hq is written to these rules, and existing tests move to them area by area. Undoing it
means returning to per-file mocks, which costs little to do and brings back the breakage this record exists
to remove.

## Consequences

### Positive

- Tests check what the code does, not what it calls, so they survive refactoring and catch real faults.
- A change to a widely used module updates one fake, not every test that touches it.

### Negative

- More of the suite needs the test database, so it cannot run everywhere a unit test can.
- Moving existing tests is a large one-time cost.

### Risks

- Integration tests share one test database and fixed ports, so they cannot run in parallel across
  working copies; they run one at a time.
  *(2026-10-05: resolved. hq's integration tests bind no fixed port, and each run — and each of its four
  workers — uses its own database, so they run in parallel; see `docs/qa/qa-strategy.md`.)*

## References

- adr-0093 — hq is organised by feature
