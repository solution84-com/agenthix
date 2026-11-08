// @vitest-environment jsdom
/** A type's column dialogs (the Task types design): Move to another state and Remove each have ✕ at the title's right. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: [] }), getTypeColumnTasks: 'getTypeColumnTasks' }))

import { MoveColumnDialog, RemoveColumnDialog } from '../ColumnDialogs'

afterEach(cleanup)

const column = { id: 'h', typeId: 'feat', name: 'Testing', colour: 'neutral', order: 3, state: 'IN_PROGRESS', defaultForState: false } as const

describe('the column dialogs', () => {
  it('close from the ✕ beside the title of Move Testing to another state', () => {
    const onCancel = vi.fn()
    render(<MoveColumnDialog column={column as never} projectKey="WEB" onCancel={onCancel} onConfirm={() => {}} />)
    expect(screen.getByRole('heading', { name: /^Move Testing to / })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('close from the ✕ beside the title of Remove the column', () => {
    const onCancel = vi.fn()
    render(<RemoveColumnDialog column={column as never} onCancel={onCancel} onConfirm={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
