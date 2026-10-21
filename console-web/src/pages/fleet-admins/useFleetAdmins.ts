import { useCallback, useEffect, useRef, useState } from 'react'
import { BRANDING, type HqAccount } from '@agenthix/core'
import { api } from '../../api/client'
import { fleetAdmins, type FleetAdmin } from '../../api/session'

/** Who holds the role, as HQ lists it; read when the screen opens and after each change. */
export function useFleetAdmins() {
  const [admins, setAdmins] = useState<FleetAdmin[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(() => {
    fleetAdmins()
      .then(list => { if (alive.current) { setAdmins(list); setProblem(null) } })
      .catch((err: unknown) => { if (alive.current) setProblem(err instanceof Error ? err.message : String(err)) })
  }, [])
  useEffect(reload, [reload])

  return { admins, problem, reload }
}

export async function findAccount(username: string): Promise<HqAccount | null> {
  const { account } = await api<{ account: HqAccount | null }>(`/fleet-admins/find?username=${encodeURIComponent(username)}`)
  return account
}

export function giveRole(userId: string): Promise<unknown> {
  return api('/fleet-admins', { method: 'POST', body: { userId } })
}

export function removeRole(userId: string): Promise<unknown> {
  return api(`/fleet-admins/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

/** "13 Oct", with the year when it is not this year's. */
export function dayOf(iso: string, now = new Date()): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

/** "Acme Robotics'", "Fernhill's". */
export const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`)

/** The command a machine admin of HQ's machine runs to give the role, here or when nobody holds it. */
export const GIVE_COMMAND = `${BRANDING.cliCommand} hq fleet-admin <username>`
