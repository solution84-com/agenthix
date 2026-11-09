import { describe, it, expect, vi } from 'vitest'
import type { SiteFileRef } from '@agenthix/core'
import { taskEmbed } from '../taskEmbed'
import { taskEmbedOpeners } from '../taskEmbedOpen'

const taskLoc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: 't1' }
const placeRef = (loc: Record<string, unknown>, path: string): SiteFileRef =>
  ({ space: 'place', loc: { ...taskLoc, ...loc }, path } as SiteFileRef)

function setup() {
  const open = vi.fn()
  return { open, ...taskEmbedOpeners({ taskId: 't1', taskKey: 'WEB-4', open }) }
}
const from = { kind: 'task', taskKey: 'WEB-4' }

describe('a file named in a task text opens in the file viewer over the task @SC-1557', () => {
  it("opens the task's own working file, named under the task", () => {
    const o = setup()
    o.onOpen(placeRef({}, 'notes/a.md'))
    expect(o.open).toHaveBeenCalledWith({ kind: 'file', ref: placeRef({}, 'notes/a.md'), placePath: '/projects/WEB', taskKey: 'WEB-4', from })
  })

  it("opens the task's own attachment, and another task's, in the viewer", () => {
    const o = setup()
    o.onOpenTaskFile({ taskId: 't1', taskKey: 'WEB-4', loc: null, file: { kind: 'attachment', id: 'a1' } })
    o.onOpenTaskFile({ taskId: 't9', taskKey: 'WEB-9', loc: null, file: { kind: 'attachment', id: 'a2' } })
    expect(o.open).toHaveBeenNthCalledWith(1, { kind: 'attachment', taskId: 't1', taskKey: 'WEB-4', id: 'a1', from })
    expect(o.open).toHaveBeenNthCalledWith(2, { kind: 'attachment', taskId: 't9', taskKey: 'WEB-9', id: 'a2', from })
  })

  it("opens a file of the place's files/ over the task, not in the Files tool (S17)", () => {
    const o = setup()
    const ref = placeRef({ taskId: null }, 'reports/q3.pdf')
    o.onOpen(ref)
    expect(o.open).toHaveBeenCalledWith({ kind: 'file', ref, placePath: '/projects/WEB', from })
  })

  it('opens an artefact over the task', () => {
    const o = setup()
    const ref = { space: 'artefact', owner: { ownerType: 'project', ownerId: 'p1' }, name: 'brief v2.md' } as SiteFileRef
    o.onOpen(ref)
    expect(o.open).toHaveBeenCalledWith({ kind: 'file', ref, placePath: '/projects/WEB', from })
  })

  it("names a file of Your space by the person's space", () => {
    const o = setup()
    o.onOpen(placeRef({ ownerType: 'user', ownerId: 'u1', taskId: null }, 'a.md'))
    expect(o.open.mock.calls[0][0]).toMatchObject({ placePath: '/chat' })
  })

  it("opens a workspace's file itself, not the workspace's README (S23)", () => {
    const o = setup()
    const ref = placeRef({ workspaceId: 'w1', taskId: null }, 'code/invoice.ts')
    o.onOpen(ref)
    expect(o.open).toHaveBeenCalledWith({ kind: 'file', ref, placePath: '/projects/WEB', from })
  })
})

describe('taskEmbed carries the openers @SC-1557', () => {
  it('has them in its context, and none without', () => {
    const o = setup()
    expect(taskEmbed('p1', 't1', { key: 'WEB-4', openers: { onOpen: o.onOpen, onOpenTaskFile: o.onOpenTaskFile } })?.onOpen).toBe(o.onOpen)
    expect(taskEmbed('p1', 't1', { key: 'WEB-4' })?.onOpen).toBeUndefined()
  })

  it("resolves a Your-space task's files/ against its person, given the project's facts", () => {
    const e = taskEmbed('p1', 't1', { key: 'ME-1', personalSpace: true, personalOwnerId: 'u1' })
    expect(e?.place).toMatchObject({ siblings: { ownerType: 'user', ownerId: 'u1' } })
  })
})
