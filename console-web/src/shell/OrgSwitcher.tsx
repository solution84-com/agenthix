import { ChevronsUpDown, Check, Plus, Repeat } from 'lucide-react'
import { useSessionDetails } from '../auth/useSessionDetails'
import { useCloudRead } from '../cloud/api'
import { cloudLinkOut } from '../cloud/linkOut'
import type { CloudSectionView } from '../cloud/platform'
import { CLOUD } from '../cloud/words'
import { Link } from '../router'
import { usePopover } from './usePopover'

const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-small text-text-primary hover:bg-surface-hover'

/**
 * The organisation switcher in the menu head (board *Organisation switcher*): this organisation only, because HQ never
 * learns the person's other ones. Not connected, it says what Cloud would give and where to connect; connected, the
 * way to the person's own switcher on Cloud. It holds *Start your own organisation* either way.
 */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { open, setOpen, toggle, ref } = usePopover<HTMLDivElement>()
  const org = useSessionDetails()?.hq?.organisationName ?? null
  const read = useCloudRead<CloudSectionView>('/cloud')
  if (read.phase !== 'ready') return null
  const view = read.value
  const name = org ?? 'This organisation'
  const connected = view.organisation !== null
  const linked = view.account !== null || !!view.runByCloud
  const start = cloudLinkOut(view.cloudUrl, { task: 'start-organisation', from: 'fleet-console-menu' })
  const switchTo = cloudLinkOut(view.cloudUrl, { task: 'switch', from: 'fleet-console-menu' })
  const out = { target: '_blank', rel: 'noopener noreferrer' }
  return (
    <div ref={ref} className="relative self-stretch">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Organisation: ${name}`}
        title={collapsed ? name : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-surface-hover ${collapsed ? 'justify-center' : ''}`}
      >
        <span aria-hidden className="grid size-5 flex-none place-items-center rounded-md bg-selected text-[10px] font-bold text-text-secondary">{name[0]?.toUpperCase()}</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-small font-semibold text-text-primary">{name}</span>
            <ChevronsUpDown size={13} aria-hidden className="flex-none text-text-muted" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" aria-label="Organisations" className={`absolute top-full z-20 mt-1.5 w-60 rounded-xl border border-border bg-surface-1 p-1.5 shadow-pop ${collapsed ? 'left-0' : 'inset-x-0 w-auto'}`}>
          <p className="px-2.5 pt-1 pb-1 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">Organisations</p>
          <p className={`${item} font-semibold`}><span className="min-w-0 flex-1 truncate">{name}</span><Check size={14} aria-hidden /></p>
          <div className="border-t border-border-subtle px-2.5 py-2 text-micro text-text-secondary">
            {!connected ? (
              <>
                <p>Other organisations need <b className="font-semibold text-text-primary">{CLOUD}</b>, so that one account signs you in to each. {name}&apos;s HQ is not connected to it — you can connect it on HQ&apos;s page.</p>
                <Link to="/hq" onClick={() => setOpen(false)} className="mt-1.5 inline-block font-semibold text-accent hover:underline">HQ › {CLOUD}</Link>
              </>
            ) : linked ? (
              switchTo && <a role="menuitem" href={switchTo} {...out} className={`${item} -mx-2.5 -my-2`}><Repeat size={14} aria-hidden className="text-text-muted" />Switch organisation… ↗</a>
            ) : (
              <>
                <p>Link your Agenthix account to switch between the organisations you belong to.</p>
                <Link to="/account" onClick={() => setOpen(false)} className="mt-1.5 inline-block font-semibold text-accent hover:underline">Link it in Your account</Link>
              </>
            )}
          </div>
          {start && (
            <a role="menuitem" href={start} {...out} className={`${item} border-t border-border-subtle`}><Plus size={14} aria-hidden className="text-text-muted" />Start your own organisation ↗</a>
          )}
        </div>
      )}
    </div>
  )
}
