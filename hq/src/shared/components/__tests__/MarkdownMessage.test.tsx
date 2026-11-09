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

  it('draws the Copy of a code block at control height, outlined like the other buttons', () => {
    render(<MarkdownMessage content={'```ts\nconst a = 1\n```'} />)
    const copy = screen.getByRole('button', { name: 'Copy' })
    expect(copy.className).toContain('h-9')
    expect(copy.className).toContain('max-sm:h-11')
    expect(copy.className).toContain('border-border')
  })

  it('keeps inline code inline', () => {
    const { container } = render(<MarkdownMessage content={'Run `pnpm dev` first.'} />)
    expect(container.querySelector('pre')).toBeNull()
    expect(container.querySelector('code')!.textContent).toBe('pnpm dev')
  })
})

describe('Markdown that reads as what it is', () => {
  it('draws headings as headings, in descending sizes', () => {
    render(<MarkdownMessage content={'# One\n\n## Two\n\n### Three'} />)
    const sizes = [1, 2, 3].map((n) => screen.getByRole('heading', { level: n }).className)
    expect(new Set(sizes).size).toBe(3)
  })

  it('keeps a wide table in its own sideways scroll, so it never widens the thread', () => {
    const { container } = render(<MarkdownMessage content={'| a | b |\n|---|---|\n| 1 | 2 |'} />)
    const table = container.querySelector('table')!
    expect(table.parentElement!.className).toContain('overflow-x-auto')
    expect(table.querySelectorAll('th')).toHaveLength(2)
  })

  it('keeps a long code line in its block\'s own sideways scroll', () => {
    const { container } = render(<MarkdownMessage content={'```\n' + 'x'.repeat(300) + '\n```'} />)
    expect(container.querySelector('pre')!.className).toContain('overflow-x-auto')
  })
})

describe('Markdown task lists', () => {
  it('draws a checklist item with its checkbox and no bullet', () => {
    const { container } = render(<MarkdownMessage content={'- [x] done\n- [ ] to do\n- plain'} />)
    const [done, todo, plain] = [...container.querySelectorAll('li')]
    expect(done!.className).toContain('list-none')
    expect(todo!.className).toContain('list-none')
    expect(plain!.className).not.toContain('list-none')
    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(2)
  })
})
