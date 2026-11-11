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
  FOCUS_RING: '',
  AttentionDialog: ({ attention, onClose }: { attention: { text: React.ReactNode } | null; onClose: () => void }) => (attention ? <div role="alert" data-testid="attention-text">{attention.text}<button type="button" onClick={onClose}>Close</button></div> : null),
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

describe("the agent's Skills on its manage page (board A1) @SC-1654", () => {
  it('lists everything in the clash order, with counts for the places and why a skill is set aside', () => {
    h.data = view()
    renderSection()
    const headings = screen.getAllByRole('heading', { level: 4 }).map(e => e.textContent)
    expect(headings).toEqual(['Built in', 'Every agent has these', 'Ada has these', 'Where Ada works', 'Your own skills', 'Set aside'])
    expect(screen.getByTestId('agent-skills-summary').textContent).toBe('2 built in · 1 given to every agent · 2 given to Ada · 4 skills switched on in 1 project')
    expect(screen.getByTestId('agent-place-line').textContent).toContain('4 on · 1 off · 1 set aside')
    expect(screen.getByTestId('agent-set-aside').textContent).toContain("The organisation installs agenthix/code-review 1.4, so the project's copy isn't used.")
    expect(screen.getByText('1.1 available')).toBeTruthy()
    expect(screen.getByTestId('agent-skills-cost').textContent).toMatch(/1 skill · about \d+ tokens per request/)
    expect(screen.queryByTestId('agent-skills-warning')).toBeNull()
  })

  it('says nothing in a band when the list grows past the limit: the cost line shows it', () => {
    h.data = view({ listed: Array.from({ length: 24 }, (_, i) => ({ name: `s${i}`, description: 'x'.repeat(300) })) })
    renderSection()
    expect(screen.queryByTestId('agent-skills-warning')).toBeNull()
    expect(screen.getByTestId('agent-skills-cost').textContent).toMatch(/24 skills/)
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
    expect(screen.getByText(/also works in 2 projects you aren't in/)).toBeTruthy()
  })
})

describe("the agent's Skills on its own page (board A1) @SC-1654", () => {
  const renderTool = () => render(<MemoryRouter><AgentSkillsTool agentId="ag1" /></MemoryRouter>)

  it('gives a member the same rows as the manage page, read only, with their own skills as rows', () => {
    h.data = view({ mayManage: false, addable: [] })
    renderTool()
    expect(screen.getAllByRole('heading', { level: 4 }).map(e => e.textContent)).toEqual(['Built in', 'Every agent has these', 'Ada has these', 'Where Ada works', 'Your own skills', 'Set aside'])
    expect(screen.getAllByTestId('agent-skill-row').length).toBe(7)
    expect(screen.getByText('brand-voice')).toBeTruthy()
    expect(screen.getByText('brand-voice does a thing.')).toBeTruthy()
    expect(screen.getByText('weekly-summary')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('gives an administrator Add and Remove here too', async () => {
    h.data = view()
    renderTool()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Ada' })[0]!)
    await waitFor(() => expect(h.take).toHaveBeenCalledWith({ assetId: 'a-content-writing', agentId: 'ag1' }))
    expect(screen.getByRole('button', { name: 'Add a skill' })).toBeTruthy()
  })

  it('says why no project is listed, instead of "None of your projects"', () => {
    h.data = view({ places: [], hiddenPlaces: 0 })
    renderTool()
    expect(screen.getByTestId('agent-no-places').textContent).toBe("Ada isn't assigned to any project you're in, so no project's skills apply to it yet.")
    cleanup()
    h.data = view({ places: [], hiddenPlaces: 1 })
    renderTool()
    expect(screen.getByTestId('agent-no-places').textContent).toContain('works in 1 project you aren\'t in')
  })

  it('leaves out Set aside when nothing was', () => {
    h.data = view({ setAside: [] })
    renderTool()
    expect(screen.queryByText('Set aside')).toBeNull()
  })
})
