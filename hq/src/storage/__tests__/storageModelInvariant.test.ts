/**
 * Storage model surface invariants (ADR-0039)
 *
 * These tests verify permanence and cleanup guarantees at the module / schema level:
 *   SC-252 — ownership is permanent; no promote / owner-flip operation exists on any
 *             action, query, or MCP-tool surface.
 *   SC-253 — the wiki is gone: no wikiMirrorService module, no wikiNode or
 *             productSshKey in the generated Prisma model registry, and no
 *             Product.wikiRepoUrl field in the schema.
 *   SC-254 — no isDefault field on Workspace. hq no longer has a Workspace model
 *             at all (plan 5c task 14), so this is vacuously true here — the
 *             `?? {}` fallback below means it stays true even once hq's generated
 *             client drops `WorkspaceScalarFieldEnum` entirely. The live assertion
 *             belongs to site's own equivalent invariant test, against its
 *             Workspace model.
 *   SC-255 — legacy Project.repoUrl, Product.wikiRepoUrl, and SSH-key models do
 *             NOT appear in hq's schema. "The Workspace / RepoAttachment models
 *             exist" now means site's, not hq's — hq's schema.prisma text is
 *             asserted to have neither, and site's own harness
 *             (site/src/server/storage/__tests__/models.integration.test.ts)
 *             already covers their presence there.
 *
 * Workspace/RepoAttachment stopped being hq Prisma models in plan 5c task 14.
 * The absence checks below read hq/schema.prisma's own TEXT rather than the
 * generated `Prisma.ModelName` registry: hq's generated Prisma client (under
 * node_modules/.prisma/client) is produced by a Wasp compile, which does not
 * run as part of this change (schema-file edit + tests only — the DB migration
 * itself is a separate, deliberately-deferred step). Reading the client here
 * would silently keep testing the OLD, still-generated shape until some later,
 * unrelated `wasp start`/`wasp build` happens to regenerate it — the schema
 * text is what actually changed and is what these tests need to observe now.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const hqSchemaText = readFileSync(join(__dirname, '../../../schema.prisma'), 'utf8')

// Minimal stubs so the storage action/query modules are importable without a
// running database. The tests only inspect module export names, not call them.
vi.mock('wasp/server', () => ({
  prisma: {},
  HttpError: class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  },
}))
vi.mock('node:fs/promises', () => ({ default: { mkdir: vi.fn(), readdir: vi.fn() } }))
vi.mock('../repoAttachmentService', () => ({
  connectRepo: vi.fn(), disconnectRepo: vi.fn(),
  getRepoState: vi.fn(), getAttachment: vi.fn(), getRepoFor: vi.fn(),
}))
vi.mock('../workspaceService', () => ({
  createWorkspace: vi.fn(), deleteWorkspace: vi.fn(),
}))
// actions.ts/queries.ts now also import the channel-backed store (plan 5c
// task 12) — stub it too so importing them for their export names alone
// (this file never calls them) doesn't require a live site connection.
vi.mock('../workspaceStore', () => ({
  getWorkspace: vi.fn(), setWorkspaceAllowedTools: vi.fn(), listAllWorkspaces: vi.fn(), listAllRepos: vi.fn(),
  SiteUnreachableError: class SiteUnreachableError extends Error {},
}))
vi.mock('../ownerSite', () => ({ resolveOwnerSiteId: vi.fn() }))
vi.mock('../../sites/localSite', () => ({ resolveDefaultSiteRef: vi.fn(), requireDefaultExecutionSiteId: vi.fn() }))
vi.mock('../../server/providerService', () => ({ getLlmApiKey: vi.fn() }))
vi.mock('../repoWorkStore', () => ({ connectRepoOnSite: vi.fn(), repoStateOnSite: vi.fn() }))
vi.mock('../github', () => ({
  createGitHubRepo: vi.fn(), generateAndRegisterKey: vi.fn(), revokeGitHubKey: vi.fn(),
  toRepoSlug: (s: string) => s.toLowerCase(),
}))
vi.mock('../gitGrantService', () => ({ grantRepoAccess: vi.fn(), getRepoKeyPath: vi.fn() }))
vi.mock('node:path', () => ({
  default: { join: (...a: string[]) => a.join('/'), isAbsolute: () => false },
  join: (...a: string[]) => a.join('/'),
  isAbsolute: () => false,
}))

// ── SC-252: No promote / owner-flip operation exists ──────────────────────────
describe('ownership is permanent — no promote / owner-flip surface @SC-252', () => {
  it('storage/actions has no promoteWorkspace or updateOwner export', async () => {
    const mod = await import('../actions')
    const keys = Object.keys(mod)
    const ownership = keys.filter(k =>
      /promote|ownerFlip|flipOwner|transferOwner|changeOwner|updateOwner/i.test(k)
    )
    expect(ownership).toHaveLength(0)
  })

  it('no updateWorkspaceAction exists on the action surface', async () => {
    const mod = await import('../actions')
    expect('updateWorkspaceAction' in mod).toBe(false)
    expect('updateWorkspaceOwner' in mod).toBe(false)
  })

  it('storage/queries has no owner-flip operation', async () => {
    const mod = await import('../queries')
    const keys = Object.keys(mod)
    const ownership = keys.filter(k =>
      /promote|ownerFlip|flipOwner|transferOwner|changeOwner|updateOwner/i.test(k)
    )
    expect(ownership).toHaveLength(0)
  })
})

// ── SC-253: The wiki is gone ───────────────────────────────────────────────────
describe('wiki is removed — no wiki service or legacy wiki models @SC-253', () => {
  it('Prisma.ModelName has no WikiNode model', async () => {
    const { Prisma } = await import('@prisma/client')
    const modelNames = Object.keys(Prisma.ModelName)
    expect(modelNames.map(n => n.toLowerCase())).not.toContain('wikinode')
  })

  it('Prisma.ModelName has no ProductSshKey model', async () => {
    const { Prisma } = await import('@prisma/client')
    const modelNames = Object.keys(Prisma.ModelName)
    expect(modelNames.map(n => n.toLowerCase())).not.toContain('productsshkey')
  })

  it('Prisma Product type has no wikiRepoUrl scalar field', async () => {
    const { Prisma } = await import('@prisma/client')
    const productFields = Object.values(Prisma.ProductScalarFieldEnum ?? {}) as string[]
    expect(productFields).not.toContain('wikiRepoUrl')
  })

  it('no wikiMirrorService module is importable from the storage tree', async () => {
    // Dynamic import should reject because the file does not exist.
    // The path is built at runtime so tsc does not try to statically resolve it.
    const modPath: string = '../wikiMirrorService'
    const result = await (import(/* @vite-ignore */ modPath)).then(
      () => 'RESOLVED',
      () => 'REJECTED',
    )
    expect(result).toBe('REJECTED')
  })
})

// ── SC-254: No isDefault / no default Workspace ────────────────────────────────
describe('no default Workspace — isDefault field absent from the schema @SC-254', () => {
  it("site's Workspace model does not declare isDefault", () => {
    // hq has no Workspace model at all now (plan 5c task 14); the model — and
    // with it SC-254's "no default workspace" invariant — lives in site's
    // schema. Asserted against the schema text for the same reason SC-255 is
    // below: generated clients only refresh on a compile.
    const siteSchemaText = readFileSync(
      join(__dirname, '../../../../site/schema.prisma'),
      'utf8',
    )
    const workspaceBlock = siteSchemaText.match(/^model Workspace \{[\s\S]*?^\}/m)?.[0]
    expect(workspaceBlock).toBeTruthy()
    expect(workspaceBlock).not.toContain('isDefault')
  })
})

// ── SC-255: legacy models absent; Workspace/RepoAttachment absent from hq ─────
describe('Workspace and RepoAttachment absent from hq; legacy repo/SSH models absent @SC-255', () => {
  // hq's generated Prisma client only regenerates on a Wasp compile, which is
  // not part of this change (schema-file edit only — the migration itself is
  // separate and deliberately deferred). Reading hq/schema.prisma's own text
  // is what actually observes today's schema; site's own harness
  // (site/src/server/storage/__tests__/models.integration.test.ts) covers
  // that Workspace/RepoAttachment now exist and are reachable there.
  it('hq/schema.prisma has no Workspace model', () => {
    expect(hqSchemaText).not.toMatch(/^model Workspace \{/m)
  })

  it('hq/schema.prisma has no RepoAttachment model', () => {
    expect(hqSchemaText).not.toMatch(/^model RepoAttachment \{/m)
  })

  it('Project ScalarFieldEnum has no repoUrl field (legacy field removed)', async () => {
    const { Prisma } = await import('@prisma/client')
    const fields = Object.values(Prisma.ProjectScalarFieldEnum ?? {}) as string[]
    expect(fields).not.toContain('repoUrl')
  })

  it('Product ScalarFieldEnum has no wikiRepoUrl field', async () => {
    const { Prisma } = await import('@prisma/client')
    const fields = Object.values(Prisma.ProductScalarFieldEnum ?? {}) as string[]
    expect(fields).not.toContain('wikiRepoUrl')
  })

  it('Prisma.ModelName has no ProductSshKey model', async () => {
    const { Prisma } = await import('@prisma/client')
    expect(Object.keys(Prisma.ModelName).map(n => n.toLowerCase())).not.toContain('productsshkey')
  })
})
