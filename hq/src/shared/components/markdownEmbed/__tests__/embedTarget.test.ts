import { describe, it, expect } from 'vitest'
import { embedKey, resolveEmbedTarget, type MarkdownEmbedContext } from '../embedTarget'

const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null } as const
const inPlace: MarkdownEmbedContext = { place: { space: 'place', loc }, folder: 'reports' }

describe('where an embed points @SC-1555', () => {
  it.each([
    ['charts/q3.png', 'reports/charts/q3.png'],
    ['./charts/q3.png', 'reports/charts/q3.png'],
    ['../images/logo.png', 'images/logo.png'],
    ['/images/logo.png', 'images/logo.png'],
    ['charts/my%20chart.png', 'reports/charts/my chart.png'],
    ['charts/q3.png?raw=1#top', 'reports/charts/q3.png'],
    ['a\\b.png', 'reports/a/b.png'],
  ])('resolves %s against the page\'s folder, in the same place', (src, path) => {
    expect(resolveEmbedTarget(src, inPlace)).toEqual({ kind: 'file', ref: { space: 'place', loc, path }, name: path.split('/').pop() })
  })

  it.each([
    '../../secret.png', '/../secret.png', '%2e%2e/%2e%2e/secret.png', '..%2f..%2fsecret.png', 'a/../../../b.png',
    '..\\..\\secret.png', 'bad%zz.png', 'nul%00.png',
  ])('shows %s, which leaves the place, as outside it with its name', src => {
    expect(resolveEmbedTarget(src, inPlace).kind).toBe('outside')
  })

  it('names the file a path outside the place points at', () => {
    expect(resolveEmbedTarget('../../etc/q3.png', inPlace)).toEqual({ kind: 'outside', name: 'q3.png' })
  })

  it.each([
    ['https://example.org/a.png', 'example.org'],
    ['HTTP://Example.org/a.png', 'example.org'],
    ['//cdn.example.org/a.png', 'cdn.example.org'],
  ])('reads %s as another website', (src, host) => {
    expect(resolveEmbedTarget(src, inPlace)).toMatchObject({ kind: 'web', host })
  })

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'mailto:a@b.c', '#heading', '', '   ', '.', 'reports/..'])(
    'reads %j as nothing a file can be', src => {
      expect(resolveEmbedTarget(src, { ...inPlace, folder: '' }).kind).toBe('none')
    },
  )

  it('resolves in a knowledge page\'s folder and in artefacts, which hold no folders', () => {
    const owner = { ownerType: 'org', ownerId: 'org' } as const
    expect(resolveEmbedTarget('pic.png', { place: { space: 'knowledge', owner }, folder: 'guides' }))
      .toMatchObject({ kind: 'file', ref: { space: 'knowledge', owner, path: 'guides/pic.png' } })
    const artefacts: MarkdownEmbedContext = { place: { space: 'artefact', owner: { ownerType: 'user', ownerId: 'u1' } }, folder: '' }
    expect(resolveEmbedTarget('chart.png', artefacts)).toMatchObject({ kind: 'file', ref: { space: 'artefact', name: 'chart.png' } })
    expect(resolveEmbedTarget('sub/chart.png', artefacts).kind).toBe('outside')
  })

  it('keys the same file the same way however it was written', () => {
    const a = resolveEmbedTarget('charts/q3.png', inPlace)
    const b = resolveEmbedTarget('/reports/./charts/q3.png', inPlace)
    expect(a.kind === 'file' && b.kind === 'file' && embedKey(a.ref) === embedKey(b.ref)).toBe(true)
  })
})

describe("a place's folders are siblings @SC-1555", () => {
  const project = { ownerType: 'project', ownerId: 'p1' } as const
  const files = (path: string, workspaceId: string | null = null) =>
    ({ space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId, taskId: null }, path })
  const page: MarkdownEmbedContext = { place: { space: 'knowledge', owner: project, siblings: project }, folder: 'guides' }
  const task: MarkdownEmbedContext = {
    place: { space: 'place', loc: { ...loc, taskId: 't1' }, siblings: project, task: { id: 't1', key: 'AGX-7' } }, folder: '',
  }

  it.each([
    ['files/e2e-files/charts/q3.png', files('e2e-files/charts/q3.png')],
    ['./files/charts/q3.png', files('charts/q3.png')],
    ['files/charts/../q3.png', files('q3.png')],
    ['workspaces/w1/out/a.png', files('out/a.png', 'w1')],
    ['artefacts/chart.png', { space: 'artefact', owner: project, name: 'chart.png' }],
  ])('reads %s in a project\'s knowledge page as that file of the project', (src, ref) => {
    expect(resolveEmbedTarget(src, page)).toMatchObject({ kind: 'file', ref })
    expect(resolveEmbedTarget(src, task)).toMatchObject({ kind: 'file', ref })
  })

  it('reads any other path against the page\'s folder, as before', () => {
    expect(resolveEmbedTarget('pic.png', page)).toMatchObject({ kind: 'file', ref: { space: 'knowledge', path: 'guides/pic.png' } })
    expect(resolveEmbedTarget('../files/pic.png', page)).toMatchObject({ kind: 'file', ref: { space: 'knowledge', path: 'files/pic.png' } })
    expect(resolveEmbedTarget('/files/pic.png', page)).toMatchObject({ kind: 'file', ref: { space: 'knowledge', path: 'files/pic.png' } })
    expect(resolveEmbedTarget('notes/a.png', task)).toMatchObject({ kind: 'file', ref: { space: 'place', loc: { taskId: 't1' }, path: 'notes/a.png' } })
  })

  it.each([
    'files/../artefacts/chart.png', 'files/../../secret.png', 'workspaces/w1/../w2/a.png', 'workspaces/../files/a.png',
    'artefacts/../files/a.png', 'artefacts/sub/chart.png', 'files', 'workspaces/w1', 'files/%2e%2e/workspaces/w1/a.png',
  ])('never lets %s step from one root into another', src => {
    expect(resolveEmbedTarget(src, page).kind).toBe('outside')
  })

  it("gives the organisation's knowledge no siblings: its own paths only", () => {
    const org: MarkdownEmbedContext = { place: { space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' } }, folder: '' }
    expect(resolveEmbedTarget('files/q3.png', org)).toMatchObject({ kind: 'file', ref: { space: 'knowledge', path: 'files/q3.png' } })
    expect(resolveEmbedTarget('attachments/AGX-7/a.png', org)).toMatchObject({ kind: 'file', ref: { space: 'knowledge' } })
  })

  it("reads attachments/<its key>/<file> in a task's text as its own attachment, by key or id", () => {
    const attachment = { kind: 'attachment', taskId: 't1', name: 'shot 1.png', ref: { kind: 'attachment', task: 'AGX-7', name: 'shot 1.png' } }
    expect(resolveEmbedTarget('attachments/AGX-7/shot%201.png', task)).toMatchObject(attachment)
    const id = '0b9a3c1e-7d2f-4e8a-9b1c-2d3e4f5a6b7c'
    const byId: MarkdownEmbedContext = { ...task, place: { space: 'place', loc, siblings: project, task: { id, key: 'AGX-7' } } }
    expect(resolveEmbedTarget(`attachments/${id}/a.png`, byId)).toMatchObject({ kind: 'attachment', taskId: id, name: 'a.png' })
  })

  it.each([
    'attachments/AGX-8/a.png', 'attachments/agx-7/a.png', 'attachments/AGX-7/sub/a.png', 'attachments/AGX-7/../AGX-8/a.png',
    'attachments/AGX-7', 'attachments/../files/a.png',
  ])("reaches no other task's attachment: %s is outside", src => {
    expect(resolveEmbedTarget(src, task).kind).toBe('outside')
  })

  it("leaves attachments/… to the page's folder where the text is no task's", () => {
    expect(resolveEmbedTarget('attachments/AGX-7/a.png', page)).toMatchObject({ kind: 'file', ref: { space: 'knowledge', path: 'guides/attachments/AGX-7/a.png' } })
  })
})
