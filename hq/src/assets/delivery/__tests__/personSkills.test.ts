import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { deliveredSkillName } from '@agenthix/core'
import { isOwnConversation, personalSkillsApply, publishedPersonSkill, type ChatTurn, type PersonSkillRow, type RunFor } from '../personSkills'

const own: RunFor = { kind: 'chat', startedBy: 'person', personId: 'p1', ownConversation: true, place: { placeType: 'project', placeId: 'proj' } }

describe('whose runs a person\'s skills follow them into', () => {
  it('their own conversation in a project', () => {
    expect(personalSkillsApply(own, true)).toBe(true)
  })

  it.each([
    ['a scheduled run', { startedBy: 'schedule' as const }],
    ['a pulse', { startedBy: 'pulse' as const }],
    ['a run an agent started', { startedBy: 'agent' as const }],
    ['a task run', { kind: 'task' as const }],
    ['a run that is not of their own conversation', { ownConversation: false }],
    ['a run for no one', { personId: null }],
  ])('not %s', (_what, change) => {
    expect(personalSkillsApply({ ...own, ...change }, true)).toBe(false)
  })

  it('not when the organisation has turned it off', () => {
    expect(personalSkillsApply(own, false)).toBe(false)
  })

  it('not in Your space, where they are the place\'s own skills', () => {
    expect(personalSkillsApply({ ...own, place: { placeType: 'user', placeId: 'p1' } }, true)).toBe(false)
    expect(personalSkillsApply({ ...own, place: { placeType: 'user', placeId: 'someone-else' } }, true)).toBe(true)
  })
})

const myChat: ChatTurn = { taskId: null, sessionUserId: 'p1', senderId: 'p1', conversationId: null, conversation: null }
const myWorker: ChatTurn = { ...myChat, conversationId: 'c1', conversation: { openedById: 'p1', home: 'PROJECT' } }

describe('a turn of the person\'s own conversation', () => {
  it('their own chat', () => {
    expect(isOwnConversation(myChat)).toBe(true)
  })

  it('a worker their own conversation briefed on their behalf', () => {
    expect(isOwnConversation(myWorker)).toBe(true)
    expect(isOwnConversation({ ...myWorker, conversation: { openedById: 'p1', home: 'PERSON' } })).toBe(true)
  })

  it('not a worker of someone else\'s conversation, even one working for me', () => {
    expect(isOwnConversation({ ...myWorker, conversation: { openedById: 'p2', home: 'PROJECT' } })).toBe(false)
  })

  it('not a turn or brief someone else sent', () => {
    expect(isOwnConversation({ ...myChat, senderId: 'p2' })).toBe(false)
    expect(isOwnConversation({ ...myWorker, senderId: 'p2' })).toBe(false)
  })

  it('not a task\'s session, nor a worker of a task\'s thread', () => {
    expect(isOwnConversation({ ...myChat, taskId: 't1' })).toBe(false)
    expect(isOwnConversation({ ...myWorker, conversation: { openedById: 'p1', home: 'TASK' } })).toBe(false)
  })

  it('not a worker whose conversation can\'t be found', () => {
    expect(isOwnConversation({ ...myWorker, conversation: null })).toBe(false)
  })

  it('a worker of my own conversation gets my skills; a task or scheduled run doesn\'t', () => {
    const worker = { ...own, ownConversation: isOwnConversation(myWorker) }
    expect(personalSkillsApply(worker, true)).toBe(true)
    expect(personalSkillsApply({ ...worker, kind: 'task' }, true)).toBe(false)
    expect(personalSkillsApply({ ...worker, startedBy: 'schedule' }, true)).toBe(false)
    expect(personalSkillsApply({ ...own, ownConversation: isOwnConversation({ ...myWorker, conversation: { openedById: 'p2', home: 'PROJECT' } }) }, true)).toBe(false)
  })
})

const P1 = '0c1d2e3f-4a5b-4c6d-8e7f-001122334455'
const F1 = '1'.repeat(64)
const F2 = '2'.repeat(64)
const md = (extra = '') => `---\nname: release-notes\ndescription: Writes release notes\n${extra}---\n\nBody`
const row = (over: Partial<PersonSkillRow> = {}): PersonSkillRow => ({
  path: '.agents/skills/release-notes', switch: null, switchFingerprint: null,
  published: { id: 'v1', number: 3, digest: F1 }, skillMd: md(), ...over,
})

describe('which version of a person\'s skill follows them', () => {
  it('the published version, by its own ref', () => {
    expect(publishedPersonSkill(P1, row(), null, 'ON')).toEqual({
      entry: { identity: `${P1}/release-notes`, version: '3', digest: F1, ref: { kind: 'skill', key: 'v1', digest: F1 } },
      key: 'release-notes',
      label: 'release-notes',
    })
  })

  it('none that was never published, whatever the default', () => {
    expect(publishedPersonSkill(P1, row({ published: null }), null, 'ON')).toBeNull()
  })

  it('never an unpublished change: a switch set on the files\' newer content does not carry it', () => {
    expect(publishedPersonSkill(P1, row({ switch: 'ON', switchFingerprint: F2 }), null, 'OFF')).toBeNull()
    const onByDefault = publishedPersonSkill(P1, row({ switch: 'ON', switchFingerprint: F2 }), null, 'ON')
    expect(onByDefault?.entry.digest).toBe(F1)
  })

  it('the published version when switched on for it, under Off by default', () => {
    expect(publishedPersonSkill(P1, row({ switch: 'ON', switchFingerprint: F1 }), null, 'OFF')?.entry.digest).toBe(F1)
  })

  it('none when switched off, or when Your space or the organisation says Never', () => {
    expect(publishedPersonSkill(P1, row({ switch: 'OFF', switchFingerprint: F1 }), null, 'ON')).toBeNull()
    expect(publishedPersonSkill(P1, row({ switch: 'ON', switchFingerprint: F1 }), 'NEVER', 'ON')).toBeNull()
    expect(publishedPersonSkill(P1, row({ switch: 'ON', switchFingerprint: F1 }), null, 'NEVER')).toBeNull()
  })

  it('is the same skill as the identity it was copied with', () => {
    const copied = publishedPersonSkill(P1, row({ skillMd: md('metadata:\n  identity: acme/release-notes\n') }), null, 'ON')
    expect(copied?.key).toBe('acme/release-notes')
    expect(copied?.entry.identity).toBe('acme/release-notes')
  })

  it('is named for the site by an identity it can stage, the person\'s and the folder\'s, when it was not copied in', () => {
    const own = publishedPersonSkill(P1, row({ path: '.agents/agents/a1/skills/notes' }), null, 'ON')
    expect(own?.entry.identity).toBe(`${P1}/notes`)
    expect(deliveredSkillName('person', own!.entry.identity)).toBe('person-notes')
    expect(publishedPersonSkill(P1, row({ skillMd: md('metadata:\n  identity: Not An Identity\n') }), null, 'ON')?.entry.identity).toBe(`${P1}/release-notes`)
  })
})
