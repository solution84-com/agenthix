// @vitest-environment jsdom
/** A skill's page is its files, one header line above them, and its versions from the breadcrumb (board *A skill's page*). */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { AssetPageView } from '../pageTypes'

const b64 = (t: string) => btoa(t)
const SKILL = '---\nname: release-notes\ndescription: Write release notes.\n---\n# release-notes\n\nCollect merged changes.\n'
const h = vi.hoisted(() => ({
  set: vi.fn(async () => []),
  exportOne: vi.fn(),
  builtIns: [{ assetId: 'a1', identity: 'agenthix/working-with-git', title: 'working-with-git', description: 'How to work in a git repository.', version: '1.0.0', on: true, repositoryOnly: true }],
}))
let holders = { everyAgent: false, agents: [{ id: 'w', name: 'Writer' }, { id: 'r', name: 'Reviewer' }] }
const versions = {
  versions: [
    { id: 'v2', version: '1.1.0', inUse: true, newer: false, withdrawn: null, source: 'MADE_HERE', note: 'Group by area', byId: 'u1', createdAt: '2026-11-05T12:00:00Z' },
    { id: 'v1', version: '1.0.0', inUse: false, newer: false, withdrawn: null, source: 'MADE_HERE', note: 'First version', byId: 'u1', createdAt: '2026-11-04T12:00:00Z' },
  ],
  history: [],
}

vi.mock('wasp/client/operations', () => {
  const op = (name: string) => ({ name })
  return {
    getAssetHolders: op('holders'), getAssetVersions: op('versions'), getAssetContent: op('content'), getAssetDiff: op('diff'),
    getAssetCredit: op('credit'), getAssetNews: op('news'), exportLibraryItem: op('export'), switchToOriginalAsset: op('x'),
    getBuiltInSkills: op('builtins'), setBuiltInSkillSwitch: op('switch'),
    setAssetEveryAgent: op('x'), addAssetToAgents: op('x'), removeAssetFromAgent: op('x'), acceptAssetUpdate: op('x'), rollBackAsset: op('x'),
    addAssetCredit: op('x'), switchToOwnCopy: op('x'), dismissAssetNews: op('x'), skipAssetUpdate: op('x'),
    previewAssetInstall: op('x'), installAssetVersionOnPurpose: op('x'), editLibraryAsset: op('x'), removeLibraryAsset: op('x'), getRemoveReach: op('x'),
    useAction: (a: { name: string }) => (a.name === 'switch' ? h.set : vi.fn()),
    useQuery: (q: { name: string }, args: { versionId?: string }) => {
      if (q.name === 'holders') return { data: holders, refetch: vi.fn() }
      if (q.name === 'builtins') return { data: h.builtIns, refetch: vi.fn() }
      if (q.name === 'versions') return { data: versions, refetch: vi.fn() }
      if (q.name === 'content') return { data: { version: args?.versionId ? '1.0.0' : '1.1.0', files: [{ path: 'SKILL.md', size: 10, kind: 'markdown', contentType: 'text/markdown' }, { path: 'scripts/format.py', size: 5, kind: 'code', contentType: 'text/x-python' }], opened: { path: 'SKILL.md', base64: b64(SKILL) } } }
      if (q.name === 'diff') return { data: { from: null, to: '1.0.0', files: [{ path: 'SKILL.md', status: 'added', before: null, after: SKILL, binary: false }] } }
      return { data: undefined, refetch: vi.fn() }
    },
  }
})

vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../../library/components/useLibraryTransfer', () => ({ useLibraryTransfer: () => ({ dialog: null, exportOne: h.exportOne }) }))

import { SkillPage } from '../skill/SkillPage'

const page: AssetPageView = {
  assetId: 'a1', kind: 'skill', title: 'release-notes', description: 'Write release notes.', identity: 'fernhill/release-notes', version: '1.1.0',
  builtIn: false, switchedOff: false, own: true, orgPublisher: 'fernhill', unsigned: false, signedBy: 'Made here', source: 'Made in the editor', sourceUrl: null,
  installedBy: 'Ada', installedAt: '2026-11-04T12:00:00Z', update: null, draftBy: null, setAsideFor: null, original: null, copies: [],
  can: { edit: true, update: true, grant: true, remove: true, switch: false }, names: { u1: 'Ada' }, maintainers: [], agents: [], agentAvatars: {}, carries: null, madeFrom: null, holds: null, lastUsed: null,
}

const at = (address: string, shown: AssetPageView = page) => render(
  <MemoryRouter initialEntries={[address]}>
    <Routes><Route path="/library/:assetId" element={<SkillPage page={shown} onChanged={vi.fn()} />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => { h.set.mockClear(); holders = { everyAgent: false, agents: [{ id: 'w', name: 'Writer' }, { id: 'r', name: 'Reviewer' }] } })
afterEach(cleanup)

describe("a skill's page @SC-1632", () => {
  it('is one header line: the version, who uses it, About, Edit and ⋯, then its files with SKILL.md read as a page', () => {
    at('/library/a1')
    expect(screen.getByTestId('version-crumb').textContent).toBe('1.1.0 · in use')
    expect(screen.getByTestId('used-by').getAttribute('aria-label')).toBe('Used by 2 agents')
    expect(screen.getByRole('button', { name: 'About' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByTestId('skill-md-card').textContent).toContain('Write release notes.')
    expect(screen.getAllByTestId('tree-file').map(b => b.textContent)).toEqual(['format.py', 'SKILL.md'])
    expect(screen.queryByTestId('asset-versions')).toBeNull()
  })

  it('says first when no agent uses it', () => {
    holders = { everyAgent: false, agents: [] }
    at('/library/a1')
    expect(screen.getByTestId('used-by').getAttribute('aria-label')).toBe('No agent uses it')
    expect(within(screen.getByTestId('used-by')).getByRole('img', { name: 'No agent uses it' })).toBeTruthy()
  })

  it('opens who uses it from the header, with Remove, Add an agent and Every agent instead', () => {
    at('/library/a1')
    fireEvent.click(screen.getByRole('button', { name: 'Used by 2 agents' }))
    expect(screen.getByRole('button', { name: 'Remove from Writer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Every agent instead' })).toBeTruthy()
  })

  it('lists its versions from the breadcrumb, and an older one is read-only with its changes marked and the way back', () => {
    at('/library/a1')
    fireEvent.click(screen.getByRole('button', { name: 'Version: 1.1.0 · in use' }))
    const rows = screen.getAllByTestId('skill-version').map(r => r.textContent)
    expect(rows[0]).toContain('published by Ada · Nov 5 · “Group by area”')
    expect(screen.getByRole('button', { name: 'Install another version…' })).toBeTruthy()
    cleanup()
    at('/library/a1?version=v1')
    expect(screen.queryByTestId('older-version')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to the version in use' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Return to this version…' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.getByTestId('changed-file').textContent).toContain('new in 1.0.0, the first version · read-only')
    expect(screen.getByLabelText('Only changed · 1', { exact: false })).toBeTruthy()
  })

  it('asks before returning to an older version, under that one name', () => {
    at('/library/a1?version=v1')
    fireEvent.click(screen.getByRole('button', { name: 'Return to this version…' }))
    expect(screen.getByRole('heading', { name: 'Return release-notes to 1.0.0?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Return to 1.0.0' })).toBeTruthy()
  })

  it('on a phone: who uses it first, then the files full width, and a file opens on its own screen (board *On a phone*)', () => {
    const wide = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    try {
      at('/library/a1')
      expect(screen.getByTestId('used-by').textContent).toContain('Used by 2 agents')
      expect(screen.queryByTestId('skill-md-card')).toBeNull()
      fireEvent.click(screen.getAllByTestId('tree-file').find(b => b.textContent === 'SKILL.md')!)
      expect(screen.getByRole('button', { name: 'Back to the files' })).toBeTruthy()
      expect(screen.getByTestId('skill-md-card')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'More about release-notes' }))
      expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual([
        'About',
        expect.stringMatching(/^Download SKILL\.md/),
        expect.stringMatching(/^Download the skill/),
        'Edit',
        expect.stringMatching(/^Remove…/),
      ])
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: wide })
    }
  })

  it('has one Read / Source in the file header, and no Download there', () => {
    at('/library/a1')
    expect(screen.getAllByRole('tab', { name: 'Source' })).toHaveLength(1)
    expect(screen.getAllByRole('tab', { name: 'Read' })).toHaveLength(1)
    expect(screen.getAllByRole('tablist')).toHaveLength(1)
    expect(screen.queryByText(/text\/markdown/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'SKILL.md' }).getAttribute('title')).toMatch(/^text\/markdown · \d+ bytes · \d+ lines$/)
  })

  it('does not repeat the description beside the version', () => {
    at('/library/a1')
    expect(screen.queryByTitle('Write release notes.')).toBeNull()
    expect(screen.getAllByText('Write release notes.')).toHaveLength(1)
  })
})

describe('who uses it, as avatars (owner’s area 8 walk, finding 4) @SC-1632', () => {
  it('draws up to two agents, then +N', () => {
    holders = { everyAgent: false, agents: ['A', 'B', 'C', 'D'].map(n => ({ id: n, name: n })) }
    at('/library/a1')
    expect(screen.getByTestId('used-by').getAttribute('aria-label')).toBe('Used by 4 agents')
    expect(within(screen.getByTestId('used-by')).getByText('+2')).toBeTruthy()
  })

  it('is one group avatar for every agent, and its menu says so and offers Choose agents instead', () => {
    holders = { everyAgent: true, agents: [{ id: 'w', name: 'Writer' }] }
    at('/library/a1')
    expect(within(screen.getByTestId('used-by')).getByRole('img', { name: 'Every agent uses it' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('used-by'))
    expect(screen.getByText('Every agent uses release-notes')).toBeTruthy()
    expect(screen.getByText('Every agent in the organisation, and each new one.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose agents instead' })).toBeTruthy()
  })

  it('opens its menu at the body above the docked conversation, not inside the page', () => {
    at('/library/a1')
    fireEvent.click(screen.getByTestId('used-by'))
    const menu = screen.getByTestId('anchored-menu')
    expect(menu.parentElement).toBe(document.body)
    expect(menu.className).toMatch(/\bfixed\b/)
    expect(menu.className).toMatch(/\bz-50\b/)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('anchored-menu')).toBeNull()
  })
})

describe('a built-in skill (owner’s area 8 walk, findings 2 to 4) @SC-1632', () => {
  const builtIn: AssetPageView = { ...page, builtIn: true, own: false, signedBy: 'Signed by Agenthix', can: { edit: false, update: false, grant: false, remove: false, switch: true } }

  it('has no band, no Edit, and the group avatar with its menu and switch for an administrator', async () => {
    at('/library/a1', builtIn)
    expect(screen.queryByText(/Built in to HQ\. It is on/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.getByRole('button', { name: 'About' })).toBeTruthy()
    expect(within(screen.getByTestId('used-by')).getByRole('img', { name: 'Every agent uses it' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('used-by'))
    expect(screen.getByText('Every agent uses release-notes')).toBeTruthy()
    expect(screen.getByText('Built in to HQ: it is on for every agent or for none.')).toBeTruthy()
    expect(screen.queryByText(/git repository/)).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'On for every agent' }))
    await waitFor(() => expect(h.set).toHaveBeenCalledWith({ assetId: 'a1', on: false }))
  })

  it('shows a member the state without the switch', () => {
    at('/library/a1', { ...builtIn, can: { ...builtIn.can, switch: false } })
    fireEvent.click(screen.getByTestId('used-by'))
    const greyed = screen.getByRole('switch', { name: 'On for every agent' })
    expect(greyed.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(greyed)
    expect(screen.getByTestId('attention-text').textContent).toBe('Switching it is for administrators.')
  })

  it('is the group avatar struck through, and said as switched off, when it is off', () => {
    h.builtIns = [{ ...h.builtIns[0]!, on: false }]
    try {
      at('/library/a1', { ...builtIn, switchedOff: true })
      expect(screen.getByTestId('used-by').getAttribute('aria-label')).toBe('Switched off')
      expect(within(screen.getByTestId('used-by')).getByRole('img', { name: 'Switched off: no agent uses it' })).toBeTruthy()
    } finally {
      h.builtIns = [{ ...h.builtIns[0]!, on: true }]
    }
  })

  it('on a phone: shows the stack and words as the row under the title', () => {
    const wide = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    try {
      at('/library/a1', builtIn)
      expect(screen.getByTestId('used-by').textContent).toContain('Used by every agent')
      expect(within(screen.getByTestId('used-by')).getByRole('img', { name: 'Every agent uses it' })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: wide })
    }
  })
})

describe('downloads live in ⋯ (owner’s area 8 re-walk, finding 6) @SC-1632', () => {
  const builtIn: AssetPageView = { ...page, builtIn: true, own: false, signedBy: 'Signed by Agenthix', can: { edit: false, update: false, grant: true, remove: false, switch: true } }
  const items = () => screen.getAllByRole('menuitem')

  it('holds the file shown and the whole skill on a built-in, and no Remove', () => {
    at('/library/a1', builtIn)
    fireEvent.click(screen.getByRole('button', { name: 'More about release-notes' }))
    const names = items().map(i => i.textContent)
    expect(names).toEqual([expect.stringMatching(/^Download SKILL\.md/), expect.stringMatching(/^Download the skill/)])
    expect(names[0]).toMatch(/The file shown · \d+ bytes · \d+ lines$/)
    expect(names[1]).toContain('Every file, as a package another HQ can install')
    h.exportOne.mockClear()
    fireEvent.click(items()[1]!)
    expect(h.exportOne).toHaveBeenCalledWith('skill', 'a1')
  })

  it('holds Remove… below them on another skill', () => {
    at('/library/a1')
    fireEvent.click(screen.getByRole('button', { name: 'More about release-notes' }))
    expect(items().map(i => i.textContent)).toEqual([expect.stringMatching(/^Download SKILL\.md/), expect.stringMatching(/^Download the skill/), expect.stringMatching(/^Remove…/)])
  })

  it('greys the whole-skill download for who is not an administrator, with why in its tooltip', () => {
    at('/library/a1', { ...builtIn, can: { ...builtIn.can, grant: false } })
    fireEvent.click(screen.getByRole('button', { name: 'More about release-notes' }))
    const whole = items()[1] as HTMLButtonElement
    expect(whole.disabled).toBe(true)
    expect(whole.title).toBe('Downloading a skill as a package is for administrators.')
    expect((items()[0] as HTMLButtonElement).disabled).toBe(false)
  })

  it('has the file’s download but not the package’s on an older version', () => {
    at('/library/a1?version=v1')
    fireEvent.click(screen.getByRole('button', { name: 'More about release-notes' }))
    expect(items().map(i => i.textContent)).toEqual([expect.stringMatching(/^Download SKILL\.md/)])
  })
})

describe('the Name and Description card (finding 7) @SC-1632', () => {
  it('is a card with the name as a code chip and the description as text, one row each', () => {
    at('/library/a1')
    const card = screen.getByTestId('skill-md-card')
    expect(card.querySelector('table')).toBeNull()
    expect(within(card).getAllByRole('term').map(t => t.textContent)).toEqual(['Name', 'Description'])
    expect(card.querySelector('code')?.textContent).toBe('release-notes')
    expect(within(card).getByText('Write release notes.').tagName).toBe('DD')
  })
})

describe('a failure opens a dialog, never a line in the page (finding 9) @SC-1632', () => {
  it('opens the built-in switch’s refusal in the centre with Try again, outside the menu it came from', async () => {
    const builtIn: AssetPageView = { ...page, builtIn: true, own: false, can: { edit: false, update: false, grant: true, remove: false, switch: true } }
    h.set.mockRejectedValueOnce(new Error('Only administrators switch it. Nothing was changed.'))
    at('/library/a1', builtIn)
    fireEvent.click(screen.getByTestId('used-by'))
    fireEvent.click(screen.getByRole('switch', { name: 'On for every agent' }))
    const dialog = await screen.findByRole('dialog', { name: 'The switch did not change' })
    expect(dialog.textContent).toContain('Only administrators switch it. Nothing was changed.')
    expect(screen.queryByTestId('refused-action')).toBeNull()
    fireEvent.mouseDown(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(h.set).toHaveBeenCalledTimes(2))
  })
})
