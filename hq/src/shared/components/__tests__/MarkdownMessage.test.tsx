// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownMessage } from '../MarkdownMessage'

describe('Markdown code', () => {
  it('shows a fenced block with no language as a block, keeping its lines', () => {
    const { container } = render(<MarkdownMessage content={'```\npnpm install\npnpm dev\n```'} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('pnpm install\npnpm dev')
  })

  it('labels a fenced block with its language', () => {
    render(<MarkdownMessage content={'```ts\nconst a = 1\n```'} />)
    expect(screen.getByText('ts')).toBeTruthy()
  })

  it('keeps inline code inline', () => {
    const { container } = render(<MarkdownMessage content={'Run `pnpm dev` first.'} />)
    expect(container.querySelector('pre')).toBeNull()
    expect(container.querySelector('code')!.textContent).toBe('pnpm dev')
  })
})
