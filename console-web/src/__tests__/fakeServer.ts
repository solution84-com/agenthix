import { vi } from 'vitest'
import { FEATURE_FLAG_NAMES, isFeatureOn } from '@agenthix/core'

export type Route = { status: number; body?: unknown }
export type Request = { method: string; path: string; headers: Record<string, string>; body: unknown }

/** A stand-in for the Fleet Console's API: answers by "METHOD /path", and records what it was asked. */
export function fakeServer(routes: Record<string, Route | ((req: Request) => Route)>) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const req: Request = {
      method: init.method ?? 'GET',
      path: url.replace(/^\/api/, ''),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    requests.push(req)
    const route = routes[`${req.method} ${req.path}`]
    const { status, body } = typeof route === 'function' ? route(req) : route ?? { status: 404, body: { error: 'not_found', message: 'No such request.' } }
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }))
  return requests
}

export const STATUS_OK = { machineName: 'hq-box', version: '0.2.0', hq: 'connected', fleetAdmins: 'some' }
export const SAM = { id: 'u1', name: 'Sam Rivera' }

/** `GET /fleet` answering with these machines, on HQ's machine `hq-box`. */
export const fleetRoute = (hosts: unknown[], hq: { organisationName: string | null; address: string | null } | null = null): Route => ({
  status: 200,
  body: { console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: 'connected' }, hq, hosts, disconnected: [] },
})

/**
 * `GET /features` as the Fleet Console's server answers it from hq: core's rule with no organisation switch, so each
 * flag is as shipped, and a feature's own tests switch theirs on with `withFeature` (adr-0172).
 */
export const featuresAsShipped = (): Route => ({
  status: 200,
  body: { on: FEATURE_FLAG_NAMES.filter(flag => isFeatureOn(flag, { env: process.env, switches: {} })) },
})
