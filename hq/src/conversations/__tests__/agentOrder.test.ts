import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ HttpError: class extends Error {}, prisma: {} }))
vi.mock('../../agents/kernelGuards', () => ({ KERNEL_HANDLE: 'kernel' }))
vi.mock('../../projects/membership', () => ({ projectStanding: vi.fn(), VIEWER_REFUSAL: '' }))

import { orderAgentChoices } from '../primaryAgent'

const agent = (id: string, name: string) => ({ id, name, handle: id, avatarUrl: null, role: null })
const all = ['Kernel', 'Analyst', 'Developer', 'Editor', 'Writer'].map(n => agent(n.toLowerCase(), n))
const names = (list: { name: string }[]) => list.map(a => a.name)

describe('the order of the agents a conversation may start with @SC-941', () => {
  it('puts the starting agent first, the rest by name, when there are no recent ones', () => {
    expect(names(orderAgentChoices(all, 'writer', []))).toEqual(['Writer', 'Analyst', 'Developer', 'Editor', 'Kernel'])
  })

  it('lifts the recent agents, newest first, between the starting agent and the rest', () => {
    expect(names(orderAgentChoices(all, 'kernel', ['writer', 'analyst']))).toEqual(['Kernel', 'Writer', 'Analyst', 'Developer', 'Editor'])
  })

  it('takes at most three recent agents, each once, and not the starting agent again', () => {
    const order = orderAgentChoices(all, 'kernel', ['kernel', 'editor', 'editor', 'writer', 'developer', 'analyst'])
    expect(names(order)).toEqual(['Kernel', 'Editor', 'Writer', 'Developer', 'Analyst'])
  })

  it('ignores a recent agent this home does not offer', () => {
    expect(names(orderAgentChoices(all, 'kernel', ['gone', 'editor']))).toEqual(['Kernel', 'Editor', 'Analyst', 'Developer', 'Writer'])
  })
})
