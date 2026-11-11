/**
 * The notices behind the bell (board *Notices*): what HQ keeps for the person signed in about the fleet — a machine
 * that left or has not been heard from, an action announced to every fleet admin, the role given or removed. HQ keeps
 * them; the Fleet Console asks for them (`GET /api/notices`), every minute while a screen is open, and the bell's panel
 * draws them. Each stays until it is dismissed, or, for a machine's, until the machine is back or removed. They are an
 * inbox, not the record: *Activity* is the record, and shows none of them.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { becauseOf, quietly } from '../api/quietRead'
import type { FleetNoticeKind } from '@agenthix/core'
import { api, ApiError } from '../api/client'
import { HOME, HQ_PATH, sitePath } from './menu'

/** What a notice opens, as the server works it out (console/src/http/routes/noticeTarget.ts). */
export type NoticeTarget =
  | { page: 'site' | 'hq'; fingerprint: string }
  /** A move by its id: its progress while under way, its outcome once over. */
  | { page: 'move'; fingerprint: string; moveId: string; hq: boolean }
  | { page: 'fleetAdmins' }
  | { page: 'dashboard' }

/** A notice as the server gives it: a machine's names the machine by its fingerprint, when it is one of ours. */
export type FleetNoticeView = {
  id: string
  kind: FleetNoticeKind
  title: string
  body: string
  at: string
  dismissible: boolean
  fingerprint: string | null
  /** Absent from a Fleet Console older than the panel: the notice then opens nothing. */
  target?: NoticeTarget
}

export const NOTICES_REFRESH_MS = 60_000

/** The page a notice opens: the thing it is about. */
export function targetPath(t: NoticeTarget | undefined): string | null {
  if (!t) return null
  switch (t.page) {
    case 'site':
      return sitePath(t.fingerprint)
    case 'hq':
      return HQ_PATH
    case 'move':
      return `${t.hq ? HQ_PATH : sitePath(t.fingerprint)}/move?move=${encodeURIComponent(t.moveId)}`
    case 'fleetAdmins':
      return '/fleet-admins'
    case 'dashboard':
      return HOME
  }
}

let current: FleetNoticeView[] = []
/** How the last read went: when it last worked, and the failure of the one after, once its retries are spent. */
let health: { readAt: Date | null; error: unknown } = { readAt: null, error: null }
const listeners = new Set<() => void>()
/** Screens drawing the notices; when the last goes (signed out), the list is forgotten. */
let drawing = 0

function set(list: FleetNoticeView[]): void {
  current = list
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Asks again now. A failed read keeps the last list: HQ away, or older than notices, is not "nothing needs you". */
export async function refreshNotices(): Promise<void> {
  try {
    const { notices } = await quietly(() => api<{ notices: FleetNoticeView[] }>('/notices'))
    health = { readAt: new Date(), error: null }
    set(notices)
  } catch (error) {
    // An HQ older than notices keeps none: that is an answer (nothing to list), not a failure to read.
    if (error instanceof ApiError && error.status === 501) { health = { readAt: new Date(), error: null }; return }
    // The bell says nothing; the panel says so, in its head, once the list is over a minute old.
    health = { ...health, error }
    for (const listener of [...listeners]) listener()
  }
}

/** Puts a notice away in HQ, then reads the list again; throws HQ's refusal for the screen to show. */
export async function dismissNotice(id: string): Promise<void> {
  await api(`/notices/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
  set(current.filter(n => n.id !== id))
  await refreshNotices()
}

/** More notices than this are dismissed all at once only after the person confirms in words. */
export const DISMISS_ALL_CONFIRM_ABOVE = 3

/**
 * Puts the notices away in HQ, one request each through the same route, then reads the list once. Stops at the first
 * refusal, after reading the list again so the screen shows what is left, and throws it for the screen to show.
 */
export async function dismissNotices(ids: string[]): Promise<void> {
  try {
    for (const id of ids) {
      await api(`/notices/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
      set(current.filter(n => n.id !== id))
    }
  } finally {
    await refreshNotices()
  }
}

/** The notices, read now and every minute while a screen that draws them is open. */
export function useFleetNotices(refreshMs = NOTICES_REFRESH_MS): FleetNoticeView[] {
  const list = useSyncExternalStore(subscribe, () => current)
  useEffect(() => {
    drawing++
    void refreshNotices()
    const timer = window.setInterval(() => void refreshNotices(), refreshMs)
    return () => {
      window.clearInterval(timer)
      if (--drawing === 0) { current = []; health = { readAt: null, error: null } }
    }
  }, [refreshMs])
  return list
}

/** The panel's say on the list's read, quietly: nothing until the list is over two refreshes old, or never came. */
export function useNoticesRead() {
  const h = useSyncExternalStore(subscribe, () => health)
  const list = useSyncExternalStore(subscribe, () => current)
  return useBackgroundRead(
    { data: h.readAt ? list : undefined, error: h.error, dataUpdatedAt: h.readAt?.getTime() ?? 0, refetch: () => { void refreshNotices() } },
    { what: 'The notices', pollMs: NOTICES_REFRESH_MS, because: becauseOf },
  )
}
