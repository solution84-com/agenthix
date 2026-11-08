import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sealed } from './testCredential'

const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
const mockHqFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    siteConfig: { findFirst: mockSiteConfigFindFirst },
    hqConnection: { findFirst: mockHqFindFirst },
  },
}))

import { callHqData, HqDataError } from '../dataClient'

beforeEach(() => {
  vi.clearAllMocks()
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 'site-uuid' })
  mockHqFindFirst.mockResolvedValue({
    hqUrl: 'https://hq.example.com',
    connectionToken: sealed('smc_a_b'),
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: () => Promise.resolve({ result: { ok: true } }),
  }))
  delete process.env.HQ_URL
})

describe('hq data client @SC-307', () => {
  it('posts the operation to hq with the site’s credential, identity and the run’s capability', async () => {
    const result = await callHqData('task.get', { taskId: 't-1' }, 'cap-jwt')

    const [url, init] = (fetch as any).mock.calls[0]
    expect(url.toString()).toBe('https://hq.example.com/api/v1/data')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer smc_a_b',
      'X-Site-Id': 'site-uuid',
      'X-Run-Capability': 'cap-jwt',
    })
    expect(JSON.parse(init.body)).toEqual({ operation: 'task.get', args: { taskId: 't-1' } })
    expect(result).toEqual({ ok: true })
  })

  it('says so when the run it acts for is waiting for an approval, and says nothing otherwise', async () => {
    await callHqData('update_task', {}, 'cap-jwt', { waitingForApproval: true })
    expect((fetch as any).mock.calls[0][1].headers['X-Run-Waiting-Approval']).toBe('1')
    await callHqData('update_task', {}, 'cap-jwt', { waitingForApproval: false })
    expect((fetch as any).mock.calls[1][1].headers).not.toHaveProperty('X-Run-Waiting-Approval')
  })

  it('falls back to HQ_URL when HqConnection.hqUrl is not set', async () => {
    process.env.HQ_URL = 'https://env.example.com'
    mockHqFindFirst.mockResolvedValue({ hqUrl: null, connectionToken: sealed('smc_a_b') })

    await callHqData('task.get', {}, 'cap-jwt')

    const [url] = (fetch as any).mock.calls[0]
    expect(url.toString()).toBe('https://env.example.com/api/v1/data')

    delete process.env.HQ_URL
  })

  it('prefers the stored hqUrl over HQ_URL when both are set', async () => {
    process.env.HQ_URL = 'https://env.example.com'
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com', connectionToken: sealed('smc_a_b') })

    await callHqData('task.get', {}, 'cap-jwt')

    const [url] = (fetch as any).mock.calls[0]
    expect(url.toString()).toBe('https://hq.example.com/api/v1/data')

    delete process.env.HQ_URL
  })

  it('joins the same absolute path whether or not the stored hqUrl has a trailing slash', async () => {
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com/', connectionToken: sealed('smc_a_b') })

    await callHqData('task.get', {}, 'cap-jwt')

    const [url] = (fetch as any).mock.calls[0]
    expect(url.toString()).toBe('https://hq.example.com/api/v1/data')
  })

  it('refuses before any fetch when the site has no siteId', async () => {
    mockSiteConfigFindFirst.mockResolvedValue(null)

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 0,
      message: expect.stringMatching(/not registered/i),
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses before any fetch when there is no connection token', async () => {
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com', connectionToken: null })

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toBeInstanceOf(HqDataError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses before any fetch when the stored credential is in the clear, treating it as absent', async () => {
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com', connectionToken: 'smc_a_b' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toBeInstanceOf(HqDataError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses before any fetch when there is no hqUrl anywhere', async () => {
    mockHqFindFirst.mockResolvedValue({ hqUrl: null, connectionToken: sealed('smc_a_b') })

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toBeInstanceOf(HqDataError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves hq’s error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: () => Promise.resolve({ error: "x is outside this run's project scope" }),
    }))

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 403,
      message: "x is outside this run's project scope",
    })
  })

  it('falls back to a generic message when hq returns a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, json: () => Promise.reject(new Error('not json')),
    }))

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 500,
      message: 'hq refused (500)',
    })
  })

  it('treats a non-JSON body on a 200 response as an error rather than returning undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.reject(new Error('not json')),
    }))

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 0,
      message: 'hq returned a malformed response',
    })
  })

  it('turns a request timeout into an HqDataError, distinct from unreachable', async () => {
    const timeoutError = new Error('The operation was aborted')
    timeoutError.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError))

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 0,
      message: 'hq did not respond within 15s',
    })
  })

  it('turns a network failure into an HqDataError, distinct from a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(callHqData('task.get', {}, 'cap-jwt')).rejects.toMatchObject({
      status: 0,
      message: 'hq is unreachable',
    })
  })
})
