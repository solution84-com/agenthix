import { afterEach, describe, expect, it, vi } from 'vitest'
import { SERVICE_PORTS } from '@agenthix/core'
import { hqOrigin, loggablePath, webClientOrigin } from '../hqOrigin'

afterEach(() => vi.unstubAllEnvs())

describe('the origins hq allows', () => {
  it('falls back to hq\'s own web port, not a literal of another tool\'s', () => {
    vi.stubEnv('HQ_ORIGIN', undefined)
    vi.stubEnv('WASP_WEB_CLIENT_URL', undefined)
    expect(hqOrigin()).toBe(`http://localhost:${SERVICE_PORTS.hq.web}`)
    expect(webClientOrigin()).toBe(`http://localhost:${SERVICE_PORTS.hq.web}`)
  })

  it('uses what is set', () => {
    vi.stubEnv('HQ_ORIGIN', 'https://hq.example.com')
    expect(hqOrigin()).toBe('https://hq.example.com')
  })
})

describe('loggablePath', () => {
  it('drops the query string, where a file link names a member\'s file', () => {
    expect(loggablePath('/file-link?path=/files/task/1/2/payroll.xlsx')).toBe('/file-link')
    expect(loggablePath('/operations/get-agents')).toBe('/operations/get-agents')
  })
})
