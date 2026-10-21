// @vitest-environment node
/**
 * hq's access check (adr-0071): the only thing that mints a preview ticket,
 * and it mints one only for a signed-in person entitled to a live preview.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { openPreviewFor, openPreview } = await import('../openPreviewAction')

const live = { id: 'row1', status: 'running' }
let rows: Record<string, { id: string; status: string } | undefined>
let entitled: boolean
const mint = vi.fn((_u: string, _p: string) => 'TICKET')

const deps = (domain: string | null = 'preview.example.com') => ({
  domain: () => domain,
  hqUrl: () => 'https://hq.example.com',
  tickets: { mint, redeem: vi.fn() },
  getById: async (id: string) => (rows[id] ?? null) as never,
  canAccess: async () => entitled,
})

async function refusal(p: Promise<unknown>): Promise<{ statusCode: number; message: string }> {
  try {
    await p
  } catch (e) {
    return e as { statusCode: number; message: string }
  }
  throw new Error('expected a refusal')
}

beforeEach(() => {
  rows = { row1: { ...live } }
  entitled = true
  mint.mockClear()
})

describe('openPreview', () => {
  it("mints a ticket for an entitled person and addresses it to the preview's own host", async () => {
    const res = await openPreviewFor({ id: 'u1' }, 'row1', deps())
    expect(mint).toHaveBeenCalledWith('u1', 'row1')
    expect(res.url).toBe('https://p-row1.preview.example.com/__agenthix/enter?ticket=TICKET')
  })

  it('refuses a person who is not entitled, and mints nothing', async () => {
    entitled = false
    expect((await refusal(openPreviewFor({ id: 'u2' }, 'row1', deps()))).statusCode).toBe(403)
    expect(mint).not.toHaveBeenCalled()
  })

  it('refuses an ended preview', async () => {
    rows.row1 = { id: 'row1', status: 'expired' }
    expect((await refusal(openPreviewFor({ id: 'u1' }, 'row1', deps()))).statusCode).toBe(410)
    expect(mint).not.toHaveBeenCalled()
  })

  it('refuses an unknown preview, and anything that is not an id', async () => {
    expect((await refusal(openPreviewFor({ id: 'u1' }, 'nope', deps()))).statusCode).toBe(404)
    expect((await refusal(openPreviewFor({ id: 'u1' }, '../x', deps()))).statusCode).toBe(404)
    expect(mint).not.toHaveBeenCalled()
  })

  it('refuses when previews are off', async () => {
    const err = await refusal(openPreviewFor({ id: 'u1' }, 'row1', deps(null)))
    expect(err.message).toMatch(/Previews are off/)
    expect(mint).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not signed in', async () => {
    expect((await refusal(Promise.resolve().then(() => openPreview({ previewId: 'row1' }, { user: null } as never)))).statusCode).toBe(401)
  })
})
