import { setSearchParams, useSearchParam } from '../router'

/**
 * The panel open beside the page, kept in the address as HQ keeps its own, written in place so opening one adds no
 * history entry: the notices (`?panel=notices`), or *Plan maintenance* (`?panel=maintenance`, with `which` — `hq` or a
 * machine's fingerprint — and `what`, the kind chosen, and for a restore `night`, the backup chosen). Leaving the page drops the parameters, and so closes the panel:
 * something in the panel that navigates just navigates, and never closes it after, which would write the old page's
 * address back.
 */
export type ShellPanel = 'notices' | 'maintenance'

const PANELS: readonly ShellPanel[] = ['notices', 'maintenance']
const CLOSED = { panel: null, which: null, what: null, night: null }

export function useShellPanel() {
  const asked = useSearchParam('panel')
  const open: ShellPanel | null = PANELS.find(p => p === asked) ?? null
  return {
    open,
    openNotices: () => setSearchParams({ ...CLOSED, panel: 'notices' }),
    toggleNotices: () => setSearchParams(open === 'notices' ? CLOSED : { ...CLOSED, panel: 'notices' }),
    /** *Plan maintenance*, with HQ or a site already chosen, and what to do when that is known too. */
    openMaintenance: (which: string | null = null, what: string | null = null) => setSearchParams({ panel: 'maintenance', which, what, night: null }),
    /** *Restore a backup* in *Plan maintenance*, the night already chosen (`night`, the backup's id). */
    openRestore: (which: string, night: string) => setSearchParams({ panel: 'maintenance', which, what: 'restore', night }),
    close: () => setSearchParams(CLOSED),
  }
}
