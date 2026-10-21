import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// Lets a page tell the sidebar which top-level section it really belongs to, when the
// URL alone can't say. Example: a project-owned workspace lives at /workspaces/:id, but
// conceptually sits under the project — so its detail page declares { projectKey } and the
// sidebar highlights that project instead of the global Workspaces item.
//
// The override is keyed to the pathname it applies to: the sidebar ignores it unless it
// matches the current location, so it self-clears on navigation (no stale highlight, no
// unmount-cleanup races).
export interface ActiveNavOverride {
  pathname: string
  section?: 'workspaces' | null
  projectKey?: string | null
}

interface ActiveNavValue {
  override: ActiveNavOverride | null
  setActiveNav: (o: ActiveNavOverride) => void
}

const ActiveNavContext = createContext<ActiveNavValue>({ override: null, setActiveNav: () => {} })

export function ActiveNavProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<ActiveNavOverride | null>(null)
  const setActiveNav = useCallback((o: ActiveNavOverride) => {
    setOverride(prev =>
      prev && prev.pathname === o.pathname && prev.section === o.section && prev.projectKey === o.projectKey
        ? prev
        : o,
    )
  }, [])
  return <ActiveNavContext.Provider value={{ override, setActiveNav }}>{children}</ActiveNavContext.Provider>
}

export function useActiveNav() {
  return useContext(ActiveNavContext)
}
