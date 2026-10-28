import { BaseSequencer, type TestSpecification } from 'vitest/node'
import { defineConfig } from 'vitest/config'

// The comment below ("suites run in filename order") was aspirational, not
// enforced: Vitest's default BaseSequencer.sort() orders files by cache
// heuristics (unknown files first, then failed-first, then longest-first) —
// nothing alphabetical. With a single test file that difference was
// invisible; adding 01-registration.test.ts (task 4, plan 5f) surfaced it
// immediately — as a brand-new file with no cache entry, the default
// sequencer ran it BEFORE 00-canary.test.ts, which then found the site
// already registered from 01's run and failed its "unregistered on a fresh
// install" assertion. Sorting by moduleId is what the filename-prefix
// convention (00-, 01-, 02-…) actually requires to hold.
class FilenameSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    // L: byte comparison, not localeCompare — localeCompare is locale- and
    // ICU-dependent (case/accent folding, "natural" digit ordering on some
    // locales), any of which could reorder the 00-/01-/02-/03- prefixes this
    // sequencer exists to enforce on some other machine or Node build. A
    // plain `<`/`>` compares moduleId byte-by-byte, which is exactly what
    // sorting numeric filename prefixes actually needs.
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0))
  }
}

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.unit.test.ts'],
    globalSetup: './globalSetup.ts',
    fileParallelism: false,
    sequence: { concurrent: false, sequencer: FilenameSequencer },
    // suites run in filename order (00-canary → 01-registration → 01b-unregister
    // → 02-dispatch → 03-heldTasks → 04-pairing → 05-relay → 06-model-usage → 07-knowledge-levels → 08-file-relay → 09-upload-relay → 10-propose-skill → 12-skills-*), enforced by FilenameSequencer above, and deliberately
    // share state; a full run boots two wasp apps once.
    testTimeout: 120_000,
    // Does NOT bound globalSetup — vitest has no separate timeout for that
    // hook, so this only covers beforeAll/afterAll inside the test files
    // themselves. The actual app-boot budget is apps.ts's pollUntilReady
    // (360s per app, run in parallel).
    hookTimeout: 420_000,
    // I: this tier is a single shared-state chain (each file builds on the
    // last file's end state) — a failure partway through leaves every
    // subsequent file testing against state the failed step never produced,
    // which is noise, not signal. Stop at the first failure instead.
    bail: 1,
  },
})
