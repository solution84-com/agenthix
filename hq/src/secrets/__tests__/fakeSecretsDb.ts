/** An in-memory `SecretsDb` for the store's rules; `db.integration.test.ts` covers the database itself. */
import type {
  ApprovedVersion, DueRotation, NewSecret, Replacement, SecretMeta, SecretRecordRow, SecretsDb, VariableChangeRow, VariableRow,
} from '../db'
import type { Place } from '../place'

type StoredSecret = SecretMeta & { place: Place; ciphertext: Buffer }
type StoredVariable = VariableRow & { place: Place }

const key = (p: Place) => `${p.type}:${p.id}`
const meta = ({ place: _p, ciphertext: _c, ...m }: StoredSecret): SecretMeta => ({ ...m })

export class FakeSecretsDb implements SecretsDb {
  secretRows: StoredSecret[] = []
  recordRows: Array<SecretRecordRow & { place: Place }> = []
  variableRows: StoredVariable[] = []
  changeRows: Array<VariableChangeRow & { place: Place }> = []
  versions = new Map<string, ApprovedVersion[]>()
  private n = 0

  approve(place: Place, v: ApprovedVersion) {
    this.versions.set(key(place), [...(this.versions.get(key(place)) ?? []), v])
  }

  private of<T extends { place: Place }>(rows: T[], place: Place) {
    return rows.filter(r => key(r.place) === key(place))
  }

  async secretByName(place: Place, name: string) {
    const r = this.of(this.secretRows, place).find(s => s.name === name)
    return r ? meta(r) : null
  }
  async secrets(place: Place) { return this.of(this.secretRows, place).map(meta).sort((a, b) => a.name.localeCompare(b.name)) }
  async secretNames(place: Place) { return (await this.secrets(place)).map(s => s.name) }
  async createSecret(place: Place, s: NewSecret, record: SecretRecordRow) {
    if (await this.secretByName(place, s.name)) return false
    const now = new Date()
    this.secretRows.push({ ...s, place, createdAt: now, replacedAt: now, replacedById: null, ciphertext: Buffer.from(s.ciphertext) })
    this.recordRows.push({ ...record, place })
    return true
  }
  async replaceSecret(id: string, r: Replacement, record: SecretRecordRow) {
    const row = this.secretRows.find(s => s.id === id)!
    Object.assign(row, { kind: r.kind, ciphertext: Buffer.from(r.ciphertext), replacedById: r.replacedById, replacedAt: record.at, rotateBy: r.rotateBy })
    this.recordRows.push({ ...record, place: row.place })
  }
  async describeSecret(id: string, d: Pick<SecretMeta, 'description' | 'issuer' | 'renewAt' | 'rotateBy'>) {
    Object.assign(this.secretRows.find(s => s.id === id)!, d)
  }
  async deleteSecret(id: string, record: SecretRecordRow) {
    const row = this.secretRows.find(s => s.id === id)!
    this.secretRows = this.secretRows.filter(s => s.id !== id)
    for (const r of this.recordRows) if (r.secretId === id) r.secretId = null
    this.recordRows.push({ ...record, place: row.place })
  }
  async sealed(place: Place, names: string[]) {
    return this.of(this.secretRows, place).filter(s => names.includes(s.name)).map(s => ({ id: s.id, name: s.name, ciphertext: s.ciphertext }))
  }
  async addRecords(place: Place, records: SecretRecordRow[]) { this.recordRows.push(...records.map(r => ({ ...r, place }))) }
  async records(place: Place, name: string) {
    return this.of(this.recordRows, place).filter(r => r.secretName === name).reverse().map(({ place: _p, ...r }) => r)
  }

  async variableByName(place: Place, name: string) {
    const r = this.of(this.variableRows, place).find(v => v.name === name)
    if (!r) return null
    const { place: _p, ...v } = r
    return v
  }
  async variables(place: Place) {
    return this.of(this.variableRows, place).map(({ place: _p, ...v }) => v).sort((a, b) => a.name.localeCompare(b.name))
  }
  async createVariable(place: Place, name: string, value: string, byUserId: string) {
    if (await this.variableByName(place, name)) return false
    const now = new Date()
    this.variableRows.push({ id: `v${++this.n}`, name, value, createdById: byUserId, updatedById: null, createdAt: now, updatedAt: now, place })
    this.changeRows.push({ name, action: 'SET', oldValue: null, newValue: value, byUserId, at: now, place })
    return true
  }
  async updateVariable(place: Place, v: VariableRow, value: string, byUserId: string) {
    Object.assign(this.variableRows.find(r => r.id === v.id)!, { value, updatedById: byUserId, updatedAt: new Date() })
    this.changeRows.push({ name: v.name, action: 'CHANGED', oldValue: v.value, newValue: value, byUserId, at: new Date(), place })
  }
  async deleteVariable(place: Place, v: VariableRow, byUserId: string) {
    this.variableRows = this.variableRows.filter(r => r.id !== v.id)
    this.changeRows.push({ name: v.name, action: 'DELETED', oldValue: v.value, newValue: null, byUserId, at: new Date(), place })
  }
  async variableChanges(place: Place, name: string) {
    return this.of(this.changeRows, place).filter(c => c.name === name).reverse().map(({ place: _p, ...c }) => c)
  }

  async approvedVersions(place: Place) { return this.versions.get(key(place)) ?? [] }
  async dueRotations(before: Date): Promise<DueRotation[]> {
    return this.secretRows.filter(s => s.rotateBy && s.rotateBy <= before)
      .map(s => ({ id: s.id, name: s.name, rotateBy: s.rotateBy!, place: s.place }))
  }
}
