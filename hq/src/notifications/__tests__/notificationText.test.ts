import { describe, it, expect } from 'vitest'
import { describeNotification } from '../notificationText'

const task = { key: 'WEB-27', title: 'Fix it', agent: null, request: { command: 'pwd', tool: null, more: 0 } }

describe('the second line of a notification @SC-524', () => {
  it('names what a waiting request wants to run', () => {
    expect(describeNotification({ type: 'tool_approval', body: '', status: 'unread' }, task as never)).toMatchObject({ command: 'pwd' })
  })

  it('says a request or notice is no longer waiting once it is handled', () => {
    expect(describeNotification({ type: 'tool_approval', body: '', status: 'handled' }, task as never)).toMatchObject({ detail: 'No longer waiting', command: null })
    expect(describeNotification({ type: 'task_waiting', body: '"Fix it" is waiting for you. Turn limit', status: 'handled' }, task as never)).toMatchObject({ detail: 'No longer waiting' })
  })
})
