import { prisma } from './db'

// Entity factories for integration tests (ADR-0035). Each returns the created
// row; required fields are filled with sane defaults, overridable via `opts`.
// `opts` is an untyped passthrough by design — these are test helpers and the
// values are validated by Prisma at insert time, not worth mirroring the
// generated input types here.

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

export function createWorkspace(opts: Record<string, unknown> = {}) {
  return prisma.workspace.create({
    data: {
      name: 'Test Workspace',
      ownerType: 'project',
      ownerId: uniq('owner'),
      siteId: uniq('site'),
      ...opts,
    } as any,
  })
}

export function createRepoAttachment(opts: Record<string, unknown> = {}) {
  return prisma.repoAttachment.create({
    data: {
      ownerType: 'project',
      ownerId: uniq('owner'),
      repoUrl: 'https://github.com/example/repo.git',
      ...opts,
    } as any,
  })
}
