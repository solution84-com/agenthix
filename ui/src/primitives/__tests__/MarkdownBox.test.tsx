import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarkdownBox } from '../MarkdownBox'

afterEach(cleanup)

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <MarkdownBox value={value} onChange={setValue} renderPreview={t => <p>preview:{t}</p>} label="Description" />
}

describe('MarkdownBox, the one Markdown editor', () => {
  it('writes in a textarea with the formatting toolbar', () => {
    render(<Harness />)
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Bold|Italic|Checklist|Link/ })).toHaveLength(4)
  })

  it('a toolbar button writes its Markdown into the text', () => {
    render(<Harness initial="hello" />)
    fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }))
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toContain('- ')
  })

  it('Preview shows the text as the app renders it, and says so when empty', () => {
    const { unmount } = render(<Harness initial="x" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByTestId('markdown-preview').textContent).toBe('preview:x')
    unmount()
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText('Nothing to preview yet.')).toBeTruthy()
  })

  it('opened on Preview, shows the text as it reads, and a click into it opens Write', () => {
    render(<MarkdownBox value="**Check** the links" onChange={() => {}} renderPreview={t => <p>preview:{t}</p>} label="Instructions" defaultTab="preview" />)
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByText('preview:**Check** the links'))
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toBeTruthy()
  })
})
