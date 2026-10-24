import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  install: { findUnique: vi.fn(), update: vi.fn() },
  instProject: { deleteMany: vi.fn() },
  instPerson: { deleteMany: vi.fn() },
  project: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { count: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}))
vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(public status: number, m?: string) { super(m) } },
  prisma: { gitHubInstallation: db.install, gitHubInstallationProject: db.instProject, gitHubInstallationPerson: db.instPerson, project: db.project, user: db.user, $transaction: db.$transaction },
}))

import { allowAccount, changeAccountRule, ignoreAccount } from '../accountRules'

beforeEach(() => {
  vi.clearAllMocks()
  db.project.count.mockResolvedValue(0)
  db.user.count.mockResolvedValue(0)
  db.project.findMany.mockResolvedValue([])
  db.install.findUnique.mockResolvedValue({ id: 'i1', state: 'WANTS_TO_CONNECT', accountLogin: 'north-ltd', projectRule: 'CHOSEN_PROJECTS', projects: [], people: [] })
})

describe('allowing and ignoring a new installation @A15', () => {
  it('allow records who, the rule and the chosen places; people none by default', async () => {
    db.project.count.mockResolvedValue(2)
    await allowAccount('i1', 'admin1', { projectRule: 'CHOSEN_PROJECTS', projectIds: ['p1', 'p2', 'p1'] })
    const data = db.install.update.mock.calls[0][0].data
    expect(data).toMatchObject({ state: 'ALLOWED', decidedById: 'admin1', projectRule: 'CHOSEN_PROJECTS' })
    expect(data.projects.create).toEqual([{ projectId: 'p1' }, { projectId: 'p2' }])
    expect(data.people.create).toEqual([])
    expect(db.instPerson.deleteMany).toHaveBeenCalledWith({ where: { installationId: 'i1' } })
  })

  it('every project never adds anyone\'s own storage', async () => {
    await allowAccount('i1', 'admin1', { projectRule: 'EVERY_PROJECT' })
    expect(db.install.update.mock.calls[0][0].data.people.create).toEqual([])
  })

  it('refuses a project or a person that doesn\'t exist, changing nothing', async () => {
    db.project.count.mockResolvedValue(0)
    await expect(allowAccount('i1', 'a', { projectRule: 'CHOSEN_PROJECTS', projectIds: ['gone'] })).rejects.toThrow(/Nothing was changed/)
    db.user.count.mockResolvedValue(0)
    await expect(allowAccount('i1', 'a', { projectRule: 'CHOSEN_PROJECTS', userIds: ['gone'] })).rejects.toThrow(/active member/)
    expect(db.install.update).not.toHaveBeenCalled()
  })

  it('refuses an unknown rule and an unknown account', async () => {
    await expect(allowAccount('i1', 'a', { projectRule: 'ALL' as never })).rejects.toThrow(/Nothing was changed/)
    db.install.findUnique.mockResolvedValue(null)
    await expect(allowAccount('x', 'a', { projectRule: 'EVERY_PROJECT' })).rejects.toThrow(/Nothing was changed/)
  })

  it('ignore marks it ignored and drops it as any project\'s default', async () => {
    db.install.findUnique.mockResolvedValueOnce({ id: 'i1', state: 'ALLOWED', accountLogin: 'x' })
      .mockResolvedValueOnce({ state: 'IGNORED', projectRule: 'EVERY_PROJECT', projects: [], people: [] })
    db.project.findMany.mockResolvedValue([{ id: 'p1', personalOwnerId: null }])
    await ignoreAccount('i1', 'admin1')
    expect(db.install.update.mock.calls[0][0].data).toMatchObject({ state: 'IGNORED', decidedById: 'admin1' })
    expect(db.project.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } }, data: { defaultGitHubInstallationId: null } })
  })
})

describe('changing the rule', () => {
  it('needs the account to be allowed first', async () => {
    await expect(changeAccountRule('i1', 'a', { projectRule: 'EVERY_PROJECT' })).rejects.toThrow(/allow it first/)
  })

  it('narrowing it drops the default of a project it no longer admits, and a personal project is never admitted by every project', async () => {
    db.install.findUnique.mockResolvedValueOnce({ id: 'i1', state: 'ALLOWED', accountLogin: 'x' })
      .mockResolvedValueOnce({ state: 'ALLOWED', projectRule: 'CHOSEN_PROJECTS', projects: [{ projectId: 'p1' }], people: [] })
    db.project.findMany.mockResolvedValue([{ id: 'p1', personalOwnerId: null }, { id: 'p2', personalOwnerId: null }, { id: 'p3', personalOwnerId: 'u9' }])
    db.project.count.mockResolvedValue(1)
    await changeAccountRule('i1', 'a', { projectRule: 'CHOSEN_PROJECTS', projectIds: ['p1'] })
    expect(db.project.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p2', 'p3'] } }, data: { defaultGitHubInstallationId: null } })
  })
})
