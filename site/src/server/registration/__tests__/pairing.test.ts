import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HQ_SITE_CHANNEL_PATH } from '@agenthix/core'

const mockHqUpsert = vi.hoisted(() => vi.fn())
const mockHqFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: { hqConnection: { upsert: mockHqUpsert, findFirst: mockHqFindFirst } },
}))
const mockRestart = vi.hoisted(() => vi.fn())
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { restart: mockRestart } }))

import { connectFromPairingSecretIfConfigured } from '../pairing'
import { readConnectionToken } from '../../hq/connectionToken'
import { currentPairingProblem } from '../../hq/linkProblem'

const KEY = Buffer.alloc(32, 6).toString('base64')
process.env.SECRETS_MASTER_KEY = KEY

const SECRET = '3f9a1c7e5b2d8046a1f3c9e7d5b20486'.repeat(2)

let logs: string[]
beforeEach(() => {
  vi.clearAllMocks()
  mockRestart.mockResolvedValue(undefined)
  mockHqUpsert.mockResolvedValue({})
  mockHqFindFirst.mockResolvedValue(null)
  delete process.env.HQ_URL
  delete process.env.HQ_PAIRING_SECRET
  delete process.env.HOST_NAMESPACE
  logs = []
  const capture = (...args: unknown[]) => { logs.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')) }
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.HQ_URL
  delete process.env.HQ_PAIRING_SECRET
  delete process.env.HOST_NAMESPACE
})

function configure(hqUrl = 'http://localhost:4101', secret = SECRET) {
  process.env.HQ_URL = hqUrl
  process.env.HQ_PAIRING_SECRET = secret
}

describe('connecting to hq from the pairing secret', () => {
  it('is not configured without HQ_PAIRING_SECRET, storing nothing', async () => {
    process.env.HQ_URL = 'http://localhost:4101'
    expect(await connectFromPairingSecretIfConfigured()).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(mockRestart).not.toHaveBeenCalled()
  })

  it('is not configured without HQ_URL, storing nothing', async () => {
    process.env.HQ_PAIRING_SECRET = SECRET
    expect(await connectFromPairingSecretIfConfigured()).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
  })

  it('is not configured for a blank secret, without complaint', async () => {
    configure('http://localhost:4101', '   ')
    expect(await connectFromPairingSecretIfConfigured()).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(logs).toEqual([])
  })

  it('is not configured for a secret shorter than 32 characters, saying so without printing it', async () => {
    const short = 'z'.repeat(31)
    configure('http://localhost:4101', short)
    expect(await connectFromPairingSecretIfConfigured()).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(mockRestart).not.toHaveBeenCalled()
    expect(logs.join('\n')).toMatch(/HQ_PAIRING_SECRET/)
    expect(logs.join('\n')).not.toContain(short)
  })

  it('stores a link whose bearer is the secret, status PENDING, and starts the connection', async () => {
    configure('http://localhost:4101')
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    const call = mockHqUpsert.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'singleton' })
    expect(call.create).toMatchObject({
      id: 'singleton',
      status: 'PENDING',
      hqUrl: 'http://localhost:4101',
      hqWsUrl: 'ws://localhost:4101' + HQ_SITE_CHANNEL_PATH,
    })
    expect(call.update).toMatchObject({ status: 'PENDING' })
    for (const written of [call.create, call.update]) {
      expect(written.connectionToken).not.toContain(SECRET)
      expect(readConnectionToken(written.connectionToken)).toBe(SECRET)
    }
    expect(mockRestart).toHaveBeenCalledTimes(1)
  })

  it('derives a wss channel address from an https hq and ignores a trailing slash', async () => {
    configure('https://hq.example.com/')
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    expect(mockHqUpsert.mock.calls[0][0].create).toMatchObject({
      hqUrl: 'https://hq.example.com',
      hqWsUrl: 'wss://hq.example.com' + HQ_SITE_CHANNEL_PATH,
    })
  })

  it('trims whitespace around the secret before using it as the bearer', async () => {
    configure('http://localhost:4101', `  ${SECRET}\n`)
    await connectFromPairingSecretIfConfigured()
    expect(readConnectionToken(mockHqUpsert.mock.calls[0][0].create.connectionToken)).toBe(SECRET)
  })

  it('addresses the single HqConnection row, so a second boot leaves one', async () => {
    configure()
    await connectFromPairingSecretIfConfigured()
    await connectFromPairingSecretIfConfigured()
    expect(mockHqUpsert).toHaveBeenCalledTimes(2)
    for (const [arg] of mockHqUpsert.mock.calls) expect(arg.where).toEqual({ id: 'singleton' })
  })

  it('refuses a plain http:// remote hq like registration does, logging why and storing nothing', async () => {
    configure('http://hq.example.com:4101')
    expect(await connectFromPairingSecretIfConfigured()).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(mockRestart).not.toHaveBeenCalled()
    expect(logs.join('\n')).toMatch(/Refusing http:\/\/hq\.example\.com/)
  })

  it('accepts plain http:// to a private network address', async () => {
    configure('http://192.168.1.20:4101')
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
  })

  it('refuses to pair without SECRETS_MASTER_KEY, saying so and storing nothing', async () => {
    configure()
    delete process.env.SECRETS_MASTER_KEY
    try {
      expect(await connectFromPairingSecretIfConfigured()).toBe('failed')
      expect(mockHqUpsert).not.toHaveBeenCalled()
      expect(logs.join('\n')).toMatch(/SECRETS_MASTER_KEY/)
      expect(logs.join('\n')).not.toContain(SECRET)
    } finally {
      process.env.SECRETS_MASTER_KEY = KEY
    }
  })

  it('recovers at the next start from a credential stored in the clear, by storing the secret encrypted', async () => {
    configure()
    // What the site finds: an unreadable stored credential reads as none...
    expect(readConnectionToken(SECRET)).toBeNull()
    // ...and the start stores a readable one from the environment.
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    expect(readConnectionToken(mockHqUpsert.mock.calls[0][0].update.connectionToken)).toBe(SECRET)
  })

  it('never writes the secret to any log, on success or on failure', async () => {
    configure()
    await connectFromPairingSecretIfConfigured()
    mockRestart.mockRejectedValueOnce(new Error('restart failed'))
    await connectFromPairingSecretIfConfigured()
    await new Promise(r => setTimeout(r, 0))
    configure('http://hq.example.com')
    await connectFromPairingSecretIfConfigured()
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.join('\n')).not.toContain(SECRET)
  })

  it('pairs over plain http with hq-web by its container name on the private network', async () => {
    configure('http://ns-hq-web:4100')
    const resolve = vi.fn(async () => ['172.18.0.3'])
    expect(await connectFromPairingSecretIfConfigured({ resolve })).toBe('connected')
    expect(resolve).toHaveBeenCalledWith('ns-hq-web')
    expect(mockHqUpsert.mock.calls[0][0].create).toMatchObject({
      hqUrl: 'http://ns-hq-web:4100',
      hqWsUrl: 'ws://ns-hq-web:4100' + HQ_SITE_CHANNEL_PATH,
    })
    expect(currentPairingProblem()).toBeNull()
  })

  it('waits for a container name that does not resolve yet, then pairs', async () => {
    configure('http://ns-hq-web:4100')
    const resolve = vi.fn()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValue(['172.18.0.3'])
    const sleep = vi.fn(async () => {})
    expect(await connectFromPairingSecretIfConfigured({ resolve, sleep })).toBe('connected')
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('gives up on a container name that never resolves, storing nothing and saying why', async () => {
    configure('http://ns-hq-web:4100')
    const resolve = vi.fn(async (): Promise<string[]> => { throw new Error('ENOTFOUND') })
    expect(await connectFromPairingSecretIfConfigured({ resolve, sleep: async () => {} })).toBe('not-configured')
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(logs.join('\n')).toMatch(/does not resolve/)
    expect(currentPairingProblem()).toBe('addressRefused')
  })

  it('refuses a container name that resolves outside a private network, without retrying', async () => {
    configure('http://ns-hq-web:4100')
    const sleep = vi.fn(async () => {})
    expect(await connectFromPairingSecretIfConfigured({ resolve: async () => ['203.0.113.7'], sleep })).toBe('not-configured')
    expect(sleep).not.toHaveBeenCalled()
    expect(mockHqUpsert).not.toHaveBeenCalled()
    expect(currentPairingProblem()).toBe('addressRefused')
  })

  it('records why it did not pair, for the site\'s status, and clears it when it pairs', async () => {
    configure('http://localhost:4101', 'z'.repeat(31))
    await connectFromPairingSecretIfConfigured()
    expect(currentPairingProblem()).toBe('secretTooShort')
    configure('http://hq.example.com:4101')
    await connectFromPairingSecretIfConfigured()
    expect(currentPairingProblem()).toBe('addressRefused')
    configure()
    delete process.env.SECRETS_MASTER_KEY
    try {
      await connectFromPairingSecretIfConfigured()
      expect(currentPairingProblem()).toBe('credentialStore')
    } finally {
      process.env.SECRETS_MASTER_KEY = KEY
    }
    await connectFromPairingSecretIfConfigured()
    expect(currentPairingProblem()).toBeNull()
  })
})

describe('pairing after hq moved (host-management spec §13)', () => {
  it('keeps the address the site followed hq to, and the move it waits on, while HQ_URL is the one it came from', async () => {
    configure('http://192.168.1.20:4100')
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'http://192.168.1.30:4100', pairedHqUrl: 'http://192.168.1.20:4100' })
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    const { update } = mockHqUpsert.mock.calls[0][0]
    expect(update).toMatchObject({
      hqUrl: 'http://192.168.1.30:4100', hqWsUrl: `ws://192.168.1.30:4100${HQ_SITE_CHANNEL_PATH}`, pairedHqUrl: 'http://192.168.1.20:4100',
    })
    expect(update).not.toHaveProperty('movingTo')
  })

  it('takes a new HQ_URL as it is, and drops a move it waited on', async () => {
    configure('http://192.168.1.30:4100')
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'http://192.168.1.20:4100', pairedHqUrl: 'http://192.168.1.20:4100', movingTo: 'http://192.168.1.30:4100' })
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    const { update } = mockHqUpsert.mock.calls[0][0]
    expect(update).toMatchObject({ hqUrl: 'http://192.168.1.30:4100', pairedHqUrl: 'http://192.168.1.30:4100', movingTo: null })
  })
})

describe('what the site says it connected by @SC-2195', () => {
  const resolve = vi.fn(async () => ['172.18.0.3'])

  it("says hq's own site paired by the pairing secret, beside hq-web by its container name", async () => {
    process.env.HOST_NAMESPACE = 'ns'
    configure('http://ns-hq-web:4100')
    expect(await connectFromPairingSecretIfConfigured({ resolve })).toBe('connected')
    expect(logs.join('\n')).toContain('Paired with hq at http://ns-hq-web:4100 by HQ_PAIRING_SECRET.')
  })

  it('says a development site paired by the pairing secret, with no host service naming it', async () => {
    configure('http://localhost:4101')
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    expect(logs.join('\n')).toContain('Paired with hq at http://localhost:4101 by HQ_PAIRING_SECRET.')
  })

  it('says a site the Fleet Console added connected with its own credential, never the pairing secret', async () => {
    process.env.HOST_NAMESPACE = 'ns'
    configure('https://hq.example.com')
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    const said = logs.join('\n')
    expect(said).toContain("Connected to hq at https://hq.example.com with this site's credential.")
    expect(said).not.toMatch(/Paired|HQ_PAIRING_SECRET/)
  })

  it("names another installation's hq-web as a further site's hq, not as its own", async () => {
    process.env.HOST_NAMESPACE = 'ns'
    configure('http://other-hq-web:4100')
    expect(await connectFromPairingSecretIfConfigured({ resolve })).toBe('connected')
    expect(logs.join('\n')).toContain("Connected to hq at http://other-hq-web:4100 with this site's credential.")
  })

  it('says where it moved from, in either wording', async () => {
    process.env.HOST_NAMESPACE = 'ns'
    configure('http://192.168.1.20:4100')
    mockHqFindFirst.mockResolvedValue({ hqUrl: 'http://192.168.1.30:4100', pairedHqUrl: 'http://192.168.1.20:4100' })
    expect(await connectFromPairingSecretIfConfigured()).toBe('connected')
    expect(logs.join('\n')).toContain(
      "Connected to hq at http://192.168.1.30:4100, where it moved from http://192.168.1.20:4100, with this site's credential.",
    )
  })
})
