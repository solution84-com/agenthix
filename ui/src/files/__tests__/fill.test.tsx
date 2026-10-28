import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { ChangesList } from '../diff'
import { ready, stubRegistry } from './testKit'

const frame = (grow?: boolean) =>
  render(<FileFrame answer={ready()} name="q3.pdf" registry={stubRegistry()} onReopen={vi.fn()} grow={grow} />)

describe('a file view fills the space it is given and scrolls inside @SC-1626', () => {
  it('the frame fills its container and only the file scrolls', () => {
    frame()
    expect(screen.getByTestId('file-frame').className).toContain('h-full')
    expect(screen.getByTestId('file-frame').className).toContain('flex-col')
    const view = screen.getByTestId('file-frame-view')
    expect(view.className).toContain('overflow-auto')
    expect(view.className).toContain('min-h-0')
  })

  it('with grow the frame takes the height of its file and does not scroll', () => {
    frame(true)
    expect(screen.getByTestId('file-frame').className).not.toContain('h-full')
    expect(screen.getByTestId('file-frame-view').className).not.toContain('overflow-auto')
  })

  const files = [{ path: 'a.md', status: 'modified' as const, before: 'a', after: 'b' }]

  it('the list of changes fills its container and scrolls inside', () => {
    render(<ChangesList files={files} />)
    expect(screen.getByTestId('changes-list').className).toContain('overflow-y-auto')
  })

  it('with grow the list of changes takes the height of its changes', () => {
    render(<ChangesList files={files} grow />)
    expect(screen.getByTestId('changes-list').className).not.toContain('overflow-y-auto')
  })
})
