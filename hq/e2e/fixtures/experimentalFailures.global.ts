import { experimentalFailuresGlobalSetup } from '@agenthix/core/testing'

// The same record as the unit suites (adr-0172): cleared when the run starts; its *Experimental failures* printed when
// it ends, since a recorded failure is reported as skipped (fixtures/withFeature.ts). Playwright runs the returned
// function as the global teardown.
export default () => experimentalFailuresGlobalSetup()
