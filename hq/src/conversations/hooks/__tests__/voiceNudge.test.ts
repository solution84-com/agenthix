import { describe, expect, it, vi } from 'vitest'
import { voiceNudgeOf } from '../voiceNudge'
import { IDLE } from '../../voiceClient/voiceSnapshot'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }

describe('why voice stopped, as a line in the thread (decision 3) @SC-1933', () => {
  it('offers Start voice where voice has stopped, and starts it with the agent', () => {
    const start = vi.fn()
    const line = voiceNudgeOf('c1', { voice: { ...IDLE, notice: 'Voice stopped: the speech service hung up. You can keep typing.', noticeFor: 'c1' }, start, clearNotice: vi.fn() }, agent as never)
    expect(line).toMatchObject({ key: 'voice', text: 'Voice stopped: the speech service hung up. You can keep typing.', actionLabel: 'Start voice' })
    line!.retry!()
    expect(start).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'a1', name: 'Kernel', avatarUrl: null }))
  })

  it('in a call, can be put away', () => {
    const clearNotice = vi.fn()
    const line = voiceNudgeOf('c1', { voice: { ...IDLE, conversationId: 'c1', phase: 'listening', notice: 'Your words were not sent. HQ did not answer.', noticeFor: 'c1' }, start: vi.fn(), clearNotice }, null)
    expect(line?.actionLabel).toBe('Dismiss')
    line!.retry!()
    expect(clearNotice).toHaveBeenCalled()
  })

  it('is nothing for another conversation, or with no notice', () => {
    expect(voiceNudgeOf('c2', { voice: { ...IDLE, notice: 'Voice ended.', noticeFor: 'c1' }, start: vi.fn(), clearNotice: vi.fn() }, null)).toBeNull()
    expect(voiceNudgeOf('c1', { voice: IDLE, start: vi.fn(), clearNotice: vi.fn() }, null)).toBeNull()
  })
})
