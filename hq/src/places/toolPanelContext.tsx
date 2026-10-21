import { createContext, useContext, type ReactNode } from 'react'

const InToolPanel = createContext(false)

/**
 * Marks what is drawn as a tool in a place's section. Today's project pages are shown there as they are; their
 * `ProjectLayout` reads this and draws only the page's content, not a second shell.
 */
export function ToolPanelBoundary({ children }: { children: ReactNode }) {
  return <InToolPanel.Provider value={true}>{children}</InToolPanel.Provider>
}

export function useInToolPanel(): boolean {
  return useContext(InToolPanel)
}
