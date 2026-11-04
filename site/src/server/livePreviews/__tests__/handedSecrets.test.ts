/**
 * Secrets in a live preview's app container (live preview spec section 4, *Secrets*; adr-0171): handed only by a
 * workflow run aimed at a live preview this site holds running on the run's workspace, into the app's container alone,
 * on the helper's standard input, never a command line; the values minted for a run never; and every line of its
 * apps the site sends on masked from then on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LIVE_PREVIEW_SECRETS_DIR, type AppStatus } from '@agenthix/core'
import { material } from '../../../executor/masking/__tests__/material'

const rows = vi.hoisted(() => ({ value: new Map<string, unknown>() }))
vi.mock('../livePreviewStore', () => ({ livePreviewRow: async (id: string) => rows.value.get(id) ?? null }))
vi.mock('#db', () => ({ prisma: {} }))

import { handOffDeps, HandOffFailed, handSecrets, secretsToHand } from '../secrets/handedSecrets'
import { forgetPreviewMask, maskAppStatus, maskPreviewText, previewMask, resetPreviewMasksForTests } from '../secrets/previewMasks'
import { SECRETS_SCRIPT, SECRETS_TMPFS } from '../secrets/secretsFolder'
import { livePreviewRunTarget } from '../secrets/runTarget'
import { siteMadeExec } from '../guard/events'
import { buildTemplate } from '../container/template'
import { helperExecArgs } from '../container/exec'
import { siteExecGoing } from '../livePreviewActivity'

const KEY = 'sk_test_51Hq8canaryvalue0042'
const DB = 'postgres://app:hunter2-canary@db:5432/app'
const b64 = (s: string) => Buffer.from(s).toString('base64')
const MATERIAL = material({ STRIPE_KEY: KEY, DATABASE_URL: DB })

type Exec = { id: string; argv: string[]; stdin: Buffer }
let execs: Exec[]
const realExec = handOffDeps.exec

beforeEach(() => {
  resetPreviewMasksForTests()
  rows.value.clear()
  execs = []
  handOffDeps.exec = async (id, argv, stdin) => {
    expect(siteExecGoing(id)).toBe(true)
    execs.push({ id, argv, stdin: Buffer.from(stdin) })
    return { exitCode: 0, stdout: 'handed\n' }
  }
})
afterEach(() => { handOffDeps.exec = realExec })

withFeature('livePreview', () => {
  describe('what a run hands over @SC-1746', () => {
    it('is every secret its steps name, and never a value minted for the run', () => {
      const got = secretsToHand([{ secrets: {} }, { secrets: { STRIPE_KEY: b64(KEY), GITHUB_TOKEN: b64('ghs_minted') } }, { secrets: { DATABASE_URL: b64(DB) } }])
      expect(Object.keys(got).sort()).toEqual(['DATABASE_URL', 'STRIPE_KEY'])
      expect(got.STRIPE_KEY!.toString()).toBe(KEY)
    })
  })

  describe('handing secrets to the app\'s container @SC-1746', () => {
    it('runs the fixed script in that container, with the values on its standard input only', async () => {
      await handSecrets('lp-1', { STRIPE_KEY: Buffer.from(KEY), DATABASE_URL: Buffer.from(DB) }, MATERIAL)
      expect(execs).toHaveLength(1)
      const { id, argv, stdin } = execs[0]!
      expect(id).toBe('lp-1')
      expect(argv).toEqual(['sh', '-c', SECRETS_SCRIPT, 'live-preview-secrets'])
      expect(argv.join(' ')).not.toContain(KEY)
      expect(stdin.toString('latin1')).toContain(`secrets`)
      expect(stdin.toString('latin1')).toContain('STRIPE_KEY')
      expect(stdin.includes(Buffer.from(KEY))).toBe(true)
      expect(siteExecGoing('lp-1')).toBe(false)
    })

    it('fails, without quoting a value, when the container does not take them', async () => {
      handOffDeps.exec = async () => ({ exitCode: 1, stdout: '' })
      const err = await handSecrets('lp-1', { STRIPE_KEY: Buffer.from(KEY) }, MATERIAL).catch(e => e)
      expect(err).toBeInstanceOf(HandOffFailed)
      expect(String(err.message)).not.toContain(KEY)
    })

    it('refuses more than the folder holds, before anything runs in the container', async () => {
      const err = await handSecrets('lp-1', { BIG: Buffer.alloc(8 * 1024 * 1024) }, MATERIAL).catch(e => e)
      expect(err).toBeInstanceOf(HandOffFailed)
      expect(execs).toEqual([])
    })

    it('is a site exec the guard knows, as the image\'s user, never a command run as root', () => {
      expect(siteMadeExec(`sh -c ${SECRETS_SCRIPT} live-preview-secrets`)).toBe(true)
      const args = helperExecArgs('c'.repeat(64), ['sh', '-c', SECRETS_SCRIPT, 'live-preview-secrets'], true)
      expect(args.slice(0, 5)).toEqual(['exec', '-i', '-u', '1001:1001', '-w'])
    })

    it('goes into a memory-backed folder of the app\'s container alone, beside the copy, never into it', () => {
      const budget = { memoryBytes: 2 ** 31, cpus: 2, pids: 1024, diskBytes: 2 ** 30, imageBytes: 2 ** 33, logBytes: 2 ** 25 }
      const t = buildTemplate({ id: 'lp-1', workspaceId: 'w1', personId: 'p1', projectId: 'pr1' },
        { hostDir: '/site/projects/pr1/clones/c1', containerDir: '/projects/pr1/clones/c1' }, budget, `sha256:${'a'.repeat(64)}`)
      expect(t.tmpfs[LIVE_PREVIEW_SECRETS_DIR]).toBe(SECRETS_TMPFS)
      expect(SECRETS_TMPFS).toMatch(/noexec/)
      expect(t.mounts.map(m => m.target)).not.toContain(LIVE_PREVIEW_SECRETS_DIR)
      expect(LIVE_PREVIEW_SECRETS_DIR.startsWith('/projects/')).toBe(false)
    })
  })

  describe('the output of a live preview that holds secrets @SC-1746', () => {
    const app = (lastLines: string[]): AppStatus => ({
      appId: 'a1', name: 'web', folder: '', command: 'npm run dev', port: 3000, livePreviewId: 'lp-1', state: 'running',
      since: new Date().toISOString(), lastLines, detail: null,
    })

    it('goes out as it is while none were handed', async () => {
      expect(await maskPreviewText('lp-1', `key ${KEY}`)).toBe(`key ${KEY}`)
    })

    it('is masked once they were, in its apps\' lines and an install\'s report', async () => {
      await handSecrets('lp-1', { STRIPE_KEY: Buffer.from(KEY) }, MATERIAL)
      const masked = await maskAppStatus(app(['ready', `connecting to ${DB}`, `stripe ${KEY}`]))
      expect(masked.lastLines.join('\n')).not.toContain(KEY)
      expect(masked.lastLines.join('\n')).not.toContain('hunter2-canary')
      expect(masked.lastLines[0]).toBe('ready')
      expect(await maskPreviewText('lp-1', `npm printed ${KEY}`)).not.toContain(KEY)
      expect(await maskPreviewText('lp-2', `other ${KEY}`)).toContain(KEY)
    })

    it('adds a later hand-off to the mask: a value handed before stays masked (F-site-17-04)', async () => {
      await handSecrets('lp-1', { STRIPE_KEY: Buffer.from(KEY) }, material({ STRIPE_KEY: KEY }))
      await handSecrets('lp-1', { DATABASE_URL: Buffer.from(DB) }, material({ DATABASE_URL: DB }))
      const masked = await maskPreviewText('lp-1', `old ${KEY} and ${DB}`)
      expect(masked).not.toContain(KEY)
      expect(masked).not.toContain(DB)
    })

    it('stays masked for lines taken before the live preview stopped', async () => {
      await handSecrets('lp-1', { STRIPE_KEY: Buffer.from(KEY) }, MATERIAL)
      const mask = previewMask('lp-1')
      forgetPreviewMask('lp-1')
      expect((await maskAppStatus(app([KEY]), mask)).lastLines.join('\n')).not.toContain(KEY)
    })
  })

  describe('where a run aimed at a live preview works @SC-1746', () => {
    let copy: string
    const ws = { ownerType: 'project' as const, ownerId: 'proj-1', workspaceId: 'ws-1' }
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'lp-1', ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1', copyKind: 'branch', copyId: 'c1',
      state: { state: 'running', since: '' }, containersRemoved: false, ...over,
    })
    beforeEach(async () => {
      process.env.SITE_ROOT = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'lp-target-')))
      copy = path.join(process.env.SITE_ROOT, 'projects', 'proj-1', 'clones', 'c1')
      await fs.mkdir(copy, { recursive: true })
    })

    it('is the live preview\'s copy, when this site holds it running on the run\'s workspace', async () => {
      rows.value.set('lp-1', row())
      expect(await livePreviewRunTarget({ livePreview: { livePreviewId: 'lp-1' }, workspace: ws }))
        .toEqual({
          livePreviewId: 'lp-1', hostDir: copy, containerDir: '/projects/proj-1/clones/c1',
          root: { base: path.join(process.env.SITE_ROOT!, 'projects', 'proj-1'), rel: 'clones/c1' },
        })
    })

    it('is nowhere for a live preview this site does not hold, a stopped or paused one, or another workspace\'s', async () => {
      const aimed = { livePreview: { livePreviewId: 'lp-1' }, workspace: ws }
      expect(await livePreviewRunTarget(aimed)).toBeNull()
      rows.value.set('lp-1', row({ state: { state: 'stopped', since: '', reason: 'person', signal: null, detail: '' } }))
      expect(await livePreviewRunTarget(aimed)).toBeNull()
      rows.value.set('lp-1', row({ state: { state: 'paused', since: '', reason: 'guard', signal: null, detail: '' } }))
      expect(await livePreviewRunTarget(aimed)).toBeNull()
      rows.value.set('lp-1', row({ workspaceId: 'ws-2' }))
      expect(await livePreviewRunTarget(aimed)).toBeNull()
      rows.value.set('lp-1', row({ ownerId: 'proj-2' }))
      expect(await livePreviewRunTarget(aimed)).toBeNull()
      rows.value.set('lp-1', row())
      expect(await livePreviewRunTarget({ ...aimed, workspace: { ...ws, workspaceId: null } })).toBeNull()
    })
  })
})
