/**
 * The harness-home layout (person-scoped execution spec §1): beside storage,
 * never inside it, grouped by person so removing someone removes one folder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CapabilityRunner } from '@agenthix/core'
import {
  HARNESS_HOME_CONTAINER_DIR,
  harnessHomeFor,
  personHarnessHomesRoot,
  personProjectHarnessHome,
  personalHarnessHome,
  projectHarnessHome,
  projectHarnessHomes,
} from '../harnessHomes'
import { AGENT_CONTAINER_CLAUDE_HOME } from '../../agentDiskPaths'
import type { ContainerKey } from '../containerTypes'

let root: string
const saved = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-homes-'))
  process.env.SITE_ROOT = root
})
afterEach(async () => {
  if (saved === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = saved
  await fs.rm(root, { recursive: true, force: true })
})

describe('the layout', () => {
  it('puts every home under homes/, beside storage and never inside it', () => {
    expect(personalHarnessHome('u1')).toBe(`${root}/homes/users/u1/personal`)
    expect(personProjectHarnessHome('u1', 'p1')).toBe(`${root}/homes/users/u1/p1`)
    expect(projectHarnessHome('p1')).toBe(`${root}/homes/projects/p1`)
    expect(personHarnessHomesRoot('u1')).toBe(`${root}/homes/users/u1`)
    for (const home of [personalHarnessHome('u1'), personProjectHarnessHome('u1', 'p1'), projectHarnessHome('p1')]) {
      expect(home.startsWith(`${root}/projects/`)).toBe(false)
      expect(home.startsWith(`${root}/users/`)).toBe(false)
    }
  })

  it("groups everything private to one person under their one folder", () => {
    const mine = personHarnessHomesRoot('u1')
    expect(personalHarnessHome('u1').startsWith(`${mine}/`)).toBe(true)
    expect(personProjectHarnessHome('u1', 'p1').startsWith(`${mine}/`)).toBe(true)
    expect(projectHarnessHome('p1').startsWith(`${mine}/`)).toBe(false)
  })

  it('keys a container\'s home on boundary × runner', () => {
    const inX = (runner: CapabilityRunner): ContainerKey =>
      ({ scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'ro', runner })
    expect(harnessHomeFor(inX({ kind: 'person', userId: 'u1' }))).toBe(personProjectHarnessHome('u1', 'p1'))
    expect(harnessHomeFor(inX({ kind: 'person', userId: 'u2' }))).toBe(personProjectHarnessHome('u2', 'p1'))
    expect(harnessHomeFor(inX({ kind: 'project', projectId: 'p1' }))).toBe(projectHarnessHome('p1'))
    expect(harnessHomeFor({ scope: 'storage', ownerType: 'user', ownerId: 'u1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } }))
      .toBe(personalHarnessHome('u1'))
  })

  it('binds the home at the directory the Claude folder sits in', () => {
    expect(AGENT_CONTAINER_CLAUDE_HOME).toBe(path.posix.join(HARNESS_HOME_CONTAINER_DIR, '.claude'))
  })
})

describe('ids that could leave the tree are refused, not rewritten', () => {
  it.each(['..', '.', '', 'a/b', '../x', 'a..b', '/abs'])('refuses %j', (id) => {
    expect(() => personHarnessHomesRoot(id)).toThrow(/unsafe/)
    expect(() => projectHarnessHome(id)).toThrow(/unsafe/)
    expect(() => personProjectHarnessHome('u1', id)).toThrow(/unsafe/)
  })

  it("refuses a project id that would name the person's own home", () => {
    expect(() => personProjectHarnessHome('u1', 'personal')).toThrow(/unsafe/)
  })

  it("refuses a runner that does not fit its boundary rather than choosing someone's home", () => {
    expect(() => harnessHomeFor({ scope: 'storage', ownerType: 'user', ownerId: 'u1', mode: 'rw', runner: { kind: 'person', userId: 'u2' } }))
      .toThrow(/does not fit/)
    expect(() => harnessHomeFor({ scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p2' } }))
      .toThrow(/does not fit/)
  })
})

describe('projectHarnessHomes', () => {
  it("lists the project's own home and each member's home for it, and nothing else", async () => {
    await fs.mkdir(personProjectHarnessHome('u1', 'p1'), { recursive: true })
    await fs.mkdir(personProjectHarnessHome('u2', 'p1'), { recursive: true })
    await fs.mkdir(personProjectHarnessHome('u2', 'p2'), { recursive: true })
    await fs.mkdir(personalHarnessHome('u3'), { recursive: true })

    const homes = await projectHarnessHomes('p1')

    expect(homes.sort()).toEqual([
      projectHarnessHome('p1'),
      personProjectHarnessHome('u1', 'p1'),
      personProjectHarnessHome('u2', 'p1'),
    ].sort())
  })

  it("lists only the project's own home on a site with no homes yet", async () => {
    expect(await projectHarnessHomes('p1')).toEqual([projectHarnessHome('p1')])
  })

  it('does not follow a symlink a member folder was replaced with', async () => {
    const outside = path.join(root, 'elsewhere')
    await fs.mkdir(outside, { recursive: true })
    await fs.mkdir(personHarnessHomesRoot('u1'), { recursive: true })
    await fs.symlink(outside, personProjectHarnessHome('u1', 'p1'))

    expect(await projectHarnessHomes('p1')).toEqual([projectHarnessHome('p1')])
  })
})
