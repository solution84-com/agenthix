import { describe, expect, it } from 'vitest'
import { closedMark, closedNotice } from '../closedCopy'
import { newConversationPath, threadPath } from '../threadPaths'

describe('the closed notice @SC-943', () => {
  it('is absent for a conversation that is not closed', () => {
    expect(closedNotice('ACTIVE', null)).toBeNull()
    expect(closedNotice('ARCHIVED', null)).toBeNull()
  })

  it('says why a conversation closed', () => {
    expect(closedNotice('CLOSED', 'PROJECT_DELETED')?.detail).toContain('its project was deleted')
    expect(closedNotice('CLOSED', 'LEFT_PROJECT')?.detail).toContain('no longer a member of its project')
  })

  it('still reads plainly when the reason is not known', () => {
    expect(closedNotice('CLOSED', null)?.headline).toBe('This conversation is closed')
  })

  it('marks a list row with the reason', () => {
    expect(closedMark('TASK_DELETED')).toBe('Closed · its task was deleted')
    expect(closedMark(null)).toBe('Closed')
  })
})

describe('addresses', () => {
  it('puts a conversation under its place', () => {
    expect(threadPath('/chat', 'abc')).toBe('/chat/t/abc')
    expect(threadPath('/projects/AGX', 'abc')).toBe('/projects/AGX/t/abc')
  })

  it('carries the agent a new conversation starts with', () => {
    expect(newConversationPath('/chat', 'a 1')).toBe('/chat?agent=a%201')
    expect(newConversationPath('/chat', null)).toBe('/chat')
  })
})
