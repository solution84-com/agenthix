import { describe, expect, it } from 'vitest'
import { addressPort, chooseConsolePort, chooseHqPort, choosePorts, defaultAddress, publishedPortProblem, refuseOtherPort } from '../ports'

const none = { hq: null, console: null }

describe("an installation's published ports @SC-1242", () => {
  it('takes 7800 and 7801 when nothing is chosen, with HQ at http://localhost:7800', () => {
    expect(choosePorts(defaultAddress(), {}, none)).toEqual({ hq: 7800, console: 7801 })
    expect(defaultAddress()).toBe('http://localhost:7800')
    expect(defaultAddress(7600)).toBe('http://localhost:7600')
  })

  it("takes HQ's port from a plain-http address, which browsers open there", () => {
    expect(chooseHqPort('http://192.168.0.13:7500', undefined, null)).toBe(7500)
    expect(chooseHqPort('http://hq.lan', undefined, null)).toBe(80)
    expect(chooseHqPort('http://192.168.0.13:7500', 7500, null)).toBe(7500)
    expect(addressPort('https://hq.acme.example')).toBeNull()
  })

  it('takes --hq-port, or the default, for an https address, which the front door or a proxy serves', () => {
    expect(chooseHqPort('https://hq.acme.example', undefined, null)).toBe(7800)
    expect(chooseHqPort('https://hq.acme.example', 7600, null)).toBe(7600)
    expect(chooseHqPort('https://hq.acme.example:8443', undefined, null)).toBe(7800)
  })

  it('reads back what was recorded when nothing is given', () => {
    expect(chooseHqPort('https://hq.acme.example', undefined, 7650)).toBe(7650)
    expect(chooseConsolePort(undefined, 7520)).toBe(7520)
    expect(chooseConsolePort(7530, 7520)).toBe(7530)
  })

  it('refuses an address and --hq-port that disagree', () => {
    expect(() => chooseHqPort('http://192.168.0.13:7500', 7600, null))
      .toThrow("HQ's address is on port 7500, but --hq-port says 7600. Give one of them. Nothing was changed.")
  })

  it('refuses a port outside 1024–32767, or 80 or 443 for HQ', () => {
    expect(() => chooseHqPort('https://hq.acme.example', 50000, null)).toThrow(
      'Port 50000 is in the range the operating system gives to outgoing connections, so it could be taken at any time. ' +
      'Choose a port from 1024 to 32767, or 80 or 443. Nothing was changed.',
    )
    expect(() => chooseConsolePort(443, null)).toThrow(/Port 443 needs extra privileges on Linux. Choose a port from 1024 to 32767\. Nothing/)
    expect(() => chooseConsolePort(70000, null)).toThrow(/70000 is not a port/)
    expect(() => chooseHqPort('http://hq.lan:22', undefined, null)).toThrow(/Port 22 needs extra privileges/)
    expect(chooseHqPort('http://hq.lan:443', undefined, null)).toBe(443)
    expect(publishedPortProblem(1024, 'console')).toBeNull()
    expect(publishedPortProblem(32767, 'console')).toBeNull()
    expect(publishedPortProblem(32768, 'console')).not.toBeNull()
  })

  it('refuses HQ and the Fleet Console on the same port', () => {
    expect(() => choosePorts('http://localhost:7801', {}, none)).toThrow(/cannot both be published on port 7801. Choose another with --hq-port/)
    expect(() => choosePorts(defaultAddress(), { consolePort: 7800 }, none)).toThrow(/Choose another with --console-port/)
  })

  it('refuses a flag that would move a port already chosen, rather than ignoring it', () => {
    expect(() => refuseOtherPort('console', 7900, 7801)).toThrow(/already published here on port 7801, not 7900. To move it: agenthix console port/)
    expect(() => refuseOtherPort('hq', 7800, 7800)).not.toThrow()
    expect(() => refuseOtherPort('hq', undefined, 7800)).not.toThrow()
  })
})
