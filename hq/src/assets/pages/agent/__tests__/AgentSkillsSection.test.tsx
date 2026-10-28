// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AgentSkillsView } from '../types'

const h = vi.hoisted(() => ({ data: undefined as unknown, give: vi.fn(async () => ({})), take: vi.fn(async () => ({})) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: h.data, error: undefined, refetch: vi.fn() }),
  useAction: (op: string) => (op === 'addAssetToAgents' ? h.give : h.take),
  getAgentSkillSet: 'getAgentSkillSet', addAssetToAgents: 'addAssetToAgents', removeAssetFromAgent: 'removeAssetFromAgent',
}))

vi.mock('@agenthix/ui/primitives', () => ({
  SearchField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} />,
}))

import { AgentSkillsSection } from '../AgentSkillsSection'
import { AgentSkillsTool } from '../AgentSkillsTool'

const line = (n: string, over = {}) => ({ assetId: `a-${n}`, identity: `agenthix/${n}`, title: n, description: `${n} does a thing.`, version: '1.0', signer: 'Signed by Agenthix', updateTo: null, ...over })
const view = (over: Partial<AgentSkillsView> = {}): AgentSkillsView => ({
  agent: { id: 'ag1', name: 'Ada' }, mayManage: true,
  builtIn: [{ assetId: 'b1', identity: 'agenthix/skill-creator', title: 'skill-creator', description: 'How to write a good skill.', version: '1.0.0', on: true, repositoryOnly: false },
    { assetId: 'b2', identity: 'agenthix/working-with-git', title: 'working-with-git', description: 'Git guide.', version: '1.0.0', on: true, repositoryOnly: true }],
  everyAgent: [line('brand-voice')], thisAgent: [line('content-writing'), line('seo-research', { updateTo: '1.1' })],
  places: [{ projectId: 'p1', projectKey: 'WEB', name: 'Website rebuild', on: 4, off: 1, setAside: 1, onNames: ['release-checklist', 'deploy-preview'] }],
  hiddenPlaces: 0, setAside: [{ name: 'code-review', where: 'Website rebuild', reason: 'The organisation installs agenthix/code-review 1.4, so the project\'s copy isn\'t used.' }],
  yours: [{ name: 'weekly-summary', description: '' }], listed: [{ name: 'a', description: 'b' }], addable: [line('qa-bug-reporting')], ...over,
})

beforeEach(() => { h.give.mockClear(); h.take.mockClear() })
afterEach(cleanup)
const renderSection = () => render(<MemoryRouter><AgentSkillsSection agentId="ag1" /></MemoryRouter>)

describe("the agent's Skills on its manage page (board A1)", () => {
  it('lists everything in the clash order, with counts for the places and why a skill is set aside', () => {
    h.data = view()
    renderSection()
    const headings = screen.getAllByRole('heading', { level: 4 }).map(e => e.textContent)
    expect(headings).toEqual(['Built in', 'Every agent has these', 'Ada has these', 'Where Ada works', "People's own skills"])
    expect(screen.getByTestId('agent-place-line').textContent).toContain('4 on · 1 off · 1 set aside')
    expect(screen.getByTestId('agent-set-aside').textContent).toContain("The organisation installs agenthix/code-review 1.4, so the project's copy isn't used.")
    expect(screen.getByText('1.1 available')).toBeTruthy()
    expect(screen.getByTestId('agent-skills-cost').textContent).toMatch(/1 skill · about \d+ tokens per request/)
    expect(screen.queryByTestId('agent-skills-warning')).toBeNull()
  })

  it('warns when the list grows past the limit, and tells an administrator what to do', () => {
    h.data = view({ listed: Array.from({ length: 24 }, (_, i) => ({ name: `s${i}`, description: 'x'.repeat(300) })) })
    renderSection()
    expect(screen.getByTestId('agent-skills-warning').textContent).toContain("Remove from Ada the ones it doesn't need.")
  })

  it('removes a skill from this agent only, and gives one from the Library', async () => {
    h.data = view()
    renderSection()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Ada' })[0]!)
    await waitFor(() => expect(h.take).toHaveBeenCalledWith({ assetId: 'a-content-writing', agentId: 'ag1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a skill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Give to Ada' }))
    await waitFor(() => expect(h.give).toHaveBeenCalledWith({ assetId: 'a-qa-bug-reporting', agentIds: ['ag1'] }))
  })

  it('offers nobody who may not manage an Add or a Remove, and only counts places they are not in', () => {
    h.data = view({ mayManage: false, hiddenPlaces: 2, addable: [] })
    renderSection()
    expect(screen.queryByRole('button', { name: 'Add a skill' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from Ada' })).toBeNull()
    expect(screen.getByText(/also works in 2 places you aren't in/)).toBeTruthy()
  })
})

describe("the agent's Skills as a member reads them (board A1)", () => {
  it('is read only: what is given everywhere, the member\'s projects, and their own skills', () => {
    h.data = view({ mayManage: false })
    render(<MemoryRouter><AgentSkillsTool agentId="ag1" /></MemoryRouter>)
    expect(screen.getByText(/Read only/)).toBeTruthy()
    expect(screen.getByText('brand-voice · content-writing · seo-research')).toBeTruthy()
    expect(screen.getByText(/Ada has 3 and 2 built in: skill-creator, working-with-git/)).toBeTruthy()
    expect(screen.getByText('weekly-summary')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
