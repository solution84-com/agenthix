import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { nowLine, type NowTone } from './agentNowLines'
import type { AgentFactsData, AgentNowData } from './projectAgentTypes'

const TONE: Record<NowTone, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }

const CARD_WIDTH = 320
const MARGIN = 8

/** A row of the part for where you are: what it says, a count beside it, and where it goes. */
export interface ProfileCardHereRow {
  label: string
  value: string
  onOpen: () => void
}

export interface ProfileCardProps {
  agent: Pick<AgentFactsData, 'name' | 'handle' | 'role'>
  /** The cover's picture, once it can be shown; the card draws a plain band without it. */
  coverSrc: string | null
  avatar: ReactNode
  now: AgentNowData
  projectCount: number
  modelLabel: string
  at: Date
  /** What was tapped: the card opens beside it, and focus returns to it when the card closes. */
  anchor: HTMLElement | null
  /** On a phone the card slides up from the bottom as a sheet instead. */
  mobile: boolean
  /** The part for where you are, under the buttons; left out where there is no place. */
  here?: { heading: string; rows: ProfileCardHereRow[] } | null
  onNewConversation: () => void
  onOpenPlace: () => void
  onClose: () => void
}

/** Beside the anchor, kept on screen: under it when there is room, else over it. */
function beside(anchor: HTMLElement, card: HTMLElement): { top: number; left: number } {
  const a = anchor.getBoundingClientRect()
  const width = card.offsetWidth || CARD_WIDTH
  const height = card.offsetHeight
  const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - width - MARGIN))
  const below = a.bottom + 6
  const top = below + height + MARGIN <= window.innerHeight ? below : Math.max(MARGIN, a.top - height - 6)
  return { top, left }
}

/**
 * An agent's card (every screen reviewed spec §3): who it is, what it is doing now, how many projects, its model;
 * New conversation and Open its place, and a part for where you are. Opens beside what was tapped, like a menu;
 * on a phone it is a sheet from the bottom. Escape and a click outside close it.
 */
export function ProfileCard(p: ProfileCardProps) {
  const card = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [raised, setRaised] = useState(false)

  useLayoutEffect(() => {
    if (p.mobile || !p.anchor || !card.current) return
    setPosition(beside(p.anchor, card.current))
  }, [p.mobile, p.anchor, p.here])

  useEffect(() => {
    if (!p.mobile) return
    const frame = requestAnimationFrame(() => setRaised(true))
    return () => cancelAnimationFrame(frame)
  }, [p.mobile])

  useEffect(() => {
    primary.current?.focus()
    const { anchor, onClose } = p
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onOutside = (e: PointerEvent) => {
      const target = e.target as Node
      if (card.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onMove = () => { if (anchor && card.current) setPosition(beside(anchor, card.current)) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('resize', onMove)
      if (anchor?.isConnected) anchor.focus()
    }
  }, [p.onClose, p.anchor])

  const line = nowLine(p.now, p.at)
  const body = (
    <>
      <div className="h-20 bg-accent-subtle bg-cover bg-center" style={p.coverSrc ? { backgroundImage: `url(${p.coverSrc})` } : undefined} />
      <div className="space-y-3 px-5 pb-5">
        <div className="-mt-7 w-fit rounded-xl border-2 border-surface-1">{p.avatar}</div>
        <div>
          <p className="text-h3 font-semibold text-text-primary">{p.agent.name}</p>
          <p className="text-small text-text-muted">{p.agent.role ? `${p.agent.role} · ` : ''}@{p.agent.handle}</p>
        </div>
        <p className="text-small text-text-secondary">
          <span className={`font-medium ${TONE[line.tone]}`}>{line.label}</span>
          {line.detail && <> · {line.detail}</>}
        </p>
        <p className="text-small text-text-muted">
          {p.projectCount === 0 ? 'In no project yet' : `In ${p.projectCount} ${p.projectCount === 1 ? 'project' : 'projects'}`} · {p.modelLabel}
        </p>
        <div className="flex gap-2 pt-1">
          <button ref={primary} type="button" onClick={p.onNewConversation} className="rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-on-accent hover:bg-accent-hover">New conversation</button>
          <button type="button" onClick={p.onOpenPlace} className="rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-hover">Open its place</button>
        </div>
        {p.here && p.here.rows.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <p className="text-micro font-medium uppercase tracking-wide text-text-muted">{p.here.heading}</p>
            <ul className="mt-1">
              {p.here.rows.map(row => (
                <li key={row.label}>
                  <button type="button" onClick={row.onOpen} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-body text-text-primary hover:bg-surface-hover">
                    <span>{row.label}</span>
                    <span className="flex items-center gap-1 text-small text-text-muted">{row.value}<span aria-hidden>›</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )

  if (p.mobile) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-scrim" onClick={p.onClose} data-testid="profile-card-scrim" />
        <div
          ref={card}
          role="dialog"
          aria-label={`${p.agent.name}, profile`}
          className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-2xl border border-border bg-surface-1 shadow-2xl transition-transform duration-200 ${raised ? 'translate-y-0' : 'translate-y-full'}`}
        >
          {body}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={`${p.agent.name}, profile`}
      style={{ position: 'fixed', width: CARD_WIDTH, top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      className="z-50 max-h-[calc(100vh-16px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-surface-1 shadow-2xl"
    >
      {body}
    </div>
  )
}
