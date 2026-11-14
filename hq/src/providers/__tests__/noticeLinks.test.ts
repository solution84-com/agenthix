/** A provider's notices link to its line on the AI page, or to Your providers once it has gone. */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../store', () => ({
  providerStore: () => ({ usesOf: async () => ({ defaults: ['stt'], agents: [] }) }),
}))
vi.mock('../../notifications/persistent', () => ({ syncPersistentNotifications: async () => undefined }))
vi.mock('../../server/personEvents', () => ({ notificationsChanged: () => undefined }))

import { changeNotice, notWorkingNotice } from '../notices'
import type { ProviderRow } from '../store'

const row = { id: 'p2', name: 'AssemblyAI', vendor: 'assemblyai', state: 'key_refused', stateDetail: 'invalid API key' } as unknown as ProviderRow

describe('where a provider notice links', () => {
  it('opens the line of a provider that is not working, saying what depends on it in the capability words', async () => {
    const n = await notWorkingNotice(row, [row])
    expect(n?.actionUrl).toBe('/admin/ai#provider-p2')
    expect(n?.body).toContain('The default for Hearing uses it.')
    expect(n?.body).toContain('Hearing: nothing else provides it')
  })

  it('opens the line of a provider that changed, and Your providers for one removed', () => {
    const c = { by: 'Sam', byUserId: null, provider: { id: 'p2', name: 'AssemblyAI' }, lines: [] }
    expect(changeNotice({ ...c, action: 'renamed' }).actionUrl).toBe('/admin/ai#provider-p2')
    expect(changeNotice({ ...c, action: 'removed' }).actionUrl).toBe('/admin/ai#providers')
    expect(changeNotice({ ...c, action: 'renamed' }).body).toBe('Recorded on the AI page.')
  })
})
