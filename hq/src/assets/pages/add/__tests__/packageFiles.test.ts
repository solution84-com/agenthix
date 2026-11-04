import { describe, it, expect } from 'vitest'
import { may, type PersonActor } from '../../../policy'
import { readAction } from '../packageFiles'

const maintainer: PersonActor = { kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: true, projectRole: null }
const admin: PersonActor = { ...maintainer, role: 'ADMIN' }
const admins = { level: 'organisation', outsideInstallers: 'ADMINS' } as const
const both = { level: 'organisation', outsideInstallers: 'ADMINS_AND_MAINTAINERS' } as const

describe('reading a package before installing it', () => {
  it("asks for the permission installing from that source would", () => {
    expect(readAction({ from: 'shelf' })).toBe('install')
    expect(readAction({ from: 'upload' })).toBe('installFromOutside')
    expect(readAction({ from: 'url' })).toBe('installFromOutside')
  })

  it("keeps a maintainer who may install only from Agenthix's shelf from reading a link or an upload", () => {
    expect(may(maintainer, readAction({ from: 'shelf' }), admins)).toBe(true)
    expect(may(maintainer, readAction({ from: 'url' }), admins)).toBe(false)
    expect(may(maintainer, readAction({ from: 'upload' }), admins)).toBe(false)
  })

  it('lets a maintainer read from outside once the organisation lets maintainers install from outside, and always an administrator', () => {
    expect(may(maintainer, readAction({ from: 'url' }), both)).toBe(true)
    expect(may(admin, readAction({ from: 'upload' }), admins)).toBe(true)
  })
})
