import { describe, expect, it } from 'vitest'
import { filterAgents } from '../agentPickerLogic'

const agent = (name: string, handle: string, role: string | null) => ({ id: handle, name, handle, avatarUrl: null, role })
const agents = [agent('Kernel', 'kernel', 'Coordinates the organisation'), agent('Writer', 'scribe', 'Drafts documents'), agent('Analyst', 'numbers', null)]

describe('searching the agents @SC-941', () => {
  it('keeps every agent, in the server’s order, for an empty search', () => {
    expect(filterAgents(agents, '  ')).toEqual(agents)
  })
  it('matches the name, the handle or the role, without regard to case', () => {
    expect(filterAgents(agents, 'ANAL').map(a => a.name)).toEqual(['Analyst'])
    expect(filterAgents(agents, 'scribe').map(a => a.name)).toEqual(['Writer'])
    expect(filterAgents(agents, 'documents').map(a => a.name)).toEqual(['Writer'])
  })
  it('keeps the server’s order among the matches, and finds none for nonsense', () => {
    expect(filterAgents(agents, 'er').map(a => a.name)).toEqual(['Kernel', 'Writer', 'Analyst'])
    expect(filterAgents(agents, 'zzz')).toEqual([])
  })
})
