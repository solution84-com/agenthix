import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import { useCloudRead } from '../cloud/api'
import { CloudSitePage } from '../cloud/CloudSitePage'
import { useCloudStale } from '../cloud/useCloudStale'
import { useJoin } from '../pages/add/useJoin'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { ScanStep } from '../pages/remote-access/AuthenticatorSetupPage'
import { quietReadPolicy } from '../api/quietRead'
import { fakeServer, featuresAsShipped, type Route } from './fakeServer'
import { FeaturesProvider } from '../features/features'
import { withFeature } from '@agenthix/core/testing'

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  sessionStorage.setItem('csrfToken', 'tok')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forgetCsrfToken(); quietReadPolicy.retries = 0 })

describe('fix 1: a read of the Fleet Console says why in its own words, never "HQ did not answer." @SC-1946', () => {
  it('names the Fleet Console when it does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    render(<DashboardPage />)
    await advance(100)
    expect(screen.getByText('The fleet could not be read')).toBeTruthy()
    expect(screen.getByText('The Fleet Console did not answer.')).toBeTruthy()
    expect(screen.queryByText('HQ did not answer.')).toBeNull()
  })

  it('says the server\'s words for a failure it answered', async () => {
    fakeServer({ 'GET /fleet': { status: 500, body: { error: 'failed', message: 'It broke.' } } })
    render(<DashboardPage />)
    await advance(100)
    expect(screen.getByText('It broke.')).toBeTruthy()
    expect(screen.queryByText('HQ did not answer.')).toBeNull()
  })
})

describe('fix 2: a join whose first poll fails keeps its code and says it in the meta line', () => {
  it('is nothing at first, then "Not up to date" for the meta line, never the block in place', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    const { result } = renderHook(() => useJoin('abc'))
    await advance(1_000)
    expect(result.current.nudge).toBeNull()
    await advance(70_000)
    const { container } = render(<>{result.current.nudge}</>)
    expect(container.textContent).toContain('Not up to date')
    expect(container.querySelector('.py-16')).toBeNull()
  })
})

withFeature('cloud', () => {
  describe('fix 3: a Cloud answer held while a later read fails says "Not up to date"', () => {
    it('keeps the value and, a minute on, offers Try again', async () => {
      let ok = true
      fakeServer({ 'GET /features': featuresAsShipped, 'GET /cloud': () => (ok ? { status: 200, body: { organisation: null } } : { status: 500, body: { error: 'failed', message: 'It broke.' } }) })
      const { result } = renderHook(() => { const read = useCloudRead<{ organisation: null }>('/cloud'); return { read, nudge: useCloudStale(read, 'Cloud') } }, { wrapper: FeaturesProvider })
      await advance(100)
      expect(result.current.read.phase).toBe('ready')
      ok = false
      act(() => result.current.read.reload())
      await advance(100)
      expect(result.current.read.phase).toBe('ready')
      expect(result.current.nudge).toBeNull()
      await advance(61_000)
      const { container } = render(<>{result.current.nudge}</>)
      expect(container.textContent).toMatch(/Not up to date · read \d\d:\d\d/)
      expect(container.textContent).toContain('Try again')
    })
  })
})

describe('fix 4: only a refusal about the value is a field error under the six digits', () => {
  const ask = async (route: Route) => {
    fakeServer({ 'POST /authenticator/check': route })
    render(<ScanStep keyText="KEY" onDone={() => {}} onNotNow={() => {}} />)
    fireEvent.change(screen.getByLabelText('Six-digit code from the app'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check the code' }))
    await advance(100)
  }

  it('a 4xx that is not otherwise coded is under the field, with no dialog', async () => {
    await ask({ status: 422, body: { error: 'wrong_code', message: 'That code does not match.' } })
    expect(screen.getByText('That code does not match.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the Fleet Console not answering is a press that failed: the dialog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    render(<ScanStep keyText="KEY" onDone={() => {}} onNotNow={() => {}} />)
    fireEvent.change(screen.getByLabelText('Six-digit code from the app'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check the code' }))
    await advance(100)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('a 5xx is a press that failed: the dialog', async () => {
    await ask({ status: 500, body: { error: 'failed', message: 'It broke.' } })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

withFeature('cloud', () => {
  describe('fix 5: a failed /cloud read is not followed by "Sign in to Cloud first"', () => {
    it('says only that Cloud could not be read', async () => {
      fakeServer({ 'GET /features': featuresAsShipped, 'GET /cloud': { status: 500, body: { error: 'failed', message: 'It broke.' } } })
      render(<FeaturesProvider><CloudSitePage name="acme-1" /></FeaturesProvider>)
      await advance(100)
      expect(screen.getByText('Cloud could not be read')).toBeTruthy()
      expect(screen.queryByText(/Sign in to Cloud to see this site/)).toBeNull()
    })
  })
})
