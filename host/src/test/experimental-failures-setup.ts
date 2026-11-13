// The run's experimental failures (adr-0172): cleared at the start, summarised at the end. Wrapped, because vitest
// passes its own argument to a global setup and the function takes a folder.
import { experimentalFailuresGlobalSetup } from '@agenthix/core/testing'

export default () => experimentalFailuresGlobalSetup()
