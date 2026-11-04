/** `bundle.make` checks its request before it empties the bundle's folder (F-site-16-05). */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {} } }))
const livePreviewRow = vi.hoisted(() => vi.fn())
vi.mock('../livePreviewStore', () => ({ livePreviewRow, changeLivePreview: vi.fn() }))

const { bundleMake } = await import('../bundles/bundleMethods')
const { bundleDir } = await import('../bundles/bundleStore')

const BUNDLE = '33333333-3333-4333-8333-333333333333'
let root: string
const saved = process.env.SITE_ROOT
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-make-'))
  process.env.SITE_ROOT = root
})
afterEach(() => {
  if (saved === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = saved
  fs.rmSync(root, { recursive: true, force: true })
})

describe('bundle.make refusing a request', () => {
  it('leaves no folder, and keeps a bundle of the same id, when the live preview is unknown', async () => {
    fs.mkdirSync(bundleDir(BUNDLE), { recursive: true })
    fs.writeFileSync(path.join(bundleDir(BUNDLE), 'bundle'), 'kept')
    livePreviewRow.mockResolvedValue(null)
    const answer = await bundleMake({ bundleId: BUNDLE, source: { kind: 'livePreview', livePreviewId: 'lp-1' }, prerequisites: [] })
    expect(answer).toMatchObject({ ok: false })
    expect(fs.readFileSync(path.join(bundleDir(BUNDLE), 'bundle'), 'utf8')).toBe('kept')
  })

  it('makes no folder for a live preview that runs from a branch\'s own copy', async () => {
    livePreviewRow.mockResolvedValue({ id: 'lp-1', copyKind: 'branch' })
    const answer = await bundleMake({ bundleId: BUNDLE, source: { kind: 'livePreview', livePreviewId: 'lp-1' }, prerequisites: [] })
    expect(answer).toMatchObject({ ok: false })
    expect(fs.existsSync(bundleDir(BUNDLE))).toBe(false)
  })
})
