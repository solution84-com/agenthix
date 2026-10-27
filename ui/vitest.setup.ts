import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// A shared CI runner can take longer than the default second to draw a component's first screen.
configure({ asyncUtilTimeout: 5_000 })
afterEach(() => cleanup())
