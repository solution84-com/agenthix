import { useState } from 'react'
import { Server } from 'lucide-react'
import { SearchField } from '@agenthix/ui/primitives'
import { findSites, isAt, sitePath, type MenuSite } from './menu'
import { MenuEntry } from './MenuEntry'

/**
 * The menu's middle, the part that scrolls: every site, however many, each with its state. HQ's machine's site comes
 * first; it is a site like the others, not HQ, so it is not drawn under HQ.
 */
export function SitesMenu({ sites, path, collapsed }: { sites: MenuSite[]; path: string; collapsed: boolean }) {
  const [find, setFind] = useState('')
  const shown = findSites(sites, collapsed ? '' : find)
  return (
    <div className={`-mx-1 mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border-subtle px-1 pt-2 ${collapsed ? 'items-center' : ''}`}>
      {!collapsed && (
        <>
          <h2 className="px-[9px] pb-1.5 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">Sites</h2>
          <SearchField label="Find a site" value={find} onChange={setFind} className="mb-1.5 min-w-0" />
        </>
      )}
      <ul aria-label="Sites" className="flex flex-col gap-0.5">
        {shown.map(s => (
          <li key={s.fingerprint}>
            <MenuEntry
              to={sitePath(s.fingerprint)}
              label={s.name}
              icon={Server}
              current={isAt(sitePath(s.fingerprint), path)}
              collapsed={collapsed}
              state={{ dot: s.dot, words: s.hq ? `HQ's site · ${s.state}` : s.state }}
            />
          </li>
        ))}
      </ul>
      {!collapsed && find.trim() && shown.length === 0 && <p className="px-[9px] py-1.5 text-micro text-text-muted">{`No site matches "${find.trim()}".`}</p>}
    </div>
  )
}
