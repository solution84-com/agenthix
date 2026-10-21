/**
 * A person's model credential goes in the same transaction that marks them
 * erased (adr-0100): a half-done erase would leave an encrypted login with no
 * owner. That the credentials are removed at all is tested against the real
 * database in orgModelAccess.integration.test.ts; this checks only that one
 * transaction carries both, which the real database cannot be made to show
 * without failing an erase part-way.
 */
import { it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  modelCredentialDeleteMany: vi.fn(),
  userUpdate: vi.fn(),
}))

vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../storage/httpErrors', () => ({ rethrowSiteUnreachableAsHttp: (e: unknown) => { throw e } }))
vi.mock('../../storage/storageSite', () => ({ resolveStorageSite: vi.fn(async () => { throw new Error('no storage') }) }))
vi.mock('../../storage/locationFileStore', () => ({ removeLocationOnSite: vi.fn() }))
vi.mock('../../preview/previewRegistry', () => ({ expirePreviewsForSessions: vi.fn(async () => undefined) }))
vi.mock('../../server/identity/requireRole', () => ({ requireRole: vi.fn() }))
vi.mock('wasp/server', () => {
  const deleteMany = { deleteMany: h.deleteMany }
  return {
    HttpError: class HttpError extends Error {
      constructor(public statusCode: number, message?: string) { super(message) }
    },
    prisma: {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'u2', displayName: 'Dana', avatarUrl: null, deactivatedAt: new Date(), erasedAt: null,
          auth: { identities: [{ providerUserId: 'dana' }] },
        })),
        update: h.userUpdate,
      },
      agentSession: { findMany: vi.fn(async () => []), deleteMany: h.deleteMany },
      project: { deleteMany: h.deleteMany, updateMany: h.deleteMany },
      modelCredential: { deleteMany: h.modelCredentialDeleteMany },
      task: deleteMany, board: deleteMany, memoryItem: deleteMany, agentOverride: deleteMany,
      personConnection: deleteMany, cloudAccountLink: deleteMany, cloudSignInAsk: deleteMany, offerDismissal: deleteMany,
      deviceSession: deleteMany, notification: deleteMany, mobileAuthToken: deleteMany, pin: deleteMany,
      boardShowAlso: deleteMany, userStoragePlacement: deleteMany, projectMember: deleteMany, teamPerson: deleteMany,
      userSettings: deleteMany, auth: deleteMany, conversation: deleteMany,
      $transaction: h.transaction,
    },
  }
})

import { erasePerson } from '../../settings/erasePerson'

beforeEach(() => {
  vi.clearAllMocks()
  h.transaction.mockResolvedValue([])
})

it('erasing a person removes their model credential, in the same transaction that marks them erased', async () => {
  await erasePerson({ userId: 'u2', confirm: 'dana' }, { user: { id: 'admin-1' } })
  expect(h.modelCredentialDeleteMany).toHaveBeenCalledWith({ where: { ownerType: 'user', ownerId: 'u2' } })
  expect(h.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u2' }, data: expect.objectContaining({ erasedAt: expect.any(Date) }) }))
  expect(h.transaction).toHaveBeenCalledTimes(1)
})
