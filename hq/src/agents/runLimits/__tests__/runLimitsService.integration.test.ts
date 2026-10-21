/**
 * Integration tests (ADR-0094 — real test DB) for the run limits a run gets: the stricter of the
 * organisation's and the project's own, and whether a site is sent them at all. Validation is pure and is
 * in runLimitsService.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { getOrgRunLimits, getProjectRunLimits, runLimitsFor } from '../runLimitsService'

const ORG = { timeLimitMinutes: 60, turnLimit: 100 }

describe('getOrgRunLimits and getProjectRunLimits', () => {
  it('give core\'s defaults while the organisation has none, then what it set', async () => {
    expect(await getOrgRunLimits()).toEqual(ORG)
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 20, runTurnLimit: 50 } })
    expect(await getOrgRunLimits()).toEqual({ timeLimitMinutes: 20, turnLimit: 50 })
  })

  it('shows a project\'s own choice, and no choice for one that made none or does not exist', async () => {
    const chose = await createProject({ runTimeLimitMinutes: 10, runTurnLimit: 5 })
    const none = await createProject()
    expect(await getProjectRunLimits(chose.id)).toEqual({ timeLimitMinutes: 10, turnLimit: 5 })
    expect(await getProjectRunLimits(none.id)).toEqual({ timeLimitMinutes: null, turnLimit: null })
    expect(await getProjectRunLimits('ghost')).toEqual({ timeLimitMinutes: null, turnLimit: null })
  })
})

describe('runLimitsFor', () => {
  it('gives the organisation\'s limits to a project that chose nothing', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const project = await createProject()
    expect(await runLimitsFor({ type: 'project', id: project.id })).toEqual(ORG)
  })

  it('gives core\'s defaults when the organisation row does not exist yet', async () => {
    expect(await runLimitsFor(null)).toEqual(ORG)
  })

  it('applies the stricter of the organisation\'s and the project\'s own', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const project = await createProject({ runTimeLimitMinutes: 10, runTurnLimit: 500 })
    expect(await runLimitsFor({ type: 'project', id: project.id })).toEqual({ timeLimitMinutes: 10, turnLimit: 100 })
  })

  it('lets the organisation tighten below what a project chose, without rewriting the project', async () => {
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 20, runTurnLimit: 50 } })
    const project = await createProject({ runTimeLimitMinutes: 45, runTurnLimit: 80 })

    expect(await runLimitsFor({ type: 'project', id: project.id })).toEqual({ timeLimitMinutes: 20, turnLimit: 50 })

    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ runTimeLimitMinutes: 45, runTurnLimit: 80 })
  })

  it('gives a person\'s own space the organisation\'s limits', async () => {
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 20, runTurnLimit: 50 } })
    expect(await runLimitsFor({ type: 'user', id: 'u1' })).toEqual({ timeLimitMinutes: 20, turnLimit: 50 })
  })
})
