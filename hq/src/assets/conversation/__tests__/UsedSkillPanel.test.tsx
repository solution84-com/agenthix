// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({
  query: { data: undefined as unknown, error: null as unknown, isLoading: false },
  asked: [] as unknown[],
  framed: [] as Array<{ answer: unknown; name: string }>,
}))
// The frame and its renderers are ui's, tested there; here, what the panel hands it.
vi.mock('@agenthix/ui/files', async () => ({
  ...(await vi.importActual<object>('@agenthix/ui/files')),
  FileFrame: (p: { answer: unknown; name: string }) => { h.framed.push(p); return <div data-testid="file-frame">{p.name}</div> },
}))
vi.mock('wasp/client/operations', () => ({
  getUsedSkill: 'getUsedSkill',
  getOperationResult: 'getOperationResult',
  useQuery: (_q: unknown, args: unknown) => { h.asked.push(args); return h.query },
}))

import { UsedSkillPanel } from '../UsedSkillPanel'
import { UsedSkillOpenerContext } from '../usedSkillOpener'
import { ResultCard } from '../../../conversations/components/ResultCard'
import type { UsedSkillView } from '../usedSkillTypes'

const view = (over: Partial<UsedSkillView> = {}): UsedSkillView => ({
  name: 'org-review', level: 'installed', title: 'Review code', where: 'Fernhill', version: '1.3.0', identity: 'fernhill/review',
  path: null, fingerprint: 'a'.repeat(64), publisher: 'fernhill', newer: null, kept: null, openHref: '/library', ...over,
})

beforeEach(() => {
  h.asked = []
  h.framed = []
  URL.createObjectURL = vi.fn(() => 'blob:skill')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('a used skill beside the thread @SC-1658', () => {
  it('names where it came from and the version the run used', () => {
    h.query = { data: view({ newer: 'The agents that have it now get 1.4.0.' }), error: null, isLoading: false }
    render(<UsedSkillPanel conversationId="c1" skill={{ operationId: 'op1', name: 'org-review' }} onClose={() => {}} />)
    expect(screen.getByRole('heading').textContent).toBe('Review code')
    expect(screen.getByTestId('used-skill-tags').textContent).toBe('Fernhill · installed · fernhill/review · 1.3.0 · By fernhill')
    expect(screen.getByText(/As the agent used it in this work\. The agents that have it now get 1\.4\.0\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open in the Library →' }).getAttribute('href')).toBe('/library')
    expect(h.asked[0]).toEqual({ conversationId: 'c1', operationId: 'op1', name: 'org-review' })
  })

  it("says a version isn't kept, why for a skill in files, and its fingerprint", () => {
    h.query = { data: view({ level: 'place', where: 'Website rebuild', identity: null, path: '.agents/skills/release', version: null, publisher: null, openHref: null }), error: null, isLoading: false }
    render(<UsedSkillPanel conversationId="c1" skill={{ operationId: 'op1', name: 'boundary-release' }} onClose={() => {}} />)
    const notKept = screen.getByTestId('used-skill-not-kept').textContent
    expect(notKept).toContain("This version isn't kept, so HQ can't show what the agent read. It was changed in the files and never published.")
    expect(notKept).toContain(`Fingerprint ${'a'.repeat(64)}`)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('lists its files and opens another when chosen', () => {
    h.query = {
      data: view({ kept: { files: [{ path: 'SKILL.md', size: 10, kind: 'markdown', contentType: 'text/markdown' }, { path: 'checklist.md', size: 5, kind: 'markdown', contentType: 'text/markdown' }], opened: { path: 'SKILL.md', base64: btoa('# Review') } } }),
      error: null, isLoading: false,
    }
    render(<UsedSkillPanel conversationId="c1" skill={{ operationId: 'op1', name: 'org-review' }} onClose={() => {}} />)
    expect(h.framed.at(-1)).toMatchObject({
      name: 'SKILL.md',
      answer: { state: 'ready', previewLink: 'blob:skill', facts: { name: 'SKILL.md', kind: 'markdown', size: 10 } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'checklist.md' }))
    expect(h.asked.at(-1)).toEqual({ conversationId: 'c1', operationId: 'op1', name: 'org-review', path: 'checklist.md' })
  })

  it("shows the query's refusal", () => {
    h.query = { data: undefined, error: new Error("That skill isn't there, or isn't yours to see."), isLoading: false }
    render(<UsedSkillPanel conversationId="c1" skill={{ operationId: 'op1', name: 'org-review' }} onClose={() => {}} />)
    expect(screen.getByRole('alert').textContent).toBe("That skill isn't there, or isn't yours to see.")
  })
})

describe("a result's steps @SC-1658", () => {
  it('open a used skill beside the thread; a step without one stays text', () => {
    h.query = { data: { title: 'Review', state: 'COMPLETED', summary: null, stated: true, problem: null, runUrl: null, work: { summary: null, steps: [{ text: 'Used the skill Review code · Fernhill · 1.3.0', skill: { name: 'org-review' } }, { text: 'Read a.ts' }] } }, error: null, isLoading: false }
    const open = vi.fn()
    render(
      <UsedSkillOpenerContext.Provider value={open}>
        <ResultCard conversationId="c1" message={{ id: 'm1', kind: 'RESULT', operationId: 'op1', body: { title: 'Review', outcome: 'completed', summary: 'Done' } } as never} />
      </UsedSkillOpenerContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    fireEvent.click(screen.getByTestId('used-skill-step'))
    expect(open).toHaveBeenCalledWith({ operationId: 'op1', name: 'org-review' })
    expect(screen.getAllByTestId('used-skill-step')).toHaveLength(1)
  })
})
