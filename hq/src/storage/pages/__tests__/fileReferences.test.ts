/** How the Files tools refer to a file in a message, and how a link to an artefact is read (spec §3, §9). */
import { describe, it, expect } from 'vitest'
import {
  mentionReference, artefactNameFromHref, referenceOf, refOfReference, referenceLabel, placePathOf, stableLinkOf, linkParamsOf,
  readStableLink, toolParamsForHref, splitReferences,
} from '../fileReferences'

describe('mentionReference', () => {
  it('names the file by its folder in the place', () => {
    expect(mentionReference('files', 'specs/pricing-page.md')).toBe('files/specs/pricing-page.md')
    expect(mentionReference('artefacts', 'Pricing options.pdf')).toBe('artefacts/Pricing options.pdf')
    expect(mentionReference('knowledge', 'payments.md')).toBe('knowledge/payments.md')
  })
})

describe('artefactNameFromHref', () => {
  it('reads the link an agent writes: artefacts/<file name>', () => {
    expect(artefactNameFromHref('artefacts/pricing-options.pdf')).toBe('pricing-options.pdf')
    expect(artefactNameFromHref('./artefacts/notes.md')).toBe('notes.md')
  })

  it('decodes a name written as a Markdown link address', () => {
    expect(artefactNameFromHref('artefacts/Pricing%20options.pdf')).toBe('Pricing options.pdf')
  })

  it('leaves every other link alone', () => {
    expect(artefactNameFromHref('https://example.com/artefacts/x.md')).toBeNull()
    expect(artefactNameFromHref('/artefacts/x.md')).toBeNull()
    expect(artefactNameFromHref('artefacts/sub/x.md')).toBeNull()
    expect(artefactNameFromHref('artefacts/')).toBeNull()
    expect(artefactNameFromHref('artefacts/%E0%A4%A')).toBeNull()
    expect(artefactNameFromHref(null)).toBeNull()
  })
})

const owner = { ownerType: 'project', ownerId: 'p1' } as const
const loc = { ...owner, workspaceId: null, taskId: null }

describe('referenceOf and refOfReference @SC-1535', () => {
  it('name a file as the agent sees its place: files/, workspaces/<id>/, artefacts/', () => {
    expect(referenceOf({ space: 'place', loc, path: 'reports/q3.pdf' })).toBe('files/reports/q3.pdf')
    expect(referenceOf({ space: 'place', loc: { ...loc, workspaceId: 'w1' }, path: 'src/app.ts' })).toBe('workspaces/w1/src/app.ts')
    expect(referenceOf({ space: 'place', loc: { ...loc, taskId: 't1' }, path: 'notes.md' })).toBe('tasks/t1/notes.md')
    expect(referenceOf({ space: 'artefact', owner, name: 'draft.md' })).toBe('artefacts/draft.md')
  })

  it('read a reference back in the owner\'s folder', () => {
    expect(refOfReference(owner, ['files', 'reports', 'q3.pdf'])).toEqual({ space: 'place', loc, path: 'reports/q3.pdf' })
    expect(refOfReference(owner, ['workspaces', 'w1', 'src', 'app.ts'])).toEqual({ space: 'place', loc: { ...loc, workspaceId: 'w1' }, path: 'src/app.ts' })
    expect(refOfReference(owner, ['artefacts', 'draft.md'])).toEqual({ space: 'artefact', owner, name: 'draft.md' })
  })

  it('name nothing outside those folders, or a folder alone', () => {
    expect(refOfReference(owner, ['files'])).toBeNull()
    expect(refOfReference(owner, ['workspaces', 'w1'])).toBeNull()
    expect(refOfReference(owner, ['artefacts', 'sub', 'x.md'])).toBeNull()
    expect(refOfReference(owner, ['members', 'u1', 'agenda.md'])).toBeNull()
    expect(refOfReference(owner, ['tasks', 't1', 'notes.md'])).toBeNull()
    expect(refOfReference(owner, ['secrets.env'])).toBeNull()
  })

  it('label a chip by the path after its folder', () => {
    expect(referenceLabel('files/reports/q3.pdf')).toBe('reports/q3.pdf')
    expect(referenceLabel('workspaces/w1/src/app.ts')).toBe('src/app.ts')
    expect(referenceLabel('artefacts/draft.md')).toBe('draft.md')
  })
})

describe('stable links @SC-1536', () => {
  const origin = 'https://hq.example.com'

  it('are the place\'s address with the tool and the file, never a conversation', () => {
    expect(placePathOf('/projects/AGX/t/c1')).toBe('/projects/AGX')
    expect(placePathOf('/chat/t/c1')).toBe('/chat')
    expect(placePathOf('/projects/AGX')).toBe('/projects/AGX')
    expect(stableLinkOf(origin, '/projects/AGX', { tool: 'files', file: 'reports/q3.pdf', dir: null }))
      .toBe('https://hq.example.com/projects/AGX?tool=files&file=reports%2Fq3.pdf')
  })

  it('give each kind of file its parameters', () => {
    expect(linkParamsOf({ space: 'place', loc, path: 'a.md' })).toEqual({ tool: 'files', file: 'a.md' })
    expect(linkParamsOf({ space: 'place', loc: { ...loc, workspaceId: 'w1' }, path: 'a.ts' })).toEqual({ tool: 'workspaces', workspace: 'w1', wfile: 'a.ts' })
    expect(linkParamsOf({ space: 'artefact', owner, name: 'd.md' })).toEqual({ tool: 'artefacts', artefact: 'd.md' })
  })

  it('are read back into their place and reference, from this HQ only', () => {
    expect(readStableLink(`${origin}/projects/AGX?tool=files&file=reports%2Fq3.pdf`, origin)).toEqual({ placePath: '/projects/AGX', reference: 'files/reports/q3.pdf' })
    expect(readStableLink(`${origin}/chat?tool=workspaces&workspace=w1&wfile=src/app.ts`, origin)).toEqual({ placePath: '/chat', reference: 'workspaces/w1/src/app.ts' })
    expect(readStableLink(`${origin}/projects/AGX?tool=artefacts&artefact=d.md`, origin)).toEqual({ placePath: '/projects/AGX', reference: 'artefacts/d.md' })
    expect(readStableLink('https://elsewhere.example/projects/AGX?tool=files&file=a.md', origin)).toBeNull()
    expect(readStableLink(`${origin}/projects/AGX/t/c1?tool=files&file=a.md`, origin)).toBeNull()
    expect(readStableLink(`${origin}/projects/AGX?tool=tasks`, origin)).toBeNull()
  })
})

describe('toolParamsForHref @SC-1536', () => {
  it('opens an agent\'s link to a file in its tool', () => {
    expect(toolParamsForHref('artefacts/d.md')).toEqual({ tool: 'artefacts', artefact: 'd.md' })
    expect(toolParamsForHref('files/reports/q3%20final.pdf')).toEqual({ tool: 'files', file: 'reports/q3 final.pdf' })
    expect(toolParamsForHref('workspaces/w1/src/app.ts')).toEqual({ tool: 'workspaces', workspace: 'w1', wfile: 'src/app.ts' })
  })

  it('leaves every other link alone', () => {
    expect(toolParamsForHref('files/../secrets.env')).toBeNull()
    expect(toolParamsForHref('workspaces/w1')).toBeNull()
    expect(toolParamsForHref('https://example.com/files/a.md')).toBeNull()
    expect(toolParamsForHref(null)).toBeNull()
  })
})

describe('splitReferences @SC-1535', () => {
  it('finds the paths written in a message, without a sentence\'s full stop', () => {
    expect(splitReferences('Check files/reports/q3-data.csv against artefacts/old.md.', null)).toEqual([
      { kind: 'text', text: 'Check ' },
      { kind: 'reference', reference: 'files/reports/q3-data.csv' },
      { kind: 'text', text: ' against ' },
      { kind: 'reference', reference: 'artefacts/old.md' },
      { kind: 'text', text: '.' },
    ])
  })

  it('leaves a path inside another path or a web address, and a folder alone', () => {
    expect(splitReferences('see https://x.example/files/a.md and my/files/b.md and files/', null).every(p => p.kind === 'text')).toBe(true)
  })

  it('finds a stable link of this HQ, and only of this HQ', () => {
    const origin = 'https://hq.example.com'
    const pieces = splitReferences(`Here: ${origin}/chat?tool=files&file=a.md, and https://other.example/chat?tool=files&file=a.md`, origin)
    expect(pieces.filter(p => p.kind === 'link')).toEqual([{ kind: 'link', href: `${origin}/chat?tool=files&file=a.md` }])
  })
})

describe('tasks and their files in text (spec part 3, *Tasks and their files*)', () => {
  it('finds a task, its working files and its attachments as references', () => {
    expect(splitReferences('See tasks/MOP-1, tasks/MOP-1/notes.md and attachments/MOP-1/shot%20one.png.', null)).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'reference', reference: 'tasks/MOP-1' },
      { kind: 'text', text: ', ' },
      { kind: 'reference', reference: 'tasks/MOP-1/notes.md' },
      { kind: 'text', text: ' and ' },
      { kind: 'reference', reference: 'attachments/MOP-1/shot%20one.png' },
      { kind: 'text', text: '.' },
    ])
  })

  it('labels a task by its key and a file by its path in the task', () => {
    expect(referenceLabel('tasks/MOP-1')).toBe('MOP-1')
    expect(referenceLabel('tasks/MOP-1/out/notes.md')).toBe('out/notes.md')
    expect(referenceLabel('attachments/MOP-1/shot.png')).toBe('shot.png')
  })

  it("reads a pasted task link back as the task's reference", () => {
    const origin = 'https://hq.example.com'
    expect(readStableLink(`${origin}/projects/MOP?task=MOP-1&file=notes.md`, origin)).toEqual({ placePath: '/projects/MOP', reference: 'tasks/MOP-1/notes.md' })
    expect(readStableLink(`${origin}/projects/MOP?task=MOP-1`, origin)).toEqual({ placePath: '/projects/MOP', reference: 'tasks/MOP-1' })
    expect(readStableLink(`${origin}/projects/MOP?tool=tasks&task=MOP-1`, origin)).toEqual({ placePath: '/projects/MOP', reference: 'tasks/MOP-1' })
    expect(readStableLink(`${origin}/projects/MOP?task=MOP-1&attachment=a1`, origin)).toBeNull()
  })
})
