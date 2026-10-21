import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CLAUDE_LOGIN_METHODS } from '@agenthix/core'

const mockStart = vi.hoisted(() => vi.fn())
const mockFinish = vi.hoisted(() => vi.fn())
const mockCancel = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../hqConnection', () => ({ hqConnectionManager: { restart: vi.fn() } }))
vi.mock('../../login/claudeLogin', () => ({
  startLogin: mockStart,
  finishLogin: mockFinish,
  cancelLogin: mockCancel,
}))

import { channelMethods } from '../channelMethods'

beforeEach(() => vi.clearAllMocks())

describe('claude login methods', () => {
  it('registers the three method names', () => {
    expect(typeof channelMethods[CLAUDE_LOGIN_METHODS.start]).toBe('function')
    expect(typeof channelMethods[CLAUDE_LOGIN_METHODS.finish]).toBe('function')
    expect(typeof channelMethods[CLAUDE_LOGIN_METHODS.cancel]).toBe('function')
  })

  it('routes start, finish and cancel to the login driver', async () => {
    mockStart.mockResolvedValue({ loginId: 'l1', url: 'https://claude.ai/x' })
    mockFinish.mockResolvedValue({ oauthJson: '{}' })
    mockCancel.mockResolvedValue({ cancelled: true })
    expect(await channelMethods[CLAUDE_LOGIN_METHODS.start]({})).toEqual({ loginId: 'l1', url: 'https://claude.ai/x' })
    expect(await channelMethods[CLAUDE_LOGIN_METHODS.finish]({ loginId: 'l1', code: 'c' })).toEqual({ oauthJson: '{}' })
    expect(mockFinish).toHaveBeenCalledWith({ loginId: 'l1', code: 'c' })
    expect(await channelMethods[CLAUDE_LOGIN_METHODS.cancel]({ loginId: 'l1' })).toEqual({ cancelled: true })
    expect(mockCancel).toHaveBeenCalledWith({ loginId: 'l1' })
  })
})
