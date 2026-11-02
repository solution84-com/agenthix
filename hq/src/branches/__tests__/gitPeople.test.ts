import { describe, expect, it } from 'vitest'
import { isGitEmail, isGitPersonName } from '@agenthix/core'
import { gitName, gitPersonOf, hqHost } from '../gitPeople'

describe('who a commit names', () => {
  it("takes HQ's host name from the address it serves at", () => {
    expect(hqHost('https://hq.fernhill.example:8443')).toBe('hq.fernhill.example')
    expect(hqHost('http://localhost:3001')).toBe('hq.invalid')
    expect(hqHost(undefined)).toBe('hq.invalid')
    expect(hqHost('not a url')).toBe('hq.invalid')
  })

  it('gives a person and an agent an address Git can write', () => {
    const mia = gitPersonOf('Mia Chen', 'mia', 'people', 'hq.example')
    expect(mia).toEqual({ name: 'Mia Chen', email: 'mia@people.hq.example' })
    const kernel = gitPersonOf('Kernel', 'kernel', 'agents', 'hq.example')
    expect(kernel.email).toBe('kernel@agents.hq.example')
  })

  it('strips what Git cannot write from a name, and falls back when nothing is left', () => {
    expect(gitName('Ada <ada@x>\n', 'ada')).toBe('Ada ada@x')
    expect(gitName('<>', 'ada')).toBe('ada')
    const odd = gitPersonOf('<\u0001>', 'Ünïcode handle!', 'people', 'hq.example')
    expect(isGitPersonName(odd.name)).toBe(true)
    expect(isGitEmail(odd.email)).toBe(true)
  })
})
