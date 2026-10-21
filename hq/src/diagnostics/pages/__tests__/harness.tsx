import React from 'react'
import { vi } from 'vitest'

export type Answers = Record<string, unknown>

/** The operations a page asks for, answered by name; `getUserSettings` says who is looking. */
export const answers: { current: Answers } = { current: {} }
export const calls: { name: string; args: unknown }[] = []

export function useQueryFake(op: string, args?: unknown) {
  calls.push({ name: op, args })
  const data = answers.current[op]
  return { data, isLoading: data === undefined, error: undefined, refetch: vi.fn() }
}

export function layoutFake({ children, breadcrumbs }: { children: React.ReactNode; breadcrumbs: { label: string }[] }) {
  return <div data-testid="layout" data-crumbs={breadcrumbs.map(b => b.label).join(' / ')}>{children}</div>
}

export const asAdmin = () => { answers.current = { getUserSettings: { role: 'ADMIN' }, getFleetAccess: { fleetAdmin: true } } }
export const asOrgAdminOnly = () => { answers.current = { getUserSettings: { role: 'ADMIN' }, getFleetAccess: { fleetAdmin: false } } }
export const asMember = () => { answers.current = { getUserSettings: { role: 'MEMBER' } } }
