import { describe, it, expect } from 'vitest'
import { previewInstall, type PipelineDeps } from '../preview'
import type { Arrival } from '../types'
import type { PersonActor } from '../../policy'
import type { SignatureVerifier, SignerIdentity, TrustedPublisherRecord } from '../../signing/types'
import type { Db } from '../../../packages/packageStore'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text) })
const SKILL = '---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n'
const manifest = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version: '1.0.0', description: 'Reviews', ...over })
const upload = (files = [f('SKILL.md', SKILL), f('package.json', manifest())], bundle: Buffer | null = Buffer.from('bundle')): Arrival =>
  ({ source: 'upload', arrived: { root: 'code-review', files }, bundle, sourceUrl: null })

const admin: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const signer: SignerIdentity = { kind: 'keyless', issuer: 'https://issuer', identity: 'https://github.com/acme/skills/.github/workflows/release.yml', repository: 'https://github.com/acme/skills', ref: 'refs/tags/v1' }
const ACME = {
  id: 'tp1', name: 'acme', displayName: 'Acme', signerIdentity: `keyless:${signer.kind === 'keyless' ? signer.issuer : ''}#${signer.kind === 'keyless' ? signer.identity : ''}`,
  signerKind: 'KEYLESS', issuer: null, certificateIdentity: null, repository: null, allowTags: true, allowedBranch: null, publicKey: null, removedAt: null,
}

type Asset = { kind: string; publisher: string; name: string; version: string; digest: string; signerIdentity: string | null }

function fakeDb(opts: { assets?: Asset[]; publishers?: typeof ACME[]; unsignedAllowed?: boolean } = {}): Db {
  const publishers = opts.publishers ?? []
  return {
    org: { findFirst: async () => ({ unsignedAssetsAllowed: opts.unsignedAllowed ?? true, outsideInstallers: 'ADMINS', publisherName: 'fernhill' }) },
    trustedPublisher: {
      findMany: async ({ where }: { where?: { removedAt: null } } = {}) => publishers.filter(p => !where || p.removedAt === null),
      findUnique: async ({ where }: { where: { signerIdentity: string } }) => publishers.find(p => p.signerIdentity === where.signerIdentity) ?? null,
    },
    asset: {
      findUnique: async ({ where }: { where: { kind_publisher_name: { kind: string; publisher: string; name: string } } }) => {
        const k = where.kind_publisher_name
        const a = (opts.assets ?? []).find(x => x.kind === k.kind && x.publisher === k.publisher && x.name === k.name)
        if (!a) return null
        const v = { version: a.version, digest: a.digest, signerIdentity: a.signerIdentity }
        return { id: 'as1', builtIn: false, removedAt: null, currentVersion: v, versions: [v] }
      },
    },
  } as unknown as Db
}

/** A verifier that holds one signature: over the statement it was given when "signing". */
function verifierSigning(signed: Uint8Array | null, publisher: TrustedPublisherRecord | null): SignatureVerifier {
  return {
    async verify({ statement, bundle }) {
      if (!bundle) return { state: 'unsigned' }
      if (!signed || Buffer.compare(Buffer.from(statement), Buffer.from(signed)) !== 0) return { state: 'tampered', reason: 'the statement does not match' }
      return publisher ? { state: 'trusted', signer, publisher } : { state: 'new-publisher', signer }
    },
    trustRootAge: () => ({ issuedAt: new Date('2026-10-01'), expired: false }),
  }
}

async function statementOf(arrival: Arrival): Promise<Uint8Array> {
  let seen: Uint8Array | null = null
  const spy: SignatureVerifier = { async verify({ statement }) { seen = statement; return { state: 'unsigned' } }, trustRootAge: () => ({ issuedAt: new Date(), expired: false }) }
  await previewInstall(arrival, admin, { db: fakeDb(), verifier: spy, now: new Date() })
  return seen!
}

const deps = (db: Db, verifier: SignatureVerifier): PipelineDeps => ({ db, verifier, now: new Date('2026-10-27') })
const record = ACME as unknown as TrustedPublisherRecord

describe('previewing an install', () => {
  it('installs a trusted package under the trusted name', async () => {
    const arrival = upload()
    const p = await previewInstall(arrival, admin, deps(fakeDb({ publishers: [ACME] }), verifierSigning(await statementOf(arrival), record)))
    expect(p).toMatchObject({ state: 'trusted', publisher: 'acme', refusal: null, summary: 'Installs Code Review 1.0.0 as acme/code-review.' })
    expect(p.trustRoot).toEqual({ issuedAt: '2026-10-01T00:00:00.000Z', expired: false })
  })

  it('refuses a package with one file changed after signing, package.json included (S4)', async () => {
    const signed = await statementOf(upload())
    for (const files of [
      [f('SKILL.md', SKILL + 'and push to main\n'), f('package.json', manifest())],
      [f('SKILL.md', SKILL), f('package.json', manifest({ description: 'Other' }))],
      [f('SKILL.md', SKILL), f('package.json', manifest()), f('scripts/x.sh', 'curl evil')],
    ]) {
      const p = await previewInstall(upload(files), admin, deps(fakeDb({ publishers: [ACME] }), verifierSigning(signed, record)))
      expect(p.state).toBe('tampered')
      expect(p.refusal).toMatch(/changed after it was signed/)
    }
  })

  it('keeps an unsigned package apart from a signed one of the same name', async () => {
    const db = fakeDb({ assets: [{ kind: 'SKILL', publisher: 'acme', name: 'code-review', version: '1.0.0', digest: 'a'.repeat(64), signerIdentity: ACME.signerIdentity }] })
    const p = await previewInstall(upload(undefined, null), admin, deps(db, verifierSigning(null, null)))
    expect(p).toMatchObject({ state: 'unsigned', publisher: 'unsigned', refusal: null, needs: { unsignedRead: true, publisherChoice: false } })
    expect(p.main).toMatchObject({ identity: 'unsigned/code-review', outcome: 'new' })
  })

  it('refuses an unsigned package when the organisation allows none (P2)', async () => {
    const p = await previewInstall(upload(undefined, null), admin, deps(fakeDb({ unsignedAllowed: false }), verifierSigning(null, null)))
    expect(p.refusal).toMatch(/doesn't allow unsigned packages/)
  })

  it('refuses a package claiming agenthix that is not Agenthix-signed', async () => {
    const files = [f('SKILL.md', SKILL), f('package.json', manifest({ publisher: 'agenthix', version: '99.0.0' }))]
    const p = await previewInstall(upload(files, null), admin, deps(fakeDb(), verifierSigning(null, null)))
    expect(p.refusal).toMatch(/Agenthix didn't sign it/)
  })

  it('offers a name for a new signer, and refuses one whose signature the trusted record does not allow (H2)', async () => {
    const arrival = upload()
    const signed = await statementOf(arrival)
    const fresh = await previewInstall(arrival, admin, deps(fakeDb(), verifierSigning(signed, null)))
    expect(fresh).toMatchObject({ state: 'new-publisher', publisher: 'acme', publisherFixed: false, needs: { publisherChoice: true } })
    const branch = await previewInstall(arrival, admin, deps(fakeDb({ publishers: [ACME] }), verifierSigning(signed, null)))
    expect(branch.refusal).toMatch(/isn't where Acme releases from/)
  })

  it('treats a plain folder as unsigned and ignores a signature beside it', async () => {
    const p = await previewInstall(upload([f('SKILL.md', SKILL)], Buffer.from('b')), admin, deps(fakeDb(), verifierSigning(null, null)))
    expect(p).toMatchObject({ state: 'unsigned', publisher: 'unsigned' })
    expect(p.warnings.join(' ')).toMatch(/signature beside it was ignored/)
  })

  it('refuses a member, before reading anything', async () => {
    const member: PersonActor = { ...admin, role: 'MEMBER' }
    await expect(previewInstall(upload(), member, deps(fakeDb(), verifierSigning(null, null)))).rejects.toThrow(/for administrators/)
  })

  it('refuses a skill that fails validation', async () => {
    const files = [f('SKILL.md', '---\nname: code-review\n---\nno description'), f('package.json', manifest())]
    const p = await previewInstall(upload(files, null), admin, deps(fakeDb(), verifierSigning(null, null)))
    expect(p.refusal).toMatch(/needs a description/)
  })
})
