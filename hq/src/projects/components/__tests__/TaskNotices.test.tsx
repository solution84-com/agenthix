// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TaskNotices } from '../TaskNotices'

afterEach(cleanup)

describe("a task's notices", () => {
  it('says a denied request in plain words, never the record\'s', () => {
    render(<TaskNotices task={{ runState: 'RUN_BLOCKED', runStateReason: 'manifest rejected — awaiting human review' }} />)
    expect(screen.getByRole('status').textContent).toBe('Request denied — run again to retry')
    expect(screen.queryByText(/manifest/)).toBeNull()
  })
})
