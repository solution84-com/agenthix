// @vitest-environment jsdom
/** Sections that hold their content while a refresh keeps failing say Not up to date above it (C3). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ reads: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getOrgRunLimits: 'getOrgRunLimits', getProjectRunLimits: 'getProjectRunLimits', updateOrgRunLimits: 'x', setProjectRunLimits: 'x',
  getAgentPermissions: 'getAgentPermissions', getAgentPromptPreview: 'getAgentPromptPreview', updateAgent: 'x', updateAgentSettings: 'x', updateAgentFile: 'x',
  getUserSettings: vi.fn(),
  useQuery: (name: string) => h.reads[name] ?? { data: undefined, refetch: vi.fn() },
  useAction: () => vi.fn(),
}))
vi.mock('@agenthix/ui/agents', () => ({
  PromptTab: () => null, ConfigurationTab: () => null, AgentPermissionsView: () => null, organisationDraft: () => ({}),
  PermissionsSummary: () => <p>Permissions summary</p>,
}))
vi.mock('../manage/ManageSection', () => ({
  ManageSection: ({ title, summary }: { title: string; summary: React.ReactNode }) => <section aria-label={title}>{summary}</section>,
}))
vi.mock('../../../models-settings/components/AgentModelsSection', () => ({ AgentModelsSection: () => null }))
vi.mock('../../../assets/pages/agent/AgentSkillsSection', () => ({ AgentSkillsSection: () => null }))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: () => null }))

import { RunLimitsSection } from '../RunLimitsSection'
import { PermissionsSection } from '../manage/PermissionsSection'
import { ManageEditors } from '../manage/ManageEditors'

afterEach(cleanup)
const down = Object.assign(new Error('Failed to fetch'), { statusCode: undefined })
const old = () => Date.now() - 5 * 60_000
const agent = { id: 'a1', name: 'Ada', handle: 'ada', approval: 'ASK' } as never

describe('held sections that say Not up to date @SC-1910 @SC-1930', () => {
  it('Run limits keeps the form and says it above', () => {
    h.reads.getOrgRunLimits = { data: { timeLimitMinutes: 30, turnLimit: 50 }, error: down, dataUpdatedAt: old(), refetch: vi.fn() }
    render(<RunLimitsSection scope={{ kind: 'org' }} />)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    expect(screen.getByLabelText('Time limit (minutes)')).toBeTruthy()
  })

  it('Run limits says nothing while fresh', () => {
    h.reads.getOrgRunLimits = { data: { timeLimitMinutes: 30, turnLimit: 50 }, error: down, dataUpdatedAt: Date.now(), refetch: vi.fn() }
    render(<RunLimitsSection scope={{ kind: 'org' }} />)
    expect(screen.queryByText(/Not up to date/)).toBeNull()
  })

  it('Permissions keeps the summary and says it above', () => {
    h.reads.getAgentPermissions = { data: {}, error: down, dataUpdatedAt: old(), refetch: vi.fn() }
    render(<PermissionsSection agent={agent} />)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    expect(screen.getByText('Permissions summary')).toBeTruthy()
  })

  it('Instructions keeps the summary and says it above', () => {
    h.reads.getAgentPromptPreview = { data: { sections: [{ key: 'instructions', content: 'Be kind.' }] }, error: down, dataUpdatedAt: old(), refetch: vi.fn() }
    render(<ManageEditors agent={agent} />)
    const section = screen.getByRole('region', { name: 'Instructions' })
    expect(section.textContent).toContain('Not up to date')
    expect(section.textContent).toContain('Be kind.')
  })
})
