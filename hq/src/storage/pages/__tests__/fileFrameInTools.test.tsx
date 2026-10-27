// @vitest-environment jsdom
/** A file opened in the Files tool, through HQ's open action and ui's frame (spec part 2, *The frame*). */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import {
  setAddress, data, ok, NOW_ISO, opened, readyAnswer, relayServing, DOWNLOAD,
} from './filesToolsTestKit'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, Search: icon, ChevronDown: icon, MoreHorizontal: icon, Plus: icon }
})

vi.mock('react-router', async () => {
  const react = await import('react')
  const { address } = await import('./filesToolsTestKit')
  return {
    useSearchParams: () => {
      const [, tick] = react.useReducer((n: number) => n + 1, 0)
      react.useEffect(() => { address.listeners.add(tick); return () => { address.listeners.delete(tick) } }, [])
      const set = (change: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
        address.params = typeof change === 'function' ? change(address.params) : change
        address.listeners.forEach(l => l())
      }
      return [address.params, set]
    },
  }
})
vi.mock('../filesToolData', async () => (await import('./filesToolsTestKit')).data)
vi.mock('wasp/client/operations', async () => (await import('./filesToolsTestKit')).opened)
vi.mock('../BackupLine', () => ({ BackupLine: () => <div data-testid="backup" />, repoName: (u: string) => u.replace('https://github.com/', '') }))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))

import { FilesTool } from '../FilesTool'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const loc = { ...owner, workspaceId: null, taskId: null }
const ROADMAP = '# Roadmap\n\n- Pricing page'

beforeEach(() => {
  vi.clearAllMocks()
  setAddress('tool=files')
  data.useFolder.mockReturnValue(ok([]))
  opened.openFile.mockResolvedValue(readyAnswer('ROADMAP.md', 'markdown', ROADMAP.length))
  relayServing(ROADMAP)
})

const files = [{ name: 'ROADMAP.md', size: 2048, modifiedAt: NOW_ISO(0) }, { name: 'specs', isDir: true, modifiedAt: NOW_ISO(3) }]

describe('a file opened in the Files tool @SC-1533', () => {
  it('downloads through the relay, and puts Copy link, Copy path and Open full screen under ⋯', async () => {
    setAddress('tool=files&file=ROADMAP.md')
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    expect((await screen.findByRole('link', { name: 'Download' })).getAttribute('href')).toBe(DOWNLOAD)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Copy link', 'Copy path', 'Open full screen'])
  })

  it('Copy link copies the file\'s stable link: the place\'s address with the tool and the file, never a ticket', async () => {
    setAddress('tool=files&file=specs/pricing.md&conversation=c1')
    data.useFolder.mockReturnValue(ok(files))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<FilesTool owner={owner} />)
    await screen.findByRole('link', { name: 'Download' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' })) })
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${window.location.pathname}?tool=files&file=specs%2Fpricing.md`)
  })

  it('opens full screen with the same frame, without opening the file again, and Close puts it back', async () => {
    setAddress('tool=files&file=ROADMAP.md')
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    await screen.findByRole('heading', { name: 'Roadmap' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'ROADMAP.md' })
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy()
    expect(dialog.contains(screen.getByRole('heading', { name: 'Roadmap' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opened.openFile).toHaveBeenCalledTimes(1)
  })

  it('words a state from the open answer, and Try again opens it afresh', async () => {
    setAddress('tool=files&file=ROADMAP.md')
    opened.openFile.mockResolvedValueOnce({ state: 'relay-unavailable', siteName: 'office-server', relayName: 'relay-2' })
    render(<FilesTool owner={owner} />)
    expect(await screen.findByText("Files on office-server can't be opened right now: relay-2 isn't answering.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy()
    expect(opened.openFile).toHaveBeenCalledTimes(2)
  })

  it('says what HQ said when it refuses to open the file, with Try again', async () => {
    setAddress('tool=files&file=ROADMAP.md')
    opened.openFile.mockRejectedValueOnce(new Error('HQ is moving to a new machine, so it only shows what it has.'))
    render(<FilesTool owner={owner} />)
    expect((await screen.findByRole('alert')).textContent).toContain('HQ is moving to a new machine')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy()
  })

  it('draws a Markdown file\'s relative image from its own folder in the place, opened with the other embeds', async () => {
    const page = '# Pricing\n\n![Q3](charts/q3.png)\n'
    setAddress('tool=files&file=specs/pricing.md')
    opened.openFile.mockResolvedValue(readyAnswer('pricing.md', 'markdown', page.length))
    opened.openFiles.mockResolvedValue({ answers: [readyAnswer('q3.png', 'image', 2048, 'image/png')] })
    relayServing(page)
    render(<FilesTool owner={owner} />)
    await screen.findByRole('heading', { name: 'Pricing' })
    await waitFor(() => expect(opened.openFiles).toHaveBeenCalledWith({ files: [{ space: 'place', loc, path: 'specs/charts/q3.png' }] }))
  })

  it('Mention puts the file into the message box beside it @SC-1543', () => {
    setAddress('tool=files&file=specs/pricing.md')
    data.useFolder.mockReturnValue(ok(files))
    const taken: string[] = []
    const listener = (e: Event) => { e.preventDefault(); taken.push((e as CustomEvent<string>).detail) }
    window.addEventListener('agenthix:mention', listener)
    render(<FilesTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mention' }))
    window.removeEventListener('agenthix:mention', listener)
    expect(taken).toEqual(['files/specs/pricing.md'])
  })

  it('with no message box beside it, Mention copies the reference instead of doing nothing @SC-1543', async () => {
    setAddress('tool=files&file=ROADMAP.md')
    data.useFolder.mockReturnValue(ok(files))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<FilesTool owner={owner} />)
    await screen.findByRole('heading', { name: 'Roadmap' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mention' })) })
    expect(writeText).toHaveBeenCalledWith('files/ROADMAP.md')
    expect(screen.getByText(/Copied files\/ROADMAP.md/)).toBeTruthy()
  })
})
