// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('wasp/client/operations', () => ({}))
vi.mock('../ChatAgentsTool', () => ({ ChatAgentsTool: () => <p>agents tool</p> }))
vi.mock('../../projects/pages/ProjectTasksPage', () => ({ ProjectTasksPage: () => null }))
vi.mock('../../projects/pages/ProjectBoardsPage', () => ({ ProjectBoardsPage: () => null }))
vi.mock('../../projects/place/ProjectRunsTool', () => ({ ProjectRunsTool: () => null }))
vi.mock('../../projects/place/ProjectRunControls', () => ({ ProjectRunControls: () => null }))
vi.mock('../../projects/place/projectToolViews', () => ({ ProjectAutomationTool: () => null }))
vi.mock('../../storage/pages/filesToolGroup', () => ({ filesToolGroup: () => ({ label: 'Files', tools: [] }) }))

import { chatFacts, chatLinkedTools } from '../chatPlace'
import { findTool } from '../../places/placeSections'
import type { Place } from '../../places/placeTypes'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.search}</p>
}

describe('Chat’s Agents fact @SC-587', () => {
  it('opens the Agents section', () => {
    const fact = chatFacts(null).find((f) => f.label === 'Agents')!
    render(<MemoryRouter initialEntries={['/chat']}>{fact.value}<Where /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Roster, and any agent/ }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=agents')
  })

  it('is a tool a section can show, though it has no row of its own', () => {
    const place = { toolGroups: [], linkedTools: chatLinkedTools('p1') } as unknown as Place
    expect(findTool(place, 'agents')?.label).toBe('Agents')
    expect(findTool(place, 'people')).toBeNull()
  })
})
