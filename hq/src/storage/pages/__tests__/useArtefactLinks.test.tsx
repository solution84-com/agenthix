// @vitest-environment jsdom
/** A link `artefacts/<name>` in a conversation or a task's session opens the Artefacts tool with that file (spec §3, §9). */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setParams = vi.hoisted(() => vi.fn())
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('react-router', () => ({ useSearchParams: () => [new URLSearchParams('tool=tasks&task=WEB-27'), setParams] }))
vi.mock('../../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

import { useArtefactLinks } from '../useArtefactLinks'

function Place() {
  useArtefactLinks()
  return (
    <div>
      <a href="artefacts/pricing-options.pdf">Pricing options</a>
      <a href="https://example.com/x">Elsewhere</a>
      <a href="artefacts/Hero%20crop.png"><span>Hero crop</span></a>
      <a href="files/reports/q3.pdf">The report</a>
      <a href="workspaces/w1/src/app.ts">The app</a>
    </div>
  )
}

const opened = () => setParams.mock.calls[0][0](new URLSearchParams('tool=tasks&task=WEB-27')) as URLSearchParams

beforeEach(() => { vi.clearAllMocks(); mobile.value = false })

describe('artefact links', () => {
  it('open the Artefacts tool with that file, instead of following the link', () => {
    render(<Place />)
    const notPrevented = fireEvent.click(screen.getByText('Pricing options'))
    expect(notPrevented).toBe(false)
    const next = opened()
    expect(next.get('tool')).toBe('artefacts')
    expect(next.get('artefact')).toBe('pricing-options.pdf')
  })

  it('work from inside the link’s own markup and read an encoded name', () => {
    render(<Place />)
    fireEvent.click(screen.getByText('Hero crop'))
    expect(opened().get('artefact')).toBe('Hero crop.png')
  })

  it('leave every other link alone', () => {
    render(<Place />)
    expect(fireEvent.click(screen.getByText('Elsewhere'))).toBe(true)
    expect(setParams).not.toHaveBeenCalled()
  })

  it('open the place’s page on a small screen', () => {
    mobile.value = true
    render(<Place />)
    fireEvent.click(screen.getByText('Pricing options'))
    expect(opened().get('place')).toBe('open')
  })
})

describe('links to the place\'s files and workspaces @SC-1536', () => {
  it('open the Files tool with that file', () => {
    render(<Place />)
    expect(fireEvent.click(screen.getByText('The report'))).toBe(false)
    expect(opened().get('tool')).toBe('files')
    expect(opened().get('file')).toBe('reports/q3.pdf')
  })

  it('open the Workspaces tool with that workspace and file', () => {
    render(<Place />)
    fireEvent.click(screen.getByText('The app'))
    expect(opened().get('tool')).toBe('workspaces')
    expect(opened().get('workspace')).toBe('w1')
    expect(opened().get('wfile')).toBe('src/app.ts')
  })
})
