import { configure } from '@testing-library/react'
import { quietReadPolicy } from './src/api/quietRead'

// A shared CI runner can take longer than the default second to draw a file's first screen.
configure({ asyncUtilTimeout: 5_000 })

// A read the screen makes on its own is tried again for about seven seconds before it says anything: the tests turn the
// retries off, and the one that proves them (quietRead.test.tsx) turns them back on.
quietReadPolicy.retries = 0
