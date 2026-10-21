/**
 * Shared fakes for the modules many hq tests need replaced (ADR-0094).
 *
 * A fake is a small working stand-in for a real module: it exports the same names, keeps state where that makes
 * it useful, offers arrangement helpers, and exposes every function as a vitest spy so a test can still check
 * what was called, or stub one case with `mockResolvedValue` and friends.
 *
 * One fake per module, in this folder, named after the module:
 *
 *   debouncedPush     server/dashboard/debouncedPush      the dashboard notifier
 *   activity          server/dashboard/activity           the dashboard's activity feed
 *   TaskRunner        agents/TaskRunner                   starting task runs
 *   dispatchService   agents/dispatchService              dispatching runs to a site, resolving a site
 *   siteRuntimeStore  sessions/siteRuntimeStore           sessions, runs and transcripts held on the site
 *   embedders         memory/embedding/embedders          the embedding models, deterministic and with no model loaded
 *
 * Wiring, the same in every test file:
 *
 *   import * as dashboardPush from '<path to>/test/fakes/debouncedPush'
 *   vi.mock('<path to>/server/dashboard/debouncedPush', () => import('<path to>/test/fakes/debouncedPush'))
 *
 * The factory and the test's own import resolve to the same fake instance, so a test arranges and checks the
 * fake through its own import. `vi.mock` is hoisted above the imports, which is why the factory imports the
 * fake itself rather than using a variable.
 *
 * Reset: every fake registers `reset()` to run before each test (see `./lifecycle`), so nothing is carried from
 * one test to the next and a test file needs no reset of its own. `reset()` empties the fake's state and
 * restores its spies to their default behaviour; it never touches another fake.
 *
 * A test of one of these modules itself keeps testing the real module, not the fake. Add a name to a fake when
 * the real module gains one: each fake checks, at typecheck, that it exports every name the real module does.
 */
export {}
