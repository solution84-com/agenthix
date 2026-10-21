import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NavDrawerValue {
  open: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}

const NavDrawerContext = createContext<NavDrawerValue>({
  open: false, openDrawer: () => {}, closeDrawer: () => {}, toggleDrawer: () => {},
})

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openDrawer = useCallback(() => setOpen(true), [])
  const closeDrawer = useCallback(() => setOpen(false), [])
  const toggleDrawer = useCallback(() => setOpen(o => !o), [])
  return (
    <NavDrawerContext.Provider value={{ open, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </NavDrawerContext.Provider>
  )
}

export function useNavDrawer() {
  return useContext(NavDrawerContext)
}
