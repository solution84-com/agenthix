import { configure } from '@testing-library/react'

// A shared CI runner can take longer than the default second to draw a file's first screen.
configure({ asyncUtilTimeout: 5_000 })
