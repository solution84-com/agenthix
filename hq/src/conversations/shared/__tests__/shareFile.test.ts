/**
 * Keeping a photo or file added to a conversation: only for someone who speaks in it and may work in its place, its
 * kind read from its bytes, its name cleaned, written only through the site's shared-folder write.
 */
import { describe, it, expect, vi } from 'vitest'
import { LocationFileError, SHARED_FILE_MAX_BYTES, type LocationRef } from '@agenthix/core'

vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(readonly statusCode: number, message?: string) { super(message) } },
}))
vi.mock('../../../storage/workspaceStore', () => ({ SiteUnreachableError: class extends Error {} }))

import { shareConversationFileWith, type ShareFileDeps } from '../shareFile'

const loc: LocationRef = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const url = (b: Buffer, type = 'image/png') => `data:${type};base64,${b.toString('base64')}`

function deps(over: Partial<ShareFileDeps> = {}) {
  const writes: { loc: LocationRef; name: string; size: number }[] = []
  const d: ShareFileDeps = {
    placeFor: vi.fn(async () => loc),
    mayWork: vi.fn(async () => {}),
    write: vi.fn(async (l, name, bytes) => { writes.push({ loc: l, name, size: bytes.length }); return name }),
    ...over,
  }
  return { d, writes }
}

describe('keeping a shared photo or file', () => {
  it('writes it into the conversation\'s own place under a clean name, and answers what was kept', async () => {
    const { d, writes } = deps()
    const kept = await shareConversationFileWith({ conversationId: 'c1', name: '../../Screen Shot.png', dataUrl: url(PNG) }, 'u1', d)
    expect(kept).toEqual({ name: 'Screen Shot.png', kind: 'image', mime: 'image/png', size: PNG.length })
    expect(writes).toEqual([{ loc, name: 'Screen Shot.png', size: PNG.length }])
    expect(d.placeFor).toHaveBeenCalledWith('c1', 'u1')
    expect(d.mayWork).toHaveBeenCalledWith(loc, 'u1')
  })

  it('reads what it is from its bytes, not its name or the type sent: a PNG named .jpg is kept as .png', async () => {
    const { d } = deps()
    const kept = await shareConversationFileWith({ conversationId: 'c1', name: 'photo.jpg', dataUrl: url(PNG, 'image/jpeg') }, 'u1', d)
    expect(kept).toMatchObject({ name: 'photo.jpg.png', mime: 'image/png' })
  })

  it('refuses a program named as a picture, writing nothing', async () => {
    const { d, writes } = deps()
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])
    await expect(shareConversationFileWith({ conversationId: 'c1', name: 'cat.png', dataUrl: url(elf) }, 'u1', d))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/"cat\.png" is none of these.*Nothing was changed\.$/) })
    expect(writes).toEqual([])
  })

  it('refuses a file over the limit, an empty one and one that is not a data URL, writing nothing', async () => {
    const { d, writes } = deps()
    const big = Buffer.alloc(SHARED_FILE_MAX_BYTES + 1, 0x41)
    for (const dataUrl of [url(big, 'text/plain'), 'data:text/plain;base64,', 'https://example.com/x.png', 42]) {
      await expect(shareConversationFileWith({ conversationId: 'c1', name: 'a.txt', dataUrl: dataUrl as string }, 'u1', d)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(writes).toEqual([])
  })

  it('writes nothing for someone who may not speak there or may not work in the place', async () => {
    const refused = Object.assign(new Error('no'), { statusCode: 409 })
    for (const over of [{ placeFor: vi.fn(async () => { throw refused }) }, { mayWork: vi.fn(async () => { throw refused }) }]) {
      const { d, writes } = deps(over)
      await expect(shareConversationFileWith({ conversationId: 'c1', name: 'a.png', dataUrl: url(PNG) }, 'u1', d)).rejects.toBe(refused)
      expect(writes).toEqual([])
    }
  })

  it('says what to do when the site refuses because something stands in the way', async () => {
    const { d } = deps({ write: vi.fn(async () => { throw new LocationFileError('refused', 'a link') }) })
    await expect(shareConversationFileWith({ conversationId: 'c1', name: 'a.png', dataUrl: url(PNG) }, 'u1', d))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Look at the place's files\. "a\.png" wasn't added\. Nothing was changed\.$/) })
  })
})
