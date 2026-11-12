import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: null }) }))
vi.mock('../ChatAgentsTool', () => ({ ChatAgentsTool: () => null }))
vi.mock('../../projects/place/PersonalProjectsFact', () => ({ PersonalProjectsFact: () => null }))

import { chatFacts, spacePlaceFields } from '../chatPlace'

describe('chatFacts @SC-507', () => {
  it('says who sees it, which agents, and the personal files', () => {
    expect(chatFacts(null).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Personal projects', 'Files'])
    expect(chatFacts(null).filter((f) => typeof f.value === 'string').map((f) => f.value)).toEqual(['Only you', 'Your personal files'])
  })

  it('shows the Site only once the person’s storage has one', () => {
    expect(chatFacts({ id: 's1', label: 'Development' }).map((f) => f.label)).toEqual(['Who sees it', 'Agents', 'Personal projects', 'Site', 'Files'])
    expect(chatFacts({ id: 's1', label: 'Development' }).find((f) => f.label === 'Site')?.value).toBe('Development')
  })
})

describe('Your space as a project place @SC-507 @SC-2114', () => {
  it('is at /space, its conversations at /chat with any agent, in the person’s own storage', () => {
    const fields = spacePlaceFields([{ id: 'a1', name: 'Kernel', avatarUrl: null }], null)
    expect(fields).toMatchObject({
      homePath: '/space', basePath: '/chat', name: 'Your space', projectId: null, sessionLocation: null, backHref: null,
      agents: [{ id: 'a1', name: 'Kernel', avatarUrl: null }], defaultAgentId: null,
    })
    expect(fields.sectionOrder).toBeUndefined()
  })
})
