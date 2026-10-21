import type { Place } from '../placeTypes'

export function testPlace(overrides: Partial<Place> = {}): Place {
  return {
    basePath: '/projects/AGX',
    homePath: '/projects/AGX',
    breadcrumbs: [{ label: 'Projects', href: '/projects' }, { label: 'Agenthix', href: '/projects/AGX' }],
    name: 'Agenthix',
    talkLabel: 'Talk about Agenthix',
    factsHeading: 'About this project',
    backHref: '/projects',
    projectId: 'p1',
    sessionLocation: { primaryOwnerType: 'project', primaryOwnerId: 'p1' },
    agents: [{ id: 'a1', name: 'Project manager', avatarUrl: null }],
    defaultAgentId: 'a1',
    composerPlaceholder: 'Talk about this project…',
    noAgentsNotice: 'Add an agent',
    facts: [{ label: 'Lead', value: 'Avery' }, { label: 'Access', value: 'Open' }],
    teamRows: [
      { id: 'members', label: 'Members', count: '6', avatars: <span>faces</span>, render: () => <div>the members view</div> },
    ],
    linkedTools: [
      { id: 'people', label: 'Members', aliasOf: 'members', render: () => <div>the members view</div> },
      { id: 'agents', label: 'Members', aliasOf: 'members', render: () => <div>the members view</div> },
    ],
    toolGroups: [
      {
        label: 'Work',
        tools: [
          { id: 'tasks', label: 'Tasks', count: '1 needs you · 12', tone: 'needs', render: () => <div>the tasks view</div> },
          { id: 'boards', label: 'Boards', count: '3', render: () => <div>the boards view</div> },
          { id: 'timeline', label: 'Timeline', render: () => <div>the timeline view</div> },
        ],
      },
      { label: 'Agents at work', tools: [{ id: 'runs', label: 'Runs', count: '2', tone: 'live', render: () => <div>the runs view</div> }] },
      { label: null, tools: [{ id: 'settings', label: 'Settings', render: () => <div>the settings view</div> }] },
    ],
    sectionOrder: ['tasks', 'boards', 'timeline', 'runs', 'members', 'settings'],
    ...overrides,
  }
}
