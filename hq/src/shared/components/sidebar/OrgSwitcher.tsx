import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { useQuery, getOrgIdentity, getMyCloudSignIn } from 'wasp/client/operations'
import { AuthedImg } from '../AuthedImg'
import { CLOUD_PATHS, cloudLinkOut } from '../../cloudLinks'

const itemClass = 'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-small text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary'

function OrgPicture({ name, src }: { name: string; src: string | null }) {
  return (
    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-subtle text-small font-semibold text-accent">
      {name.trim().charAt(0).toUpperCase() || '?'}
      {src && <AuthedImg src={src} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  )
}

/**
 * The organisation switcher at the top of hq's menu, for every member. It lists only this organisation: hq never
 * learns the person's others. Not connected, it says other organisations need Agenthix Cloud; connected and linked,
 * *Switch organisation…* opens the person's switcher on Cloud; *Start your own organisation* is always there.
 */
export function OrgSwitcher({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { data: org } = useQuery(getOrgIdentity)
  const { data: cloud } = useQuery(getMyCloudSignIn)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const r = trigger.current?.getBoundingClientRect()
    if (r) setAt(collapsed ? { left: r.right + 8, top: r.top } : { left: r.left, top: r.bottom + 4 })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, collapsed])

  if (!org || !org.id) return null
  const settings = (words: string): ReactNode => (
    <Link to="/settings" className={`${itemClass} text-accent`} onClick={() => { setOpen(false); onNavigate?.() }}>
      <span aria-hidden>›</span>{words}
    </Link>
  )
  const origin = cloud?.cloudOrigin ?? null
  const out = (path: string, from: string) => cloudLinkOut(origin, path, { from, returnPath: pathname })
  const switchUrl = cloud?.connected && cloud.linked ? out(CLOUD_PATHS.switch, 'hq-switcher') : null
  const startUrl = out(CLOUD_PATHS.start, 'hq-switcher-start')

  return (
    <div className={collapsed ? 'flex justify-center px-2 pb-1' : 'px-3 pb-1'}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${org.name}, organisations`}
        title={collapsed ? org.name : undefined}
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 rounded-lg transition-colors hover:bg-surface-hover ${collapsed ? 'p-1' : 'w-full px-2 py-1.5'}`}
      >
        <OrgPicture name={org.name} src={org.avatarUrl} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-body text-text-primary">{org.name}</span>
            <span aria-hidden className="text-text-muted">⇅</span>
          </>
        )}
      </button>
      {open && at && createPortal(
        <div ref={box} role="menu" aria-label="Organisations" style={{ left: at.left, top: at.top }} className="fixed z-50 w-64 rounded-lg border border-border bg-surface-1 p-1 shadow-pop">
          <p className="px-2.5 pb-1 pt-1.5 text-micro font-medium uppercase tracking-wide text-text-muted">Organisations</p>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-body text-text-primary">
            <OrgPicture name={org.name} src={org.avatarUrl} />
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            <span aria-label="This organisation">✓</span>
          </div>
          {cloud && !cloud.connected && (
            <>
              <p className="px-2.5 py-1.5 text-small text-text-muted">
                Other organisations need Agenthix Cloud: with it, one Agenthix account signs you in to every organisation you belong to, and you switch between them here. {org.name}'s HQ is not connected to it.
              </p>
              {settings('Ask for it in Settings › Sign-in')}
            </>
          )}
          {cloud?.connected && !cloud.linked && (
            <>
              <p className="px-2.5 py-1.5 text-small text-text-muted">Link your Agenthix account to switch between the organisations you belong to.</p>
              {settings('Link it in Settings › Sign-in')}
            </>
          )}
          {switchUrl && <a role="menuitem" href={switchUrl} className={itemClass}><span aria-hidden>⇄</span>Switch organisation… ↗</a>}
          {startUrl && <a role="menuitem" href={startUrl} className={`${itemClass} border-t border-border-subtle`}><span aria-hidden>＋</span>Start your own organisation ↗</a>}
        </div>,
        document.body,
      )}
    </div>
  )
}
