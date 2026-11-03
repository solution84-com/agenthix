import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import type { SiteLivePreviewsView } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { LivePreviewsSection, readSettingForm } from '../pages/site/LivePreviewsSection'
import { idleWords } from '../pages/site/livePreviewsWords'
import type { FleetHost } from '../pages/dashboard/types'
import { fakeServer } from './fakeServer'

const FP = 'a'.repeat(64)
const NOW = new Date('2026-11-01T10:00:00.000Z')
const GIB = 1024 ** 3
const host = { fingerprint: FP, machineName: 'preview-box', figures: { resources: { memory: { usedBytes: 9 * GIB, totalBytes: 32 * GIB } } } } as unknown as FleetHost
const view = (over: Partial<SiteLivePreviewsView> = {}): SiteLivePreviewsView => ({
  executionSiteId: 'es-office', allowed: true, limit: 6, idleMinutes: 120, problems: [],
  capacity: { open: 2, limit: 6, memoryPercent: 41, cpuPercent: 12 },
  livePreviews: [
    { livePreviewId: 'lp1', projectName: 'Fernhill Shop', workspaceName: 'shop-app', branch: 'login-page', person: { id: 'u1', name: 'Mia Chen' }, state: 'running', openedAt: '2026-11-01T09:00:00.000Z', lastUsedAt: '2026-11-01T09:55:00.000Z' },
    { livePreviewId: 'lp2', projectName: 'Fernhill Shop', workspaceName: 'docs', branch: 'main', person: { id: 'u2', name: 'Kai Ito' }, state: 'paused', openedAt: '2026-10-31T09:00:00.000Z', lastUsedAt: '2026-10-31T09:00:00.000Z' },
  ],
  ...over,
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear() })

const GET = `GET /sites/${FP}/live-previews`
const PUT = `PUT /sites/${FP}/live-previews`
const show = () => render(<LivePreviewsSection host={host} now={NOW} />)

withFeature('livePreview', () => {
  describe('Live previews on a site @SC-1755', () => {
    it('shows the setting, the capacity against the machine, and the live previews open with whose, which branch and when last used', async () => {
      fakeServer({ [GET]: { status: 200, body: { view: view() } } })
      show()
      const section = await screen.findByRole('region', { name: 'Live previews on this site' })
      expect(within(section).getByText('6 at once')).toBeTruthy()
      expect(within(section).getByText('2 hours')).toBeTruthy()
      expect(screen.getByText('2 of 6 open')).toBeTruthy()
      expect(screen.getByText("41% of the machine's memory (32 GB)")).toBeTruthy()
      expect(screen.getByText("12% of the machine's processors")).toBeTruthy()
      const list = screen.getByRole('list', { name: 'Live previews open' })
      expect(within(list).getByText('Mia Chen')).toBeTruthy()
      expect(within(list).getByText('login-page')).toBeTruthy()
      expect(within(list).getByText('Paused')).toBeTruthy()
      expect(screen.queryByText('Busy')).toBeNull()
    })

    it('marks the site busy past 80% of its memory, and shows why live previews cannot start', async () => {
      fakeServer({ [GET]: { status: 200, body: { view: view({ capacity: { open: 2, limit: 6, memoryPercent: 85, cpuPercent: 40 }, problems: ["preview-box's guard hasn't reported in the last minute."] }) } } })
      show()
      expect(await screen.findByText('Busy')).toBeTruthy()
      expect(screen.getByText('This site is busy.')).toBeTruthy()
      expect(screen.getByText(/guard hasn't reported/)).toBeTruthy()
    })

    it('changes the limit and the idle stop, and rejects what is out of range without asking', async () => {
      const asked = fakeServer({ [GET]: { status: 200, body: { view: view() } }, [PUT]: { status: 200, body: { view: view({ limit: null, idleMinutes: 30 }), stopped: [] } } })
      show()
      fireEvent.click(await screen.findByRole('button', { name: 'Change limits…' }))
      fireEvent.change(screen.getByLabelText('Live previews at once'), { target: { value: '99' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText(/a whole number from 1 to 64, or empty for none\. Nothing was changed\./)).toBeTruthy()
      expect(asked.filter(r => r.method === 'PUT')).toEqual([])
      fireEvent.change(screen.getByLabelText('Live previews at once'), { target: { value: '' } })
      fireEvent.change(screen.getByLabelText('Stop when unused for (minutes)'), { target: { value: '30' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(asked.find(r => r.method === 'PUT')?.body).toEqual({ allowed: true, limit: null, idleMinutes: 30 }))
    })

    it('turning live previews off lists the ones it stops and asks first', async () => {
      const asked = fakeServer({ [GET]: { status: 200, body: { view: view() } }, [PUT]: { status: 200, body: { view: view({ allowed: false, livePreviews: [] }), stopped: ['lp1', 'lp2'] } } })
      show()
      fireEvent.click(await screen.findByRole('button', { name: 'Turn live previews off…' }))
      expect(await screen.findByText(/stops all 2 live previews open on this site/)).toBeTruthy()
      expect(screen.getByText(/Mia Chen · Fernhill Shop › shop-app · login-page/)).toBeTruthy()
      expect(asked.filter(r => r.method === 'PUT')).toEqual([])
      fireEvent.click(screen.getByRole('button', { name: 'Turn off and stop them' }))
      await waitFor(() => expect(asked.find(r => r.method === 'PUT')?.body).toEqual({ allowed: false, limit: 6, idleMinutes: 120, stopAll: true }))
    })

    it('turns live previews on with one press', async () => {
      const asked = fakeServer({ [GET]: { status: 200, body: { view: view({ allowed: false, livePreviews: [] }) } }, [PUT]: { status: 200, body: { view: view(), stopped: [] } } })
      show()
      fireEvent.click(await screen.findByRole('button', { name: 'Turn live previews on' }))
      await waitFor(() => expect(asked.find(r => r.method === 'PUT')?.body).toEqual({ allowed: true, limit: 6, idleMinutes: 120 }))
    })

    it('stops one live preview after a confirmation', async () => {
      const asked = fakeServer({ [GET]: { status: 200, body: { view: view() } }, [`DELETE /sites/${FP}/live-previews/lp1`]: { status: 200, body: { stopped: true } } })
      show()
      const row = await screen.findByRole('listitem', { name: 'Mia Chen, shop-app · login-page' })
      fireEvent.click(within(row).getByRole('button', { name: 'Stop' }))
      await screen.findByText(/is told\./)
      expect(asked.some(r => r.method === 'DELETE')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Stop the live preview' }))
      await waitFor(() => expect(asked.some(r => r.method === 'DELETE' && r.path === `/sites/${FP}/live-previews/lp1`)).toBe(true))
    })

    it('says so when HQ cannot be read', async () => {
      fakeServer({ [GET]: { status: 501, body: { error: 'hq_too_old', message: 'HQ does not keep this yet: it is older than this Fleet Console.' } } })
      show()
      expect(await screen.findByText(/older than this Fleet Console/)).toBeTruthy()
    })

    it('reads the form and words the idle stop', () => {
      expect(readSettingForm('', '120')).toEqual({ limit: null, idleMinutes: 120 })
      expect(readSettingForm('3', '4')).toMatch(/from 5 to/)
      expect(idleWords(90)).toBe('90 minutes')
      expect(idleWords(60)).toBe('1 hour')
      expect(idleWords(2880)).toBe('2 days')
    })
  })
})
