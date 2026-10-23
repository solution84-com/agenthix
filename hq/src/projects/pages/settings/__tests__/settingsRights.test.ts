import { describe, it, expect } from 'vitest'
import { adminsLine, keyProblem, keyState, settingsRights } from '../settingsRights'

const who = (over: Partial<Parameters<typeof settingsRights>[0]> = {}) =>
  settingsRights({ personal: false, isProjectAdmin: false, isOrgAdmin: false, ...over })

describe("who may change a project's Settings @SC-639", () => {
  it('lets a project admin change its own fields but not file it or delete it', () => {
    expect(who({ isProjectAdmin: true })).toEqual({ editOwn: true, editFiling: false, namesAdmins: false, deleteOffer: 'only-org-admin' })
  })

  it('lets an organisation admin who is not a project admin file and delete, and read the rest', () => {
    expect(who({ isOrgAdmin: true })).toEqual({ editOwn: false, editFiling: true, namesAdmins: true, deleteOffer: 'delete' })
  })

  it('gives a member or viewer text only, with the admins named, and nothing about deleting', () => {
    expect(who()).toEqual({ editOwn: false, editFiling: false, namesAdmins: true, deleteOffer: 'none' })
  })

  it('leaves a personal project its own fields, and its owner the delete; an organisation admin gets neither filing nor delete', () => {
    expect(who({ personal: true, isProjectAdmin: true, isOrgAdmin: true })).toEqual({
      editOwn: true, editFiling: false, namesAdmins: false, deleteOffer: 'delete',
    })
    expect(who({ personal: true, isOrgAdmin: true }).deleteOffer).toBe('none')
  })
})

describe('the admins line @SC-639', () => {
  it('names one, two and three admins', () => {
    expect(adminsLine(['Ana'])).toBe("Ana is this project's admin and can change these settings.")
    expect(adminsLine(['Ana', 'Bo'])).toBe("Ana and Bo are this project's admins and can change these settings.")
    expect(adminsLine(['Ana', 'Bo', 'Cy'])).toBe("Ana, Bo and Cy are this project's admins and can change these settings.")
  })
})

describe('the key @SC-639', () => {
  it('is a field before the first task', () => {
    expect(keyState(0, 'WEB')).toEqual({ locked: false })
  })

  it('is fixed text once a task exists, with the reason', () => {
    expect(keyState(1, 'WEB')).toEqual({ locked: true, reason: 'Fixed — its 1 task is numbered WEB-1 onwards' })
    expect(keyState(12, 'WEB')).toEqual({ locked: true, reason: 'Fixed — its 12 tasks are numbered WEB-1 onwards' })
  })

  it('must be 2 to 6 letters', () => {
    expect(keyProblem('W')).not.toBeNull()
    expect(keyProblem('WEB')).toBeNull()
    expect(keyProblem('WEBSITE')).not.toBeNull()
  })
})
