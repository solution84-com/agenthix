/**
 * The provider store in memory, for the write and health rules' tests. It keeps the encrypted secret as the real one
 * does, so a test can see that nothing the store answers carries it.
 */
import { randomUUID } from 'node:crypto'
import type { AiProviderUse } from '@agenthix/core'
import { decryptStoredSecret } from '../../server/crypto/secretCrypto'
import type { NewProvider, NewRecord, Person, ProviderPatch, ProviderRow, ProviderStore } from '../store'

type Stored = ProviderRow & { secret: string | null }

const rowOf = ({ secret: _secret, ...row }: Stored): ProviderRow => ({ ...row })

export class FakeProviderStore implements ProviderStore {
  readonly rows = new Map<string, Stored>()
  readonly records: NewRecord[] = []
  admins: Person[] = [{ id: 'admin-1', name: 'Sam' }, { id: 'admin-2', name: 'Ana' }]
  uses = new Map<string, AiProviderUse>()

  async list() {
    return [...this.rows.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(rowOf)
  }

  async byId(id: string) {
    const r = this.rows.get(id)
    return r ? rowOf(r) : null
  }

  async create(p: NewProvider) {
    if ([...this.rows.values()].some(r => r.vendor === p.vendor)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    const now = new Date(Date.now() + this.rows.size)
    const row: Stored = { ...p, id: randomUUID(), stateSince: now, failuresInRow: 0, lastFailedAt: null, createdAt: now }
    this.rows.set(row.id, row)
    return rowOf(row)
  }

  async update(id: string, patch: ProviderPatch) {
    const row = this.rows.get(id)
    if (!row) throw new Error('not found')
    Object.assign(row, patch)
    return rowOf(row)
  }

  async remove(id: string) {
    this.rows.delete(id)
  }

  async record(r: NewRecord) {
    this.records.push(r)
  }

  async credentialOf(id: string) {
    const row = this.rows.get(id)
    if (!row) return null
    return { key: row.secret ? decryptStoredSecret(row.secret, 'provider key') : null, baseUrl: row.baseUrl }
  }

  async usesOf(id: string) {
    return this.uses.get(id) ?? { defaults: [], agents: [] }
  }

  async orgAdmins() {
    return this.admins
  }

  secretOf(id: string): string | null {
    return this.rows.get(id)?.secret ?? null
  }
}
