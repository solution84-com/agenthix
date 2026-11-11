// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

afterEach(cleanup)

describe('ConfirmDialog @SC-1945', () => {
  it('asks, with Cancel and the action named for what it does', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="Delete this product?" description="Its projects stay." confirmLabel="Delete product" destructive onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Its projects stay.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete product' }))
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('holds the action while busy, and draws nothing closed', () => {
    const { rerender } = render(<ConfirmDialog open busy title="Cancel it?" confirmLabel="Cancel it" onConfirm={() => {}} onCancel={() => {}}>It goes.</ConfirmDialog>)
    expect((screen.getByRole('button', { name: 'Cancel it' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('It goes.')).toBeTruthy()
    rerender(<ConfirmDialog open={false} title="Cancel it?" confirmLabel="Cancel it" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
