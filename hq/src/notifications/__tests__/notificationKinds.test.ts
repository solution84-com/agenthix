import { describe, it, expect } from 'vitest'
import { countsOnBell, groupNotifications, isPersistent, latestPerTask, needsYou, taskKeyOf, PERSISTENT_TYPES, PROVIDER_NOTIFICATION_TYPES, SITE_NOTIFICATION_TYPES } from '../notificationKinds'
import { describeNotification, firstRequest } from '../notificationText'

const n = (type: string, status: string, id = `${type}-${status}`) => ({ id, type, status })

describe('needsYou @SC-525', () => {
  it('holds every kind that asks for an action until it is handled, seen or not', () => {
    for (const type of ['tool_approval', 'task_waiting', 'credential_health']) {
      expect(needsYou(n(type, 'unread'))).toBe(true)
      expect(needsYou(n(type, 'read'))).toBe(true)
      expect(needsYou(n(type, 'handled'))).toBe(false)
    }
  })
  it('holds a persistent kind while it is open', () => {
    expect(PERSISTENT_TYPES).toEqual(expect.arrayContaining(Object.values(SITE_NOTIFICATION_TYPES)))
    for (const type of PERSISTENT_TYPES) {
      expect(needsYou(n(type, 'read'))).toBe(true)
      expect(needsYou(n(type, 'handled'))).toBe(false)
      expect(needsYou(n(type, 'dismissed'))).toBe(false)
    }
  })
  it("holds a provider that is not working until it works, and leaves a provider's change to Earlier", () => {
    expect(isPersistent(n(PROVIDER_NOTIFICATION_TYPES.notWorking, 'read'))).toBe(true)
    expect(needsYou(n(PROVIDER_NOTIFICATION_TYPES.notWorking, 'read'))).toBe(true)
    expect(needsYou(n(PROVIDER_NOTIFICATION_TYPES.changed, 'unread'))).toBe(false)
  })
  it('leaves any other kind to Earlier', () => {
    expect(needsYou(n('something_else', 'unread'))).toBe(false)
  })
})

describe('groupNotifications @SC-525', () => {
  it('splits Needs you from Earlier and keeps the order', () => {
    const list = [n('tool_approval', 'read', 'a'), n('task_waiting', 'handled', 'b'), n('credential_health', 'unread', 'c')]
    const { needsYou: now, earlier } = groupNotifications(list)
    expect(now.map(x => x.id)).toEqual(['a', 'c'])
    expect(earlier.map(x => x.id)).toEqual(['b'])
  })
})

describe('taskKeyOf', () => {
  it("reads the task's key from its link, and nothing from any other", () => {
    expect(taskKeyOf('/tasks/WEB-27')).toBe('WEB-27')
    expect(taskKeyOf('/admin/where-work-runs')).toBeNull()
    expect(taskKeyOf(null)).toBeNull()
  })
})

describe('firstRequest @SC-524', () => {
  it('names the first command, and how many more there are', () => {
    const json = JSON.stringify({ pendingManifest: { bashPatterns: [{ pattern: 'npm run deploy:preview' }, { pattern: 'curl' }], tools: [{ name: 'WebFetch' }] } })
    expect(firstRequest(json)).toEqual({ command: 'npm run deploy:preview', tool: null, more: 2 })
  })
  it('names a tool when there is no command, and nothing when the request cannot be read', () => {
    expect(firstRequest(JSON.stringify({ pendingManifest: { bashPatterns: [], tools: [{ name: 'WebFetch' }] } })))
      .toEqual({ command: null, tool: 'WebFetch', more: 0 })
    expect(firstRequest('not json')).toBeNull()
    expect(firstRequest(undefined)).toBeNull()
  })
})

describe('describeNotification @SC-524', () => {
  const task = { key: 'WEB-27', title: 'Fix the checkout redirect', agent: null, request: { command: 'npm run deploy:preview', tool: null, more: 0 } }
  it('says what a tool request wants to run', () => {
    expect(describeNotification({ type: 'tool_approval', body: 'long' }, task)).toEqual({
      task: { key: 'WEB-27', title: 'Fix the checkout redirect', agent: null }, detail: '', command: 'npm run deploy:preview',
    })
  })
  it("gives a waiting task's reason, without the notice's fixed opening", () => {
    const body = '"Fix the checkout redirect" is waiting for you. reached its 30 min limit'
    expect(describeNotification({ type: 'task_waiting', body }, { ...task, request: null }).detail).toBe('reached its 30 min limit')
  })
  it('keeps the body of a notice that is not about a task', () => {
    expect(describeNotification({ type: 'credential_health', body: 'Runs on this site stop' }, null))
      .toEqual({ task: null, detail: 'Runs on this site stop', command: null })
  })
})

describe('countsOnBell @SC-526 @SC-734', () => {
  it('counts what needs the person and has not been seen; the total keeps the seen ones', () => {
    const list = [n('tool_approval', 'unread'), n('tool_approval', 'read'), n('task_waiting', 'handled'), n('system', 'unread')]
    expect(list.filter(needsYou)).toHaveLength(2)
    expect(list.filter(countsOnBell)).toHaveLength(1)
  })

  it('keeps counting a persistent one while it is open, seen or not, and stops once it is handled', () => {
    for (const type of PERSISTENT_TYPES) {
      expect(isPersistent(n(type, 'read'))).toBe(true)
      expect(countsOnBell(n(type, 'unread'))).toBe(true)
      expect(countsOnBell(n(type, 'read'))).toBe(true)
      expect(countsOnBell(n(type, 'handled'))).toBe(false)
      expect(countsOnBell(n(type, 'dismissed'))).toBe(false)
    }
    expect(isPersistent(n('tool_approval', 'read'))).toBe(false)
    expect(countsOnBell(n('tool_approval', 'read'))).toBe(false)
  })
})

describe('latestPerTask @SC-525', () => {
  const at = (id: string, type: string, actionUrl: string | null) => ({ id, type, actionUrl })
  it('keeps one request or notice per task, the first (latest) listed, and returns the older ones', () => {
    const list = [
      at('new', 'tool_approval', '/tasks/WEB-17'), at('old1', 'tool_approval', '/tasks/WEB-17'),
      at('wait', 'task_waiting', '/tasks/WEB-17'), at('other', 'tool_approval', '/tasks/WEB-18'),
    ]
    const { kept, superseded } = latestPerTask(list)
    expect(kept.map(k => k.id)).toEqual(['new', 'other'])
    expect(superseded.map(k => k.id)).toEqual(['old1', 'wait'])
  })
  it('never drops a notification that is not about a task', () => {
    const list = [at('a', 'credential_health', '/admin/where-work-runs'), at('b', 'credential_health', '/admin/where-work-runs')]
    expect(latestPerTask(list).kept).toHaveLength(2)
  })
})
