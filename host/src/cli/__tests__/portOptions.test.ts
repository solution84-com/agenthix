import { describe, expect, it } from 'vitest'
import { parseCommand } from '../commands'

describe('the flags that choose the published ports @SC-1242', () => {
  it('install takes --hq-port and --console-port beside --address and --yes', () => {
    expect(parseCommand(['install', '--address', 'https://hq.acme.example', '--hq-port', '7600', '--console-port', '7601', '--yes']))
      .toEqual({ kind: 'install', address: 'https://hq.acme.example', yes: true, hqPort: 7600, consolePort: 7601 })
    expect(parseCommand(['install'])).toEqual({ kind: 'install', address: undefined, yes: false })
  })

  it('refuses a port that is not a whole number', () => {
    expect(parseCommand(['install', '--hq-port', 'seventy'])).toEqual({ kind: 'usage', message: '--hq-port takes a port, a whole number such as 7800.' })
    expect(parseCommand(['install', '--console-port'])).toEqual({ kind: 'usage', message: '--console-port takes a port, a whole number such as 7801.' })
  })

  it('restore takes them for HQ, and refuses them for a site, which publishes none', () => {
    expect(parseCommand(['restore', '--from', '/mnt/nas', '--console-port', '7520'])).toEqual({ kind: 'restore', from: '/mnt/nas', consolePort: 7520 })
    expect(parseCommand(['restore', '--from', '/mnt/nas', 'https://hq.acme.example', '7KQ4M2XD46Q3', '--hq-port', '7600']))
      .toMatchObject({ kind: 'usage', message: 'A site publishes no ports: --hq-port and --console-port are for restoring HQ.' })
  })

  it('console install takes --console-port', () => {
    expect(parseCommand(['console', 'install', 'https://hq.acme.example', '7KQ4M2XD46Q3', '--console-port', '7700', '--yes']))
      .toMatchObject({ kind: 'consoleInstall', address: 'https://hq.acme.example', yes: true, consolePort: 7700 })
  })
})
