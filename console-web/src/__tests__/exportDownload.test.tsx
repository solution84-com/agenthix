import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import { KeyOnce } from '../pages/backups/ExportPanel'
import type { FleetHost } from '../pages/dashboard/types'
import { fakeServer, type Route } from './fakeServer'

const GB = 1000 ** 3
const FP = 'a'.repeat(64)
const EXPORT_ID = 'office-server-20261014T115800Z-export-9f3a1c2b.sealed'
const NOW = new Date()
const MADE = { key: 'AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN', exportId: EXPORT_ID, sizeBytes: 5.2 * GB, night: '2026-10-14', takenAt: NOW.toISOString() }
const HOST = { fingerprint: FP, machineName: 'office-server', siteName: 'office' } as FleetHost
const DOWNLOAD = `/hosts/${FP}/exports/${EXPORT_ID}/download`

let clicked: { href: string; download: string }[]
beforeEach(() => {
  sessionStorage.setItem('csrfToken', 'tok')
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); forgetCsrfToken(); sessionStorage.clear() })

const status = (over: Record<string, unknown>): Route => ({
  status: 200,
  body: { download: { downloadId: 'd1', exportId: EXPORT_ID, machineName: 'office-server', state: 'sending', sizeBytes: 5.2 * GB, sentBytes: 0, problem: null, removedFromMachine: null, ...over } },
})

function show() {
  render(<KeyOnce host={HOST} made={MADE} keepAs="show" now={NOW} onDone={() => {}} pollMs={1} />)
  return screen.getByRole('region', { name: 'The key for this export' })
}

describe('downloading the export @SC-906', () => {
  it('unlocks once the key is stored, then hands the browser the file and says when the machine removed its copy', async () => {
    const answers = [status({ sentBytes: GB }), status({ state: 'done', sentBytes: 5.2 * GB, removedFromMachine: true })]
    const requests = fakeServer({
      [`POST ${DOWNLOAD}`]: { status: 201, body: { downloadId: 'd1', href: '/api/export-downloads/file/link-1' } },
      'GET /export-downloads/d1': () => answers.shift() ?? answers[0] ?? status({ state: 'done', sentBytes: 5.2 * GB, removedFromMachine: true }),
    })
    const key = show()
    expect(within(key).getByText(EXPORT_ID)).toBeTruthy()
    expect(within(key).getByText(/Keep the file and its key apart/)).toBeTruthy()
    expect(within(key).getByText(/office-server removes it a day after it was made/)).toBeTruthy()
    const button = within(key).getByRole('button', { name: 'Download the export' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(within(key).getByRole('checkbox'))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(await within(key).findByRole('button', { name: 'Downloaded' })).toBeTruthy()
    expect(clicked).toEqual([{ href: '/api/export-downloads/file/link-1', download: EXPORT_ID }])
    expect(requests.find(r => r.method === 'POST')?.headers['x-csrf-token']).toBe('tok')
  })

  it('says in words why a download stopped, and offers it again', async () => {
    fakeServer({
      [`POST ${DOWNLOAD}`]: { status: 201, body: { downloadId: 'd1', href: '/api/export-downloads/file/link-1' } },
      'GET /export-downloads/d1': status({ state: 'failed', problem: 'The download stopped: office-server did not answer in time. Download it again.' }),
    })
    const key = show()
    fireEvent.click(within(key).getByRole('checkbox'))
    fireEvent.click(within(key).getByRole('button', { name: 'Download the export' }))
    // The dialog is drawn at the body, outside the key's card.
    expect(await screen.findByText('The download stopped: office-server did not answer in time. Download it again.')).toBeTruthy()
    expect(within(key).getByRole('button', { name: 'Download again' })).toBeTruthy()
  })

  it('says when the export is no longer on the machine', async () => {
    fakeServer({ [`POST ${DOWNLOAD}`]: { status: 404, body: { error: 'not_found', message: 'That machine is not connected to this Fleet Console.' } } })
    const key = show()
    fireEvent.click(within(key).getByRole('checkbox'))
    fireEvent.click(within(key).getByRole('button', { name: 'Download the export' }))
    expect(await screen.findByText('That machine is not connected to this Fleet Console.')).toBeTruthy()
    expect(clicked).toEqual([])
  })
})
