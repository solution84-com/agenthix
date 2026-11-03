import { experimentalFailuresGlobalSetup } from '@agenthix/core/testing'

// A failing test of an experimental feature's own group is recorded, not failed (adr-0172): cleared when the run
// starts, and listed under *Experimental failures* when it ends. Wrapped, since vitest passes its own argument.
export default () => experimentalFailuresGlobalSetup()
