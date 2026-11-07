// @vitest-environment jsdom
/**
 * A place's message box is the one box conversations start from, given the place: its home, its project, its own
 * agents and its default. How that box sends is `NewConversationBox.test.tsx`.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const role = { value: 'MEMBER' }

vi.mock('wasp/client/operations', () => ({
  getProjects: { name: 'getProjects' },
  useQuery: () => ({ data: [{ id: 'p1', isMember: true, myRole: role.value }] }),
}))
vi.mock('../../conversations/components/NewConversationBox', () => ({
  NewConversationBox: (p: { home: string; projectId?: string; basePath: string; placeholder: string; agentId?: string; onlyAgentIds?: string[]; autoFocus?: boolean }) => (
    <div
      data-testid="box"
      data-home={p.home}
      data-project={p.projectId ?? ''}
      data-base={p.basePath}
      data-agent={p.agentId ?? ''}
      data-only={(p.onlyAgentIds ?? []).join(',')}
      data-focus={String(!!p.autoFocus)}
    >{p.placeholder}</div>
  ),
}))

import { PlaceComposer, startingAgentId } from '../components/PlaceComposer'
import { testPlace } from './placeFixture'

beforeEach(() => { role.value = 'MEMBER' })

const twoAgents = testPlace({
  agents: [{ id: 'a1', name: 'Project manager', avatarUrl: null }, { id: 'a2', name: 'DevOps', avatarUrl: null }],
  defaultAgentId: 'a2',
})
const box = () => screen.getByTestId('box').dataset

describe('PlaceComposer @SC-496', () => {
  it('is the one box, in the place’s project, offering its own agents and starting with its default', () => {
    render(<PlaceComposer place={twoAgents} autoFocus />)
    expect(box()).toMatchObject({ home: 'PROJECT', project: 'p1', base: twoAgents.basePath, agent: 'a2', only: 'a1,a2', focus: 'true' })
    expect(screen.getByTestId('box').textContent).toBe(twoAgents.composerPlaceholder)
  })

  it("starts in the person's own space when the place is not a project, as an agent's page is", () => {
    render(<PlaceComposer place={{ ...twoAgents, basePath: '/chat', sessionLocation: null, agents: [twoAgents.agents[0]], defaultAgentId: 'a1' }} />)
    expect(box()).toMatchObject({ home: 'PERSON', project: '', base: '/chat', agent: 'a1', only: 'a1' })
  })

  it("offers a project Viewer no message box, only a line saying they read here and whom to ask (adr-0102)", () => {
    role.value = 'VIEWER'
    render(<PlaceComposer place={twoAgents} />)
    expect(screen.queryByTestId('box')).toBeNull()
    expect(screen.getByText(/You're a Viewer here: you can read this project but not change it\. Ask one of its admins/)).toBeTruthy()
  })
})

describe('startingAgentId @SC-496', () => {
  it('takes the first agent when the default cannot be talked to here', () => {
    expect(startingAgentId({ agents: [{ id: 'a1', name: 'A', avatarUrl: null }], defaultAgentId: 'gone' })).toBe('a1')
  })
})
